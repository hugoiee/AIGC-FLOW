"use client";

import type { DesktopWindowState, WorkspaceState } from "@aigc-flow/shared";
import { X } from "lucide-react";
import { type DragEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type TabBarProps = {
  state: WorkspaceState;
  windowState: DesktopWindowState;
  busy: boolean;
  activate: (id: number | null) => void;
  close: (id: number) => Promise<boolean>;
  move: (id: number, target: number, after: boolean) => void;
};
export function DesktopTabBar({ state, windowState, busy, activate, close, move }: TabBarProps) {
  const strip = useRef<HTMLDivElement>(null);
  const dragged = useRef<number | null>(null);
  const ignoreClickUntil = useRef(0);
  const [drop, setDrop] = useState<{ id: number; after: boolean } | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  useEffect(() => {
    if (state.activeId === null) return;
    const active = strip.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (strip.current?.contains(document.activeElement)) active?.focus({ preventScroll: true });
  }, [state.activeId]);
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (
        element.scrollWidth <= element.clientWidth ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY)
      )
        return;
      event.preventDefault();
      element.scrollLeft += event.deltaY;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  const dragOver = (event: DragEvent<HTMLDivElement>, id: number) => {
    if (dragged.current === null || busy) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    setDrop({ id, after: event.clientX > rect.x + rect.width / 2 });
    const bounds = strip.current?.getBoundingClientRect();
    if (bounds && strip.current) {
      if (event.clientX < bounds.left + 24) strip.current.scrollLeft -= 16;
      if (event.clientX > bounds.right - 24) strip.current.scrollLeft += 16;
    }
  };
  const stopDrag = () => {
    dragged.current = null;
    setMoving(null);
    setDrop(null);
    ignoreClickUntil.current = performance.now() + 100;
  };
  return (
    <nav
      aria-label="项目标签"
      className="desktop-titlebar"
      data-platform={windowState.platform}
      data-fullscreen={windowState.fullscreen}
    >
      {windowState.platform === "darwin" && !windowState.fullscreen && (
        <div className="desktop-native-space" aria-hidden="true" />
      )}
      <button
        type="button"
        aria-label="项目首页"
        title="项目首页"
        disabled={busy}
        className={cn("desktop-home desktop-control", state.activeId === null && "is-active")}
        onClick={() => activate(null)}
      >
        <span aria-hidden="true" className="desktop-home-icon" />
      </button>
      <div
        ref={strip}
        className="desktop-tabs desktop-control"
        role="tablist"
        aria-label="已打开的项目"
      >
        {state.projects.map((project, index) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: Only the drop hit area; child buttons handle keyboard activation and closing.
          <div
            key={project.id}
            role="presentation"
            className={cn(
              "desktop-tab",
              state.activeId === project.id && "is-active",
              moving === project.id && "is-dragging",
              drop?.id === project.id && (drop.after ? "drop-after" : "drop-before"),
            )}
            onDragOver={(event) => dragOver(event, project.id)}
            onDrop={(event) => {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              if (dragged.current !== null && !busy)
                move(dragged.current, project.id, event.clientX > rect.x + rect.width / 2);
              stopDrag();
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={state.activeId === project.id}
              tabIndex={
                state.activeId === project.id || (state.activeId === null && index === 0) ? 0 : -1
              }
              title={project.name}
              disabled={busy}
              draggable={!busy}
              className="desktop-tab-select"
              onDragStart={(event) => {
                dragged.current = project.id;
                setMoving(project.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-aigc-project", String(project.id));
              }}
              onDragEnd={stopDrag}
              onClick={() => {
                if (performance.now() >= ignoreClickUntil.current) activate(project.id);
              }}
              onKeyDown={(event) => {
                const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                if (!offset) return;
                event.preventDefault();
                const next =
                  state.projects[(index + offset + state.projects.length) % state.projects.length];
                if (next) activate(next.id);
              }}
            >
              <span className="desktop-project-icon" aria-hidden="true" />
              <span className="truncate">{project.name}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`关闭 ${project.name}`}
              title={`关闭 ${project.name}`}
              className="desktop-tab-close"
              onClick={() => void close(project.id)}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="desktop-window-drag" aria-hidden="true" />
    </nav>
  );
}
