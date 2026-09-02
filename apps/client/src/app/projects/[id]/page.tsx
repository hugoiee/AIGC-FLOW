import { notFound } from "next/navigation";
import { CanvasPage } from "@/components/canvas/canvas-page";

export const metadata = { title: "画布 · AIGC-FLOW" };

export default async function ProjectCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = Number(id);

  // 路由段是任意字符串，非法 id 直接 404，别让它带着 NaN 往下走
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();

  return <CanvasPage projectId={projectId} />;
}
