"use client";

import type { Project } from "@aigc-flow/shared";
import { ChevronLeft, Settings } from "lucide-react";
import Link from "next/link";
import { ProjectName } from "@/components/canvas/project-name";
import { SaveIndicator } from "@/components/canvas/save-indicator";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SaveStatus } from "@/hooks/use-graph-autosave";

/** 浮在画布之上的胶囊容器，左右两组共用 */
const GROUP =
  "flex items-center gap-1 rounded-xl border bg-background/90 px-1 py-1 shadow-lg backdrop-blur-sm";

type CanvasInfoGroupProps = {
  project: Project;
  nodeCount: number;
  edgeCount: number;
  saveStatus: SaveStatus;
  onRename: (name: string) => Promise<void>;
};

export function CanvasInfoGroup({
  project,
  nodeCount,
  edgeCount,
  saveStatus,
  onRename,
}: CanvasInfoGroupProps) {
  return (
    <div className={GROUP}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild variant="ghost" size="icon">
            <Link href="/" aria-label="返回项目列表">
              <ChevronLeft />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">返回项目列表</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="!h-5" />

      <ProjectName name={project.name} onRename={onRename} />

      <Separator orientation="vertical" className="!h-5" />

      <span className="whitespace-nowrap px-1 text-muted-foreground text-xs">
        {nodeCount} 节点 · {edgeCount} 连线
      </span>

      <Separator orientation="vertical" className="!h-5" />

      <span className="px-1">
        <SaveIndicator status={saveStatus} />
      </span>
    </div>
  );
}

export function CanvasActionGroup() {
  return (
    <div className={GROUP}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* disabled 的按钮不派发鼠标事件，tooltip 收不到 hover，
              所以套一层 span 承接 —— 占位阶段也要让人知道这是什么 */}
          <span className="inline-flex">
            <Button variant="ghost" size="icon" disabled aria-label="设置">
              <Settings />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">设置（暂未开放）</TooltipContent>
      </Tooltip>
    </div>
  );
}
