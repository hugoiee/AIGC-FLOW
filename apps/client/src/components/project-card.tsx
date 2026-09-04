"use client";

import type { Project } from "@aigc-flow/shared";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { ProjectCover } from "@/components/project-cover";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format-date";

type ProjectCardProps = {
  project: Project;
  onDelete: (id: number) => void;
};

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  return (
    <article className="group relative overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      {/* 整卡可点，但删除按钮要浮在链接之上，所以链接铺满、按钮用更高的 z-index */}
      <Link href={`/projects?id=${project.id}`} className="block">
        <div className="aspect-video overflow-hidden bg-muted">
          <ProjectCover name={project.name} coverImage={project.coverImage} />
        </div>

        <div className="p-4">
          <h3 className="truncate font-medium leading-tight">{project.name}</h3>
          <p className="mt-1 text-muted-foreground text-xs">
            {formatRelativeTime(project.updatedAt)}更新
          </p>
        </div>
      </Link>

      <Button
        variant="secondary"
        size="icon"
        aria-label={`删除项目 ${project.name}`}
        onClick={() => onDelete(project.id)}
        className="absolute top-2 right-2 z-10 opacity-0 shadow-sm transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 />
      </Button>
    </article>
  );
}
