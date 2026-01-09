import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  resultGroupingExtension,
  setLineGroups,
  staleGroupIdsField,
} from "./result-grouping-plugin";
import { LineGroup } from "./compute-line-groups";

function group(
  id: string,
  lineStart: number,
  lineEnd: number,
  state: LineGroup["state"] = "done"
): LineGroup {
  return {
    id,
    resultIds: [1],
    lineStart,
    lineEnd,
    state,
  };
}

function createState(doc: string, groups: LineGroup[]) {
  let state = EditorState.create({
    doc,
    extensions: [resultGroupingExtension],
  });
  state = state.update({ effects: [setLineGroups.of(groups)] }).state;
  return state;
}

describe("staleGroupIdsField", () => {
  it("marks group stale when edit overlaps its range", () => {
    let state = createState("a\nb\nc\n", [group("g1", 2, 2)]);
    const line2 = state.doc.line(2);
    state = state.update({
      changes: { from: line2.from, to: line2.from + 1, insert: "x" },
    }).state;

    const stale = state.field(staleGroupIdsField);
    expect(stale.has("g1")).toBe(true);
  });

  it("does not mark group stale for edits outside its range", () => {
    let state = createState("a\nb\nc\n", [group("g1", 2, 2)]);
    const line1 = state.doc.line(1);
    state = state.update({
      changes: { from: line1.from, to: line1.from + 1, insert: "z" },
    }).state;

    const stale = state.field(staleGroupIdsField);
    expect(stale.size).toBe(0);
  });

  it("clears stale flags on new execution results", () => {
    let state = createState("a\nb\nc\n", [group("g1", 2, 2)]);
    const line2 = state.doc.line(2);
    state = state.update({
      changes: { from: line2.from, to: line2.from + 1, insert: "x" },
    }).state;

    state = state.update({
      effects: [setLineGroups.of([group("g1", 2, 2)])],
    }).state;

    const stale = state.field(staleGroupIdsField);
    expect(stale.size).toBe(0);
  });
});
