"use client";

import type { Project, ProjectGraph } from "@aigc-flow/shared";
import {
  addEdge,
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Viewport,
} from "@xyflow/react";
import { useCallback, useRef } from "react";
import { useGraphAutosave } from "@/hooks/use-graph-autosave";
import { useCanvasShortcuts, useGraphHistory } from "@/hooks/use-graph-history";
import { CanvasToolbar } from "./canvas-toolbar";
import { type NodeKind, NodePalette } from "./node-palette";
import "@xyflow/react/dist/style.css";

const KIND_LABELS: Record<NodeKind, string> = {
  input: "输入",
  default: "处理",
  output: "输出",
};

const PASTE_OFFSET = 40;

type CanvasEditorProps = {
  project: Project;
  initialNodes: Node[];
  initialEdges: Edge[];
  initialViewport: Viewport;
  initialGraph: ProjectGraph;
};

export function CanvasEditor({
  project,
  initialNodes,
  initialEdges,
  initialViewport,
  initialGraph,
}: CanvasEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition, getViewport } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });

  const history = useGraphHistory({ nodes: initialNodes, edges: initialEdges });
  const { status } = useGraphAutosave({
    projectId: project.id,
    nodes,
    edges,
    getViewport,
    initialGraph,
  });

  /** 一次完整操作结束，把结果推进历史 */
  const commitNow = useCallback(
    (nextNodes: Node[], nextEdges: Edge[]) =>
      history.commit({ nodes: nextNodes, edges: nextEdges }),
    [history],
  );

  const applySnapshot = useCallback(
    (snapshot: { nodes: Node[]; edges: Edge[] } | null) => {
      if (!snapshot) return;
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
    },
    [setNodes, setEdges],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (connection.source === connection.target) return;
      // 新状态必须在 updater 外面算：updater 里做副作用在 StrictMode 下会跑两次，
      // 历史栈会被塞进重复项，表现为「撤销要按两下才动一次」
      const next = addEdge(connection, edges);
      setEdges(next);
      commitNow(nodes, next);
    },
    [setEdges, commitNow, nodes, edges],
  );

  const handleAddNode = useCallback(
    (kind: NodeKind) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
        : { x: 0, y: 0 };

      const next: Node[] = [
        ...nodes,
        {
          id: crypto.randomUUID(),
          type: kind,
          position: {
            x: center.x - 75 + (Math.random() - 0.5) * 80,
            y: center.y - 20 + (Math.random() - 0.5) * 80,
          },
          data: { label: `${KIND_LABELS[kind]}节点` },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        },
      ];
      setNodes(next);
      commitNow(next, edges);
    },
    [screenToFlowPosition, setNodes, commitNow, nodes, edges],
  );

  const handleRenameNode = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const input = window.prompt("节点名称", String(node.data?.label ?? ""));
      if (input === null) return;
      const label = input.trim();
      if (!label) return;

      const next = nodes.map((item) =>
        item.id === node.id ? { ...item, data: { ...item.data, label } } : item,
      );
      setNodes(next);
      commitNow(next, edges);
    },
    [setNodes, commitNow, nodes, edges],
  );

  const handleCopy = useCallback(() => {
    const selectedNodes = nodes.filter((node) => node.selected);
    if (selectedNodes.length === 0) return;

    const ids = new Set(selectedNodes.map((node) => node.id));
    clipboardRef.current = {
      nodes: selectedNodes,
      // 只带上两端都在选区内的连线，否则粘出来会指向不存在的节点
      edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    };
  }, [nodes, edges]);

  const handlePaste = useCallback(() => {
    const { nodes: copiedNodes, edges: copiedEdges } = clipboardRef.current;
    if (copiedNodes.length === 0) return;

    const idMap = new Map(copiedNodes.map((node) => [node.id, crypto.randomUUID()]));
    const pastedNodes: Node[] = copiedNodes.map((node) => ({
      ...node,
      id: idMap.get(node.id) ?? crypto.randomUUID(),
      position: { x: node.position.x + PASTE_OFFSET, y: node.position.y + PASTE_OFFSET },
      selected: true,
    }));
    const pastedEdges: Edge[] = copiedEdges.map((edge) => ({
      ...edge,
      id: crypto.randomUUID(),
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
    }));

    // 原选区取消选中，让粘贴出来的这批成为新的选区，可以连续 Cmd+V
    const nextNodes = [...nodes.map((node) => ({ ...node, selected: false })), ...pastedNodes];
    const nextEdges = [...edges, ...pastedEdges];
    setNodes(nextNodes);
    setEdges(nextEdges);
    clipboardRef.current = { nodes: pastedNodes, edges: pastedEdges };
    commitNow(nextNodes, nextEdges);
  }, [nodes, edges, setNodes, setEdges, commitNow]);

  useCanvasShortcuts({
    onUndo: () => applySnapshot(history.undo()),
    onRedo: () => applySnapshot(history.redo()),
    onCopy: handleCopy,
    onPaste: handlePaste,
  });

  return (
    <div className="flex h-dvh flex-col">
      <CanvasToolbar
        project={project}
        nodeCount={nodes.length}
        edgeCount={edges.length}
        saveStatus={status}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={() => applySnapshot(history.undo())}
        onRedo={() => applySnapshot(history.redo())}
      />

      <div className="flex min-h-0 flex-1">
        <NodePalette onAdd={handleAddNode} />

        <div ref={wrapperRef} className="min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onNodeDoubleClick={handleRenameNode}
            // 拖动过程中会连发几十次 position change，只在拖完才入栈，
            // 否则按一次 Cmd+Z 只会把节点挪回一个像素
            onNodeDragStop={() => commitNow(nodes, edges)}
            onNodesDelete={() => commitNow(nodes, edges)}
            onEdgesDelete={() => commitNow(nodes, edges)}
            defaultViewport={initialViewport}
            minZoom={0.2}
            maxZoom={2}
            deleteKeyCode={["Backspace", "Delete"]}
            multiSelectionKeyCode={["Meta", "Shift"]}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
