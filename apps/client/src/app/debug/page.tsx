import Link from "next/link";
import { DebugConsole } from "@/components/debug-console";

export const metadata = { title: "链路自检 · AIGC-FLOW" };

export default function DebugPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-6 py-8">
      <header className="mb-8">
        <Link href="/" className="text-muted-foreground text-sm hover:text-foreground">
          ← 返回项目列表
        </Link>
        <h1 className="mt-3 font-semibold text-2xl tracking-tight">链路自检</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          排查 client / server / SQLite 三层里是哪一层断了。
        </p>
      </header>
      <DebugConsole />
    </div>
  );
}
