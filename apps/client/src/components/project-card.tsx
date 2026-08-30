"use client";

import type { Project } from "@aigc-flow/shared";
import { Trash2 } from "lucide-react";
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
      <div className="aspect-video overflow-hidden bg-muted">
        <ProjectCover name={project.name} coverImage={project.coverImage} />
      </div>

      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0">
          <h3 className="truncate font-medium leading-tight">{project.name}</h3>
          <p className="mt-1 text-muted-foreground text-xs">
            {formatRelativeTime(project.updatedAt)}更新
          </p>
        </div>
      </div>

      <Button
        variant="secondary"
        size="icon"
        aria-label={`删除项目 ${project.name}`}
        onClick={() => onDelete(project.id)}
        className="absolute top-2 right-2 opacity-0 shadow-sm transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Trash2 />
      </Button>
    </article>
  );
}
