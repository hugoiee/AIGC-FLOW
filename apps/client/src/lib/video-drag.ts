import type { PointerEvent } from "react";

/**
 * 原生控件条的高度。Chrome 默认约 40px，留点余量；
 * 节点被拉得很矮时按比例收窄，否则整块都成了「不可拖」。
 */
const CONTROLS_BAND = 48;

/**
 * 视频节点的拖拽让位。
 *
 * `<video controls>` 必须带 `nodrag`，否则拖进度条会被 React Flow 当成拖节点；
 * 可整块都带上之后，节点就没地方可拖了 —— 占位符能拖，出了视频反而拖不动。
 *
 * 原生控件在 shadow DOM 里，事件会重定向到 `<video>` 元素本身，
 * 靠 `event.target` 根本分不出点的是画面还是控件，只能按位置分：
 * 指针落在底部控件条上才挂 `nodrag`，落在画面上就放行拖拽。
 *
 * 三个细节：
 * - 必须走 **capture 阶段**。React Flow 的拖拽监听在节点元素上（冒泡阶段），
 *   React 的合成事件挂在根容器，capture 会先跑到，来得及改类名；
 *   写成 onPointerDown（冒泡）就晚了。
 * - 必须**同步**改 DOM 类名，不能走 state —— setState 是异步的，
 *   等重渲染完这次 pointerdown 早就被处理掉了。
 * - `offsetY` 是元素自身坐标系里的值，不受画布缩放影响，不用除以 zoom。
 */
export function guardVideoDrag(event: PointerEvent<HTMLVideoElement>): void {
  const video = event.currentTarget;
  const band = Math.min(CONTROLS_BAND, video.clientHeight * 0.35);
  const overControls = event.nativeEvent.offsetY >= video.clientHeight - band;

  video.classList.toggle("nodrag", overControls);
}
