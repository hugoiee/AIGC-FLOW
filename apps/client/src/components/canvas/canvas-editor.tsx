"use client";

import {
  DEFAULT_IMAGE_GEN_DATA,
  DEFAULT_TEXT_NODE_DATA,
  DEFAULT_VIDEO_GEN_DATA,
  GROUP_NODE_TYPE,
  IMAGE_GEN_NODE_TYPE,
  MEDIA_NODE_TYPE,
  type MediaNodeData,
  type NodeMark,
  type Project,
  type ProjectGraph,
  remapPromptTokens,
  syncPromptTokens,
  TEXT_NODE_HEIGHT,
  TEXT_NODE_TYPE,
  TEXT_NODE_WIDTH,
  VIDEO_GEN_NODE_TYPE,
} from "@aigc-flow/shared";
import {
  addEdge,
  Background,
  BackgroundVariant,
  type Connection,
  type Edge,
  MiniMap,
  type Node,
  Panel,
  ReactFlow,
  SelectionMode,
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
import { canConnectNodes, sourceResourceOf, targetAcceptsOf } from "@/lib/connection";
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
import { idsByMark, markableIds, markNodes, markSummary } from "@/lib/node-mark";
import { AnimatedEdge } from "./animated-edge";
import { CanvasControls } from "./canvas-controls";
import { CanvasActionGroup, CanvasInfoGroup } from "./canvas-toolbar";
import { FloatingConnector, type FloatLine } from "./floating-connector";
import { GroupNode } from "./group-node";
import { ImageGenNode } from "./image-gen-node";
import { MediaNode } from "./media-node";
import { type CanvasMode, NodePalette } from "./node-palette";
import { NodePickerMenu, type NodePickerRequest, type PickerNodeType } from "./node-picker-menu";
import { SelectionToolbar } from "./selection-toolbar";
import { TextNode } from "./text-node";
import { VideoGenNode } from "./video-gen-node";
import "@xyflow/react/dist/style.css";

const PASTE_OFFSET = 40;

/** 只有生成节点带 prompt；文本 / 媒体 / 编组没有 */
function hasPrompt(data: unknown): data is { prompt: string } {
  return typeof (data as { prompt?: unknown } | null)?.prompt === "string";
}

/**
 * 组一个新节点。文本节点要带初始尺寸（它可自由拉伸，尺寸随 graph 落盘），
 * 其余类型由内容自适应。
 */
function buildCanvasNode(
  type: string,
  defaults: Record<string, unknown>,
  position: { x: number; y: number },
): Node {
  const size =
    type === TEXT_NODE_TYPE ? { width: TEXT_NODE_WIDTH, height: TEXT_NODE_HEIGHT } : null;
  return {
    id: crypto.randomUUID(),
    type,
    position,
    data: { ...defaults },
    ...(size ? { ...size, style: size } : {}),
  };
}

/** 浮动连线的三次贝塞尔（屏幕坐标），弯度随水平距离走，和 React Flow 默认连线手感一致 */
function floatLinePath({ from, to }: FloatLine): string {
  const bend = Math.max(Math.abs(to.x - from.x) / 2, 40);
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
}

// 必须定义在组件外：每次 render 都新建对象会让 React Flow 反复重建所有节点和连线
const EDGE_TYPES = { default: AnimatedEdge };

// 必须定义在组件外：每次 render 都新建对象会让 React Flow 反复重建所有节点
const NODE_TYPES = {
  [MEDIA_NODE_TYPE]: MediaNode,
  [GROUP_NODE_TYPE]: GroupNode,
  [IMAGE_GEN_NODE_TYPE]: ImageGenNode,
  [VIDEO_GEN_NODE_TYPE]: VideoGenNode,
  [TEXT_NODE_TYPE]: TextNode,
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
  const { screenToFlowPosition, getViewport, getIntersectingNodes } = useReactFlow();
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
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      if (!sourceNode || !targetNode || !canConnectNodes(sourceNode, targetNode)) return;

      // 新状态必须在 updater 外面算：updater 里做副作用在 StrictMode 下会跑两次，
      // 历史栈会被塞进重复项，表现为「撤销要按两下才动一次」
      let next = addEdge(connection, edges);

      // 批量连线：起手的节点在多选选区里时，选区内其他能连的资源节点一起连到
      // 同一目标（连线约束见 lib/connection.ts）。addEdge 会跳过完全相同的连线。
      const selected = nodes.filter((node) => node.selected);
      if (selected.some((node) => node.id === connection.source)) {
        for (const node of selected) {
          if (node.id === connection.source || node.id === connection.target) continue;
          if (!canConnectNodes(node, targetNode)) continue;
          next = addEdge(
            {
              source: node.id,
              sourceHandle: null,
              target: connection.target,
              targetHandle: connection.targetHandle,
            },
            next,
          );
        }
      }

      setEdges(next);
      commitNow(nodes, next);
    },
    [setEdges, commitNow, nodes, edges],
  );

  /** 生成类节点：默认落在视口中心，也可指定画布坐标（节点选择菜单用） */
  const addGenNode = useCallback(
    (type: string, defaults: Record<string, unknown>, position?: { x: number; y: number }) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
        : { x: 0, y: 0 };

      const node = buildCanvasNode(
        type,
        defaults,
        position ?? { x: center.x - 267, y: center.y - 240 },
      );
      const next: Node[] = [...nodes, node];
      setNodes(next);
      commitNow(next, edges);
      return node;
    },
    [screenToFlowPosition, setNodes, commitNow, nodes, edges],
  );

  const handleAddImageGen = useCallback(
    () =>
      addGenNode(IMAGE_GEN_NODE_TYPE, DEFAULT_IMAGE_GEN_DATA as unknown as Record<string, unknown>),
    [addGenNode],
  );
  const handleAddVideoGen = useCallback(
    () =>
      addGenNode(VIDEO_GEN_NODE_TYPE, DEFAULT_VIDEO_GEN_DATA as unknown as Record<string, unknown>),
    [addGenNode],
  );
  const handleAddText = useCallback(
    () => addGenNode(TEXT_NODE_TYPE, DEFAULT_TEXT_NODE_DATA as unknown as Record<string, unknown>),
    [addGenNode],
  );

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

  /** 节点右侧功能面板里的采用 / 废弃：和改名一样从节点内发起、要进历史 */
  const setNodeMark = useCallback(
    (nodeId: string, mark: NodeMark | null) => {
      const next = markNodes(nodesRef.current, [nodeId], mark);
      if (next === nodesRef.current) return;
      setNodes(next);
      commitNow(next, edgesRef.current);
    },
    [setNodes, commitNow],
  );

  // 单击节点才记为 active（框选不触发 onNodeClick），图像生成节点据此决定是否展开菜单
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  // 浮动端点拖出的连线（屏幕坐标）与节点选择菜单。弹菜单期间连线保持显示
  const [floatLine, setFloatLine] = useState<FloatLine | null>(null);
  const [picker, setPicker] = useState<NodePickerRequest | null>(null);

  // 拖线悬停中的可放置目标。只在目标能接受当前连线时设值，节点据此播动画
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // 左下角缩略图默认关闭，由画布控制条上的开关控制
  const [showMiniMap, setShowMiniMap] = useState(false);

  /** 拖线过程中按悬停位置刷新可放置目标：sources 里至少一个能连才算 */
  const updateDropTarget = useCallback(
    (point: { x: number; y: number }, sources: Node[]) => {
      const flow = screenToFlowPosition(point);
      const target = getIntersectingNodes({ x: flow.x, y: flow.y, width: 1, height: 1 }).find(
        (node) => targetAcceptsOf(node.type) !== null,
      );
      const ok =
        target && sources.some((node) => node.id !== target.id && canConnectNodes(node, target));
      setDropTargetId(ok && target ? target.id : null);
    },
    [screenToFlowPosition, getIntersectingNodes],
  );

  /** 浮动端点拖动中：更新虚线 + 刷新可放置目标 */
  const handleFloatDragLine = useCallback(
    (line: FloatLine) => {
      setFloatLine(line);
      updateDropTarget(
        line.to,
        nodesRef.current.filter((node) => node.selected && sourceResourceOf(node) !== null),
      );
    },
    [updateDropTarget],
  );

  // 普通端点拖线时挂在 window 上的 move 监听，onConnectEnd 时卸掉
  const connectDragCleanupRef = useRef<(() => void) | null>(null);

  /** 选区里能往外连的资源节点（媒体 / 生成结果 / 文本） */
  const selectedResourceIds = useMemo(
    () =>
      nodes
        .filter((node) => node.selected && sourceResourceOf(node) !== null)
        .map((node) => node.id),
    [nodes],
  );

  /** 浮动端点松手：落在能接受的节点上就批量连线，否则原地弹节点选择菜单 */
  const handleFloatingDrop = useCallback(
    (point: { x: number; y: number }) => {
      setDropTargetId(null);
      const flow = screenToFlowPosition(point);
      const sources = nodesRef.current.filter(
        (node) => node.selected && sourceResourceOf(node) !== null,
      );

      const target = getIntersectingNodes({ x: flow.x, y: flow.y, width: 1, height: 1 }).find(
        (node) => targetAcceptsOf(node.type) !== null,
      );
      if (target) {
        const connectable = sources.filter(
          (node) => node.id !== target.id && canConnectNodes(node, target),
        );
        if (connectable.length > 0) {
          let next = edgesRef.current;
          for (const node of connectable) {
            next = addEdge(
              { source: node.id, sourceHandle: null, target: target.id, targetHandle: null },
              next,
            );
          }
          setEdges(next);
          commitNow(nodesRef.current, next);
          setFloatLine(null);
          return;
        }
      }

      // 落在空白或目标不能接受选区资源：弹菜单让用户当场造一个能接的节点
      setPicker({ screen: point, flow, sourceIds: sources.map((node) => node.id) });
    },
    [screenToFlowPosition, getIntersectingNodes, setEdges, commitNow],
  );

  /** 菜单选择：创建对应节点并把能连的源都连过来，整个过程连线不消失 */
  const handlePickerPick = useCallback(
    (type: PickerNodeType) => {
      if (!picker) return;
      const defaults =
        type === IMAGE_GEN_NODE_TYPE
          ? DEFAULT_IMAGE_GEN_DATA
          : type === VIDEO_GEN_NODE_TYPE
            ? DEFAULT_VIDEO_GEN_DATA
            : DEFAULT_TEXT_NODE_DATA;

      const node = buildCanvasNode(
        type,
        defaults as unknown as Record<string, unknown>,
        picker.flow,
      );
      let nextEdges = edgesRef.current;
      const textIds: string[] = [];
      for (const id of picker.sourceIds) {
        const source = nodesRef.current.find((item) => item.id === id);
        if (source && canConnectNodes(source, node)) {
          nextEdges = addEdge(
            { source: id, sourceHandle: null, target: node.id, targetHandle: null },
            nextEdges,
          );
          if (source.type === TEXT_NODE_TYPE) textIds.push(id);
        }
      }

      // 这个节点是「带着连线一起诞生」的，prompt 里的文本徽章必须在这儿就写好：
      // usePromptTokens 的挂载守卫会把首次见到的连线一律当成已同步
      // （那个守卫是为了刷新后不把用户手动删掉的徽章补回来），
      // 交给它去追就永远追不上。目标是文本节点时连不上任何源，textIds 自然是空的。
      if (textIds.length > 0) {
        node.data = { ...node.data, prompt: syncPromptTokens("", textIds, []) };
      }

      const nextNodes = [...nodesRef.current, node];
      setNodes(nextNodes);
      setEdges(nextEdges);
      commitNow(nextNodes, nextEdges);
      setPicker(null);
      setFloatLine(null);
    },
    [picker, setNodes, setEdges, commitNow],
  );

  const handlePickerClose = useCallback(() => {
    setPicker(null);
    setFloatLine(null);
  }, []);

  const selectedIds = useMemo(
    () => nodes.filter((node) => node.selected).map((node) => node.id),
    [nodes],
  );

  const canvasActions = useMemo(
    () => ({ renameNode, setNodeMark, activeNodeId, dropTargetId }),
    [renameNode, setNodeMark, activeNodeId, dropTargetId],
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

  /** 批量下载和批量标记作用的节点：选中的是编组时是组里的成员 —— 编组本身没有文件 */
  const mediaTargetIds = useMemo(
    () => (groupId ? groupChildIds(nodes, groupId) : selectedIds),
    [nodes, selectedIds, groupId],
  );

  const downloadItems = useMemo(
    () => downloadableMedia(nodes, mediaTargetIds),
    [nodes, mediaTargetIds],
  );

  const markCount = useMemo(
    () => markableIds(nodes, mediaTargetIds).length,
    [nodes, mediaTargetIds],
  );

  const marks = useMemo(() => markSummary(nodes), [nodes]);

  /**
   * 左上角计数芯片：选中某一态的全部素材。只改 selected，不进历史
   * （选中态本来就不落盘，见 toPersistedGraph）。顺手清掉 activeNodeId，
   * 否则上一次单击展开的菜单会挂在一堆被批量选中的节点里。
   */
  const handleSelectByMark = useCallback(
    (mark: NodeMark | null) => {
      const ids = new Set(idsByMark(nodesRef.current, mark));
      setNodes(
        nodesRef.current.map((node) =>
          Boolean(node.selected) === ids.has(node.id)
            ? node
            : { ...node, selected: ids.has(node.id) },
        ),
      );
      setActiveNodeId(null);
    },
    [setNodes],
  );

  const handleMark = useCallback(
    (mark: NodeMark | null) => applyLayout((current) => markNodes(current, mediaTargetIds, mark)),
    [applyLayout, mediaTargetIds],
  );

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
      // prompt 里的文本徽章记的是节点 id，原样粘过去会指向被复制的那个原节点：
      // 徽章退化成「文本」二字，发请求时那段文本还会被静默丢掉。
      // 跟着一起粘的换成新 id，没跟着粘的（连线也不会带过来）直接清掉。
      data: hasPrompt(node.data)
        ? { ...node.data, prompt: remapPromptTokens(node.data.prompt, idMap) }
        : node.data,
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
   * 上传完成 / 失败、或量到原始尺寸时回填。
   * 用 setNodes 的函数式写法读最新值：上传异步，回调触发时闭包里的 nodes 早过期了。
   * 这里不入历史栈 —— 回填是上传的结果，不是用户的一次操作，
   * 否则按 Cmd+Z 会把节点退回"上传中"这种没意义的状态。
   */
  const handleUploadNodeSettled = useCallback(
    (nodeId: string, patch: Partial<MediaNodeData>, size?: { width: number; height: number }) => {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: { ...node.data, ...patch },
                ...(size ? { width: size.width, height: size.height, style: size } : {}),
              }
            : node,
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
            onConnectStart={(_, { nodeId, handleType }) => {
              // 普通端点拖线时也做「可放置」高亮：move 里按悬停位置刷新目标
              if (handleType !== "source" || !nodeId) return;
              const fromNode = nodesRef.current.find((node) => node.id === nodeId);
              if (!fromNode) return;
              const handleMove = (move: PointerEvent) =>
                updateDropTarget({ x: move.clientX, y: move.clientY }, [fromNode]);
              window.addEventListener("pointermove", handleMove);
              connectDragCleanupRef.current = () =>
                window.removeEventListener("pointermove", handleMove);
            }}
            onConnectEnd={(event, connectionState) => {
              connectDragCleanupRef.current?.();
              connectDragCleanupRef.current = null;
              setDropTargetId(null);
              // 拖普通端点的线松手在节点身上（没落在 target 端点上）也算连上
              if (connectionState.isValid) return;
              const fromNode = connectionState.fromNode;
              if (!fromNode || connectionState.fromHandle?.type !== "source") return;
              const point = "changedTouches" in event ? event.changedTouches[0] : event;
              if (!point) return;
              const flow = screenToFlowPosition({ x: point.clientX, y: point.clientY });
              const target = getIntersectingNodes({
                x: flow.x,
                y: flow.y,
                width: 1,
                height: 1,
              }).find((node) => node.id !== fromNode.id && canConnectNodes(fromNode, node));
              if (target) {
                handleConnect({
                  source: fromNode.id,
                  sourceHandle: null,
                  target: target.id,
                  targetHandle: null,
                });
              }
            }}
            onPaneContextMenu={(event) => {
              event.preventDefault();
              const point = { x: event.clientX, y: event.clientY };
              setPicker({ screen: point, flow: screenToFlowPosition(point), sourceIds: [] });
            }}
            isValidConnection={(connection) => {
              const source = nodesRef.current.find((node) => node.id === connection.source);
              const target = nodesRef.current.find((node) => node.id === connection.target);
              return !!source && !!target && canConnectNodes(source, target);
            }}
            onNodeClick={(_, node) => setActiveNodeId(node.id)}
            onPaneClick={() => setActiveNodeId(null)}
            onSelectionStart={() => setActiveNodeId(null)}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            colorMode={resolvedTheme === "dark" ? "dark" : "light"}
            defaultViewport={initialViewport}
            // 下限对齐控制条里的 10% 档位
            minZoom={0.1}
            maxZoom={2}
            // 右下角的 React Flow 角标不要
            proOptions={{ hideAttribution: true }}
            deleteKeyCode={["Backspace", "Delete"]}
            multiSelectionKeyCode={["Meta", "Shift"]}
            // 选择模式：左键框选，平移让给中键（右键留给节点选择菜单），节点可拖
            // 移动模式：左键平移，节点不可拖（拖节点也是平移），语义对齐 Figma 的抓手
            panOnDrag={isMove ? true : [1]}
            selectionOnDrag={!isMove}
            // 框选碰到节点就算选中，不要求整个框住
            selectionMode={SelectionMode.Partial}
            nodesDraggable={!isMove}
            // 移动模式下必须连 selectable 一起关掉：只关 draggable 的话，
            // 节点本身和多选时那层 nodesselection-rect 仍然吃指针事件，
            // 从节点上起手拖动画布会纹丝不动。关掉后 React Flow 会自己把它们
            // 设成 pointer-events:none，抓手才真的「哪儿都能拖」
            elementsSelectable={!isMove}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />

            <FloatingConnector
              selectedIds={selectedIds}
              visible={!isMove && selectedResourceIds.length >= 2}
              onDragLine={handleFloatDragLine}
              onDrop={handleFloatingDrop}
            />

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
              onMark={handleMark}
              markCount={markCount}
            />

            <Panel position="top-left">
              <CanvasInfoGroup
                project={project}
                nodeCount={nodes.length}
                edgeCount={edges.length}
                saveStatus={status}
                onRename={onRename}
                marks={marks}
                onSelectByMark={handleSelectByMark}
              />
            </Panel>

            <Panel position="top-right">
              <CanvasActionGroup />
            </Panel>

            <Panel position="bottom-center">
              <NodePalette
                mode={mode}
                onModeChange={setMode}
                onAddImageGen={handleAddImageGen}
                onAddVideoGen={handleAddVideoGen}
                onAddText={handleAddText}
                onPickFiles={handlePickFiles}
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                onUndo={() => applySnapshot(history.undo())}
                onRedo={() => applySnapshot(history.redo())}
              />
            </Panel>

            <Panel position="bottom-left">
              <CanvasControls
                showMiniMap={showMiniMap}
                onToggleMiniMap={() => setShowMiniMap((value) => !value)}
              />
            </Panel>
            {/* marginBottom 抬到控制条上方，两个面板同在左下角 */}
            {showMiniMap && (
              <MiniMap pannable zoomable position="bottom-left" style={{ marginBottom: 56 }} />
            )}
          </ReactFlow>

          {/* 浮动端点拖出的连线。屏幕坐标直接画在画布容器上层，弹菜单期间保持 */}
          {floatLine && (
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 z-40 size-full overflow-visible"
            >
              <path
                d={floatLinePath(floatLine)}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={1.6}
                strokeDasharray="6 4"
              />
              <circle cx={floatLine.to.x} cy={floatLine.to.y} r={4} fill="#3b82f6" />
            </svg>
          )}

          {picker && (
            <NodePickerMenu
              request={picker}
              nodes={nodes}
              onPick={handlePickerPick}
              onClose={handlePickerClose}
            />
          )}
        </div>
      </CanvasActionsProvider>
    </TooltipProvider>
  );
}
