"use client";

import {
  MEDIA_NODE_TYPE,
  type MediaNodeData,
  type Project,
  type ProjectGraph,
} from "@aigc-flow/shared";
import {
  addEdge,
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Viewport,
} from "@xyflow/react";
import { useTheme } from "next-themes";
import { type DragEvent, useCallback, useRef } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGraphAutosave } from "@/hooks/use-graph-autosave";
import { useCanvasShortcuts, useGraphHistory } from "@/hooks/use-graph-history";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { CanvasActionGroup, CanvasInfoGroup } from "./canvas-toolbar";
import { MediaNode } from "./media-node";
import { type NodeKind, NodePalette } from "./node-palette";
import "@xyflow/react/dist/style.css";

const KIND_LABELS: Record<NodeKind, string> = {
  input: "输入",
  default: "处理",
  output: "输出",
};

const PASTE_OFFSET = 40;

// 必须定义在组件外：每次 render 都新建对象会让 React Flow 反复重建所有节点
const NODE_TYPES = { [MEDIA_NODE_TYPE]: MediaNode };

type CanvasEditorProps = {
  project: Project;
  initialNodes: Node[];
  initialEdges: Edge[];
  initialViewport: Viewport;
  initialGraph: ProjectGraph;
  onRename: (name: string) => Promise<void>;
};

export function CanvasEditor({
  project,
  initialNodes,
  initialEdges,
  initialViewport,
  initialGraph,
  onRename,
}: CanvasEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition, getViewport } = useReactFlow();
  // React Flow 的节点 / 控制条 / 小地图有自己一套 CSS 变量，不吃我们的 .dark，
  // 必须显式把主题传给它的 colorMode，否则暗色下节点是白底白字，完全看不见
  const { resolvedTheme } = useTheme();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });
  // 上传是异步的，回调里不能用闭包捕获的 nodes/edges（可能已经过期好几轮）
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

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

  /** 上传占位节点入场：一次性放上去并入历史栈 */
  const handleUploadNodesCreated = useCallback(
    (created: Node[]) => {
      const next = [...nodesRef.current, ...created];
      setNodes(next);
      commitNow(next, edgesRef.current);
    },
    [setNodes, commitNow],
  );

  /**
   * 上传完成 / 失败时回填。
   * 用 setNodes 的函数式写法读最新值：上传异步，回调触发时闭包里的 nodes 早过期了。
   * 这里不入历史栈 —— 回填是上传的结果，不是用户的一次操作，
   * 否则按 Cmd+Z 会把节点退回"上传中"这种没意义的状态。
   */
  const handleUploadNodeSettled = useCallback(
    (nodeId: string, patch: Partial<MediaNodeData>) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...patch } } : node,
        ),
      );
    },
    [setNodes],
  );

  const startUpload = useMediaUpload({
    onNodesCreated: handleUploadNodesCreated,
    onNodeSettled: handleUploadNodeSettled,
  });

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;

      event.preventDefault();
      const origin = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      startUpload(files, { x: origin.x - 112, y: origin.y - 80 });
    },
    [screenToFlowPosition, startUpload],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    // 不 preventDefault 的话浏览器会把文件当成导航，整个页面被图片替换掉
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  /** 底部工具条的上传按钮：文件落在当前视口中心 */
  const handlePickFiles = useCallback(
    (files: File[]) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
        : { x: 0, y: 0 };
      startUpload(files, { x: center.x - 112, y: center.y - 80 });
    },
    [screenToFlowPosition, startUpload],
  );

  useCanvasShortcuts({
    onUndo: () => applySnapshot(history.undo()),
    onRedo: () => applySnapshot(history.redo()),
    onCopy: handleCopy,
    onPaste: handlePaste,
  });

  return (
    <TooltipProvider delayDuration={200}>
      {/* 画布铺满整个视口，所有控件都以浮层叠在上面，最大化可用画布面积 */}
      {/* role=application：这是个有自己快捷键的编辑器，要让屏幕阅读器把按键放行给页面 */}
      <div
        ref={wrapperRef}
        className="h-dvh w-full"
        role="application"
        aria-label="节点画布，可将图片、视频、音频文件拖入此处上传"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
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
          nodeTypes={NODE_TYPES}
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          defaultViewport={initialViewport}
          minZoom={0.2}
          maxZoom={2}
          deleteKeyCode={["Backspace", "Delete"]}
          multiSelectionKeyCode={["Meta", "Shift"]}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />

          <Panel position="top-left">
            <CanvasInfoGroup
              project={project}
              nodeCount={nodes.length}
              edgeCount={edges.length}
              saveStatus={status}
              onRename={onRename}
            />
          </Panel>

          <Panel position="top-right">
            <CanvasActionGroup />
          </Panel>

          <Panel position="bottom-center">
            <NodePalette
              onAdd={handleAddNode}
              onPickFiles={handlePickFiles}
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onUndo={() => applySnapshot(history.undo())}
              onRedo={() => applySnapshot(history.redo())}
            />
          </Panel>

          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </TooltipProvider>
  );
}
