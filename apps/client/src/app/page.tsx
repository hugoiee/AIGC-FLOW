import { WorkflowConsole } from "@/components/workflow-console";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded bg-foreground" />
          <span className="font-semibold tracking-tight">AIGC-FLOW</span>
        </div>
        <nav className="flex items-center gap-6 text-muted-foreground text-sm">
          <span className="text-foreground">工作流</span>
          <span>画布（待开发）</span>
          <span>模型（待开发）</span>
        </nav>
      </header>

      <section className="border-b py-10">
        <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">画布节点工作流</h1>
        <p className="mt-3 max-w-xl text-muted-foreground">
          调用各种模型进行影视资产创作。当前是骨架版本，先跑通 Next.js → Hono → SQLite 全链路。
        </p>
      </section>

      <main className="flex-1 py-8">
        <WorkflowConsole />
      </main>

      <footer className="border-t py-6 text-muted-foreground text-sm">
        pnpm workspaces · Next.js 16 · Hono · Drizzle + SQLite · shadcn/ui
      </footer>
    </div>
  );
}
