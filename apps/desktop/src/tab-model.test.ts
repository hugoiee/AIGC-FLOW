import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyWorkspace, reorderedProjects, workspaceReducer } from "@aigc-flow/shared";
import { isCloseQuestion } from "./tab-model";

test("project identity, active selection, and visit history survive reordering", () => {
  let state = workspaceReducer(emptyWorkspace, { type: "open", project: { id: 1, name: "A" } });
  state = workspaceReducer(state, { type: "open", project: { id: 2, name: "B" } });
  state = workspaceReducer(state, { type: "open", project: { id: 3, name: "C" } });
  state = workspaceReducer(state, { type: "activate", id: 1 });
  state = workspaceReducer(state, { type: "open", project: { id: 1, name: "A" } });
  assert.equal(state.projects.length, 3);
  state = workspaceReducer(state, { type: "move", id: 2, target: 1, after: false });
  assert.deepEqual(
    state.projects.map((project) => project.id),
    [2, 1, 3],
  );
  assert.equal(state.activeId, 1);
  state = workspaceReducer(state, { type: "close", id: 1 });
  assert.equal(state.activeId, 3);
  state = workspaceReducer(state, { type: "close", id: 2 });
  assert.equal(state.activeId, 3);
  state = workspaceReducer(state, { type: "close", id: 3 });
  assert.equal(state.activeId, null);
  assert.deepEqual(state.projects, []);
});
test("invalid drag targets and stale activations cannot introduce phantom projects", () => {
  assert.deepEqual(reorderedProjects([1, 2, 3], 99, 2, false), [1, 2, 3]);
  assert.deepEqual(reorderedProjects([1, 2, 3], 1, 3, true), [2, 3, 1]);
  assert.equal(workspaceReducer(emptyWorkspace, { type: "activate", id: 42 }), emptyWorkspace);
  for (const value of [null, { reason: "unsaved" }, { projectName: "A", reason: "other" }])
    assert.equal(isCloseQuestion(value), false);
  assert.equal(isCloseQuestion({ projectName: "A", reason: "unsaved" }), true);
});
