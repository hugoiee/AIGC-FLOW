const tasks = new Map<number, number>();

export function getTaskCount(projectId: number) {
  return tasks.get(projectId) ?? 0;
}

/** A task belongs to its project, even when another canvas is selected. */
export function beginDesktopTask(projectId: number) {
  tasks.set(projectId, getTaskCount(projectId) + 1);
  let complete = false;
  return () => {
    if (complete) return;
    complete = true;
    const count = getTaskCount(projectId) - 1;
    if (count > 0) tasks.set(projectId, count);
    else tasks.delete(projectId);
  };
}
