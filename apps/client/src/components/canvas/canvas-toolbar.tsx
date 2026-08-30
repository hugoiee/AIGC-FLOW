"use client";

import type { Project } from "@aigc-flow/shared";
import { ChevronLeft, Redo2, Undo2 } from "lucide-react";
import Link from "next/link";
import { SaveIndicator } from "@/components/canvas/save-indicator";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { SaveStatus } from "@/hooks/use-graph-autosave";

type CanvasToolbarProps = {
  project: Project;
  nodeCount: number;
  edgeCount: number;
  saveStatus: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

export function CanvasToolbar({
  project,
  nodeCount,
  edgeCount,
  saveStatus,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: CanvasToolbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/">
          <ChevronLeft />
          项目
        </Link>
      </Button>

      <Separator orientation="vertical" className="!h-5" />

      <h1 className="truncate font-medium text-sm">{project.name}</h1>

      <span className="text-muted-foreground text-xs">
        {nodeCount} 个节点 · {edgeCount} 条连线
      </span>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="撤销"
          title="撤销 (Cmd+Z)"
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="重做"
          title="重做 (Cmd+Shift+Z)"
        >
          <Redo2 />
        </Button>

        <Separator orientation="vertical" className="!h-5 mx-2" />

        <SaveIndicator status={saveStatus} />
      </div>
    </header>
  );
}
