import { Suspense } from "react";
import { ProjectCanvasRoute } from "@/components/canvas/project-canvas-route";

export const metadata = { title: "画布 · AIGC-FLOW" };

export default function ProjectCanvasPage() {
  // useSearchParams 在预渲染阶段必须有 Suspense 边界，否则 next build 直接报错
  return (
    <Suspense fallback={null}>
      <ProjectCanvasRoute />
    </Suspense>
  );
}
