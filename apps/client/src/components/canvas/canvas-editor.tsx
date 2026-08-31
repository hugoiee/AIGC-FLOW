"use client";

import {
  DEFAULT_IMAGE_GEN_DATA,
  GROUP_NODE_TYPE,
  IMAGE_GEN_NODE_TYPE,
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
import { type DragEvent, useCallback, useMemo, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CanvasActionsProvider } from "@/hooks/use-canvas-actions";
import { useGraphAutosave } from "@/hooks/use-graph-autosave";
import { useCanvasShortcuts, useGraphHistory } from "@/hooks/use-graph-history";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { downloadableMedia, downloadMedia } from "@/lib/download";
import {
  canGroup as canGroupNodes,
  groupChildIds,
  groupNodes,
  sameParentSelection,
  selectedGroupId,
  ungroupNodes,
} from "@/lib/group";
import {
  type AlignMode,
  alignNodes,
  arrangeNodes,
  type SpacingMode,
  spaceNodes,
} from "@/lib/layout";
import { CanvasActionGroup, CanvasInfoGroup } from "./canvas-toolbar";
import { GroupNode } from "./group-node";
import { ImageGenNode } from "./image-gen-node";
import { MediaNode } from "./media-node";
import { type CanvasMode, type NodeKind, NodePalette } from "./node-palette";
import { SelectionToolbar } from "./selection-toolbar";
import "@xyflow/react/dist/style.css";

const KIND_LABELS: Record<NodeKind, string> = {
  input: "输入",
  default: "处理",
  output: "输出",
};

const PASTE_OFFSET = 40;

// 必须定义在组件外：每次 render 都新建对象会让 React Flow 反复重建所有节点
const NODE_TYPES = {
  [MEDIA_NODE_TYPE]: MediaNode,
  [GROUP_NODE_TYPE]: GroupNode,
  [IMAGE_GEN_NODE_TYPE]: ImageGenNode,
};

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
  const [mode, setMode] = useState<CanvasMode>("select");
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

  /** 图像生成节点：落在视口中心，带一份默认参数 */
  const handleAddImageGen = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const center = rect
      ? screenToFlowPosition({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
      : { x: 0, y: 0 };

    const next: Node[] = [
      ...nodes,
      {
        id: crypto.randomUUID(),
        type: IMAGE_GEN_NODE_TYPE,
        position: { x: center.x - 267, y: center.y - 240 },
        data: { ...DEFAULT_IMAGE_GEN_DATA } as unknown as Record<string, unknown>,
      },
    ];
    setNodes(next);
    commitNow(next, edges);
  }, [screenToFlowPosition, setNodes, commitNow, nodes, edges]);

  /**
   * 改名由节点内部的信息条发起（双击名称），经 context 传下去。
   * 读 ref 而不是闭包里的 nodes/edges：这个回调会一直挂在 context value 上，
   * 用闭包的话每次画布有任何变动都要重建 value，把所有节点白白重渲一遍。
   */
  const renameNode = useCallback(
    (nodeId: string, label: string) => {
      const next = nodesRef.current.map((item) =>
        item.id === nodeId ? { ...item, data: { ...item.data, label } } : item,
      );
      setNodes(next);
      commitNow(next, edgesRef.current);
    },
    [setNodes, commitNow],
  );

  const canvasActions = useMemo(() => ({ renameNode }), [renameNode]);

  const selectedIds = useMemo(
    () => nodes.filter((node) => node.selected).map((node) => node.id),
    [nodes],
  );

  /** 排布类操作统一走这里：算出新数组 → setNodes → 整体入历史栈，一次 ⌘Z 全退回 */
  const applyLayout = useCallback(
    (compute: (current: Node[]) => Node[]) => {
      const next = compute(nodesRef.current);
      if (next === nodesRef.current) return;
      setNodes(next);
      commitNow(next, edgesRef.current);
    },
    [setNodes, commitNow],
  );

  /**
   * 排布真正该动的那批：剔掉父节点已被选中的子节点，并且只留同一父级下的。
   * 子节点坐标是相对父节点的，和顶层节点混在一起算包围盒会得到垃圾数字。
   */
  const layoutIds = useMemo(() => sameParentSelection(nodes, selectedIds), [nodes, selectedIds]);

  const handleArrange = useCallback(
    () => applyLayout((current) => arrangeNodes(current, layoutIds)),
    [applyLayout, layoutIds],
  );

  const handleAlign = useCallback(
    (mode: AlignMode) => applyLayout((current) => alignNodes(current, layoutIds, mode)),
    [applyLayout, layoutIds],
  );

  const groupId = useMemo(() => selectedGroupId(nodes, selectedIds), [nodes, selectedIds]);
  const canGroup = useMemo(() => canGroupNodes(nodes, selectedIds), [nodes, selectedIds]);

  const handleGroup = useCallback(
    () => applyLayout((current) => groupNodes(current, selectedIds)),
    [applyLayout, selectedIds],
  );

  const handleUngroup = useCallback(() => {
    if (!groupId) return;
    applyLayout((current) => ungroupNodes(current, groupId));
  }, [applyLayout, groupId]);

  /** 选中的是编组时，要下的是组里的素材 —— 编组本身没有文件 */
  const downloadItems = useMemo(() => {
    const ids = groupId ? groupChildIds(nodes, groupId) : selectedIds;
    return downloadableMedia(nodes, ids);
  }, [nodes, selectedIds, groupId]);

  const handleDownload = useCallback(() => {
    void downloadMedia(downloadItems);
  }, [downloadItems]);

  const handleSpace = useCallback(
    (mode: SpacingMode) => applyLayout((current) => spaceNodes(current, layoutIds, mode)),
    [applyLayout, layoutIds],
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

  const isMove = mode === "move";

  useCanvasShortcuts({
    onUndo: () => applySnapshot(history.undo()),
    onRedo: () => applySnapshot(history.redo()),
    onCopy: handleCopy,
    onPaste: handlePaste,
    onSelectMode: () => setMode("select"),
    onMoveMode: () => setMode("move"),
  });

  return (
    <TooltipProvider delayDuration={200}>
      <CanvasActionsProvider value={canvasActions}>
        {/* 画布铺满整个视口，所有控件都以浮层叠在上面，最大化可用画布面积 */}
        {/* role=application：这是个有自己快捷键的编辑器，要让屏幕阅读器把按键放行给页面 */}
        <div
          ref={wrapperRef}
          className="h-dvh w-full"
          // 移动模式的光标和选区覆盖层样式挂在 globals.css，按这个属性生效
          data-canvas-mode={mode}
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
            // 选择模式：左键框选，平移让给中键 / 右键，节点可拖
            // 移动模式：左键平移，节点不可拖（拖节点也是平移），语义对齐 Figma 的抓手
            panOnDrag={isMove ? true : [1, 2]}
            selectionOnDrag={!isMove}
            nodesDraggable={!isMove}
            // 移动模式下必须连 selectable 一起关掉：只关 draggable 的话，
            // 节点本身和多选时那层 nodesselection-rect 仍然吃指针事件，
            // 从节点上起手拖动画布会纹丝不动。关掉后 React Flow 会自己把它们
            // 设成 pointer-events:none，抓手才真的「哪儿都能拖」
            elementsSelectable={!isMove}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />

            <SelectionToolbar
              selectedIds={selectedIds}
              groupId={groupId}
              canGroup={canGroup}
              onGroup={handleGroup}
              onUngroup={handleUngroup}
              onArrange={handleArrange}
              onAlign={handleAlign}
              onSpace={handleSpace}
              onDownload={handleDownload}
              downloadCount={downloadItems.length}
            />

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
                mode={mode}
                onModeChange={setMode}
                onAdd={handleAddNode}
                onAddImageGen={handleAddImageGen}
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
      </CanvasActionsProvider>
    </TooltipProvider>
  );
}
