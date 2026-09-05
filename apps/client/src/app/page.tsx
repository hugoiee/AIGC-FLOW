import { ChartColumn } from "lucide-react";
import Link from "next/link";
import { ProjectList } from "@/components/project-list";
import { StatsDialog } from "@/components/stats-dialog";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded bg-foreground" />
          <span className="font-semibold tracking-tight">AIGC-FLOW</span>
        </div>
        <nav className="flex items-center gap-6 text-muted-foreground text-sm">
          <span className="text-foreground">项目</span>
          <Link href="/debug" className="hover:text-foreground">
            自检
          </Link>
          {/* 不传 projectId 就是全局口径：跨项目的流水都在这儿，画布里的那个只看当前项目 */}
          <StatsDialog
            trigger={
              <Button variant="outline" size="sm">
                <ChartColumn />
                全局记录
              </Button>
            }
          />
        </nav>
      </header>

      <section className="py-8">
        <h1 className="font-semibold text-3xl tracking-tight">我的项目</h1>
        <p className="mt-2 text-muted-foreground">用节点画布串联模型，生产影视资产。</p>
      </section>

      <main className="flex-1 pb-16">
        <ProjectList />
      </main>
    </div>
  );
}
