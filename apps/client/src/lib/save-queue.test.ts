import assert from "node:assert/strict";
import { test } from "node:test";
import { beginDesktopTask, getTaskCount } from "./desktop-tasks";
import { SaveQueue } from "./save-queue";

test("one close flush includes edits received while a previous write is in flight", async () => {
  let value = "first";
  let finishWrite = () => {};
  const written: string[] = [];
  const queue = new SaveQueue(
    "",
    () => value,
    async (next) => {
      written.push(next);
      if (next === "first")
        await new Promise<void>((resolve) => {
          finishWrite = resolve;
        });
    },
    Object.is,
    () => {},
  );
  const autosave = queue.flush();
  await Promise.resolve();
  value = "latest";
  assert.equal(queue.flush(), autosave);
  finishWrite();
  assert.equal(await autosave, true);
  assert.deepEqual(written, ["first", "latest"]);
  assert.equal(queue.saved, "latest");
});
test("failed persistence keeps the unsaved snapshot retryable", async () => {
  let reachable = false;
  const events: string[] = [];
  const queue = new SaveQueue(
    0,
    () => 2,
    async () => {
      if (!reachable) throw new Error("offline");
    },
    Object.is,
    (status) => events.push(status),
  );
  assert.equal(await queue.flush(), false);
  assert.equal(queue.saved, 0);
  reachable = true;
  assert.equal(await queue.flush(), true);
  assert.deepEqual(events, ["saving", "error", "saving", "saved"]);
});
test("undo during a pending save persists the undo rather than losing it", async () => {
  let current = 1;
  let release = () => {};
  const written: number[] = [];
  const queue = new SaveQueue(
    0,
    () => current,
    async (next) => {
      written.push(next);
      if (next === 1)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
    },
    Object.is,
    () => {},
  );
  const pending = queue.flush();
  await Promise.resolve();
  current = 0;
  release();
  await pending;
  assert.deepEqual(written, [1, 0]);
});
test("background tasks are isolated per project and complete only once", () => {
  const first = beginDesktopTask(101);
  const second = beginDesktopTask(102);
  first();
  first();
  assert.equal(getTaskCount(101), 0);
  assert.equal(getTaskCount(102), 1);
  second();
  assert.equal(getTaskCount(102), 0);
});
