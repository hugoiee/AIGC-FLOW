import type { CloseQuestion } from "@aigc-flow/shared";

export function isCloseQuestion(value: unknown): value is CloseQuestion {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<CloseQuestion>;
  return (
    typeof request.projectName === "string" &&
    request.projectName.length <= 200 &&
    (request.reason === "unsaved" || request.reason === "running")
  );
}
