import assert from "node:assert/strict";
import { test } from "node:test";
import { IMAGE_GEN_NODE_TYPE, TEXT_NODE_TYPE } from "@aigc-flow/shared";
import type { Edge, Node } from "@xyflow/react";
import { hasGraphContentChanges } from "./graph";

const node: Node = {
  id: "text",
  type: TEXT_NODE_TYPE,
  position: { x: 10, y: 20 },
  data: { label: "文本", text: "初始内容" },
  width: 320,
  height: 200,
};
const edge: Edge = { id: "edge", source: "text", target: "image" };
const graph = { nodes: [node], edges: [edge] };

test("selection and drag flags do not dirty the persisted graph", () => {
  assert.equal(
    hasGraphContentChanges(graph, {
      nodes: [{ ...node, selected: true, dragging: true, measured: { width: 320, height: 200 } }],
      edges: [{ ...edge, selected: true }],
    }),
    false,
  );
});

test("moving and undoing a node both require persistence", () => {
  const moved = { ...graph, nodes: [{ ...node, position: { x: 110, y: 20 } }] };
  assert.equal(hasGraphContentChanges(graph, moved), true);
  assert.equal(hasGraphContentChanges(moved, graph), true);
});

test("editing content, renaming, resizing and regrouping are persisted", () => {
  const edits: Partial<Node>[] = [
    { data: { ...node.data, text: "更新内容" } },
    { data: { ...node.data, label: "重命名" } },
    { width: 640 },
    { height: 400 },
    { parentId: "group" },
    { extent: "parent" },
    { id: "replacement" },
    { type: IMAGE_GEN_NODE_TYPE },
  ];
  for (const edit of edits) {
    assert.equal(hasGraphContentChanges(graph, { ...graph, nodes: [{ ...node, ...edit }] }), true);
  }
});

test("automatic dimensions of a generation node do not dirty the graph", () => {
  const generated = { ...node, type: IMAGE_GEN_NODE_TYPE };
  assert.equal(
    hasGraphContentChanges(
      { nodes: [generated], edges: [] },
      { nodes: [{ ...generated, width: 534, height: 480 }], edges: [] },
    ),
    false,
  );
});

test("node and edge additions, deletions and reconnections are persisted", () => {
  for (const next of [
    { ...graph, nodes: [] },
    { ...graph, nodes: [node, { ...node, id: "copy" }] },
    { ...graph, edges: [] },
    { ...graph, edges: [edge, { ...edge, id: "copy-edge" }] },
  ]) {
    assert.equal(hasGraphContentChanges(graph, next), true);
  }
  const edits: Partial<Edge>[] = [
    { id: "replacement" },
    { source: "another-text" },
    { target: "another-image" },
    { sourceHandle: "out" },
    { targetHandle: "in" },
    { type: "default" },
  ];
  for (const edit of edits) {
    assert.equal(hasGraphContentChanges(graph, { ...graph, edges: [{ ...edge, ...edit }] }), true);
  }
});

test("high-frequency movement never reads or serializes node content", () => {
  const data = new Proxy(
    {},
    {
      get() {
        throw new Error("Interaction must not read prompt or storyboard content");
      },
      ownKeys() {
        throw new Error("Interaction must not serialize node content");
      },
    },
  );
  let current = { nodes: [{ ...node, data }], edges: [edge] };
  for (let x = 11; x < 111; x++) {
    const next = { nodes: [{ ...node, data, position: { x, y: 20 } }], edges: [edge] };
    assert.equal(hasGraphContentChanges(current, next), true);
    current = next;
  }
  const last = current.nodes[0];
  assert.ok(last);
  assert.equal(
    hasGraphContentChanges(current, {
      ...current,
      nodes: [{ ...last, selected: true }],
    }),
    false,
  );
});
