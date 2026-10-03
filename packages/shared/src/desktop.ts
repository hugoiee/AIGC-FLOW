export type DesktopWindowState = { platform: string; fullscreen: boolean };
export type CloseChoice = "cancel" | "retry" | "discard";
export type CloseQuestion = { projectName: string; reason: "unsaved" | "running" };

/** Only these window operations cross the sandbox boundary. */
export type DesktopBridge = {
  windowState: () => Promise<DesktopWindowState>;
  onWindowState: (listener: (state: DesktopWindowState) => void) => () => void;
  appearance: (dark: boolean, title: string, followSystem: boolean) => Promise<void>;
  confirmClose: (question: CloseQuestion) => Promise<CloseChoice>;
  beforeWindowClose: (save: () => Promise<boolean>) => () => void;
  onTabShortcut: (listener: (action: "next" | "previous" | "close") => void) => () => void;
};
export type DesktopProject = { id: number; name: string };

export function reorderedProjects(ids: number[], moved: number, target: number, after: boolean) {
  if (moved === target || !ids.includes(moved) || !ids.includes(target)) return ids;
  const result = ids.filter((id) => id !== moved);
  result.splice(result.indexOf(target) + Number(after), 0, moved);
  return result;
}
export function projectAfterClose(
  ids: number[],
  recent: number[],
  active: number | null,
  id: number,
) {
  if (active !== id) return active;
  return (
    recent.find((candidate) => candidate !== id && ids.includes(candidate)) ??
    ids.find((candidate) => candidate !== id) ??
    null
  );
}

export type WorkspaceState = {
  projects: DesktopProject[];
  activeId: number | null;
  recent: number[];
};
export type WorkspaceAction =
  | { type: "open"; project: DesktopProject }
  | { type: "activate"; id: number | null }
  | { type: "close"; id: number }
  | { type: "rename"; id: number; name: string }
  | { type: "move"; id: number; target: number; after: boolean };
export const emptyWorkspace: WorkspaceState = { projects: [], activeId: null, recent: [] };

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  if (action.type === "open") {
    const projects = state.projects.some((p) => p.id === action.project.id)
      ? state.projects
      : [...state.projects, action.project];
    return {
      projects,
      activeId: action.project.id,
      recent: [action.project.id, ...state.recent.filter((id) => id !== action.project.id)],
    };
  }
  if (action.type === "activate") {
    if (action.id !== null && !state.projects.some((p) => p.id === action.id)) return state;
    return {
      ...state,
      activeId: action.id,
      recent:
        action.id === null
          ? state.recent
          : [action.id, ...state.recent.filter((id) => id !== action.id)],
    };
  }
  if (action.type === "close")
    return {
      projects: state.projects.filter((p) => p.id !== action.id),
      activeId: projectAfterClose(
        state.projects.map((p) => p.id),
        state.recent,
        state.activeId,
        action.id,
      ),
      recent: state.recent.filter((id) => id !== action.id),
    };
  if (action.type === "rename") {
    if (!state.projects.some((p) => p.id === action.id && p.name !== action.name)) return state;
    return {
      ...state,
      projects: state.projects.map((p) => (p.id === action.id ? { ...p, name: action.name } : p)),
    };
  }
  const ids = reorderedProjects(
    state.projects.map((p) => p.id),
    action.id,
    action.target,
    action.after,
  );
  return { ...state, projects: ids.flatMap((id) => state.projects.filter((p) => p.id === id)) };
}
