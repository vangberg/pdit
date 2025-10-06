import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import ts from "typescript";
import { EditorState, RangeSet } from "@codemirror/state";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const pluginModulePromise = importTsModule(
  path.join(projectRoot, "src", "result-grouping-plugin.ts")
);

async function importTsModule(modulePath) {
  const source = await readFile(modulePath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: modulePath,
  });

  const cacheDir = path.join(__dirname, ".cache");
  await mkdir(cacheDir, { recursive: true });
  const compiledPath = path.join(cacheDir, `${path.basename(modulePath, ".ts")}.mjs`);
  await writeFile(compiledPath, outputText, "utf8");

  return import(pathToFileURL(compiledPath).href);
}

function buildRangeSet(doc, GroupValueCtor, specs) {
  const ranges = specs.map((spec) => ({
    from: doc.line(spec.lineStart).from,
    to: doc.line(spec.lineEnd).to,
    value: new GroupValueCtor(spec.groupIndex, spec.resultIds),
  }));

  return RangeSet.of(ranges, true);
}

function summarizeRanges(rangeSet, doc) {
  const summary = [];

  rangeSet.between(0, doc.length, (from, to, value) => {
    summary.push({
      from,
      to,
      groupIndex: value.groupIndex,
      resultIds: value.resultIds,
    });
  });

  return summary;
}

test("merges groups when a newline is removed via backspace", async () => {
  const plugin = await pluginModulePromise;
  const { GroupValue, setGroupRanges, groupRangesField } = plugin;

  let state = EditorState.create({
    doc: "Line 1\nLine 2\nLine 3",
    extensions: [groupRangesField],
  });

  const initialRanges = buildRangeSet(state.doc, GroupValue, [
    { lineStart: 1, lineEnd: 1, groupIndex: 0, resultIds: [11] },
    { lineStart: 2, lineEnd: 2, groupIndex: 1, resultIds: [22] },
    { lineStart: 3, lineEnd: 3, groupIndex: 2, resultIds: [33] },
  ]);

  state = state.update({ effects: setGroupRanges.of(initialRanges) }).state;
  const baseline = summarizeRanges(state.field(groupRangesField), state.doc);

  assert.deepStrictEqual(baseline.map((r) => r.groupIndex), [0, 1, 2]);

  const newlineFromLineOne = state.doc.line(1).to;
  const backspaceTransaction = state.update({
    changes: { from: newlineFromLineOne, to: newlineFromLineOne + 1, insert: "" },
  });
  state = backspaceTransaction.state;

  const mergedSummary = summarizeRanges(
    state.field(groupRangesField),
    state.doc
  );

  assert.deepStrictEqual(mergedSummary.map((r) => r.groupIndex), [0, 2]);
  assert.deepStrictEqual(mergedSummary[0].resultIds, [11]);
  const mergedSnapshot = mergedSummary;

  // Simulate undo: restore the newline first, then reapply the snapshot the
  // history facet would have recorded.
  const lineTwoStart = state.doc.sliceString(0, state.doc.length).indexOf("Line 2");
  state = state.update({
    changes: { from: lineTwoStart, to: lineTwoStart, insert: "\n" },
  }).state;

  const stillMerged = summarizeRanges(state.field(groupRangesField), state.doc);
  assert.deepStrictEqual(stillMerged.map((r) => r.groupIndex), [0, 2]);

  state = state.update({ effects: setGroupRanges.of(initialRanges) }).state;
  const restored = summarizeRanges(state.field(groupRangesField), state.doc);
  assert.deepStrictEqual(restored.map((r) => r.groupIndex), [0, 1, 2]);

  // Redo by removing the newline again and confirm we return to the merged
  // snapshot captured before the undo.
  const redoNewline = state.doc.line(1).to;
  state = state.update({
    changes: { from: redoNewline, to: redoNewline + 1, insert: "" },
  }).state;

  const redoSummary = summarizeRanges(state.field(groupRangesField), state.doc);
  assert.deepStrictEqual(redoSummary, mergedSnapshot);
});

test("forward delete also merges overlapping groups", async () => {
  const plugin = await pluginModulePromise;
  const { GroupValue, setGroupRanges, groupRangesField } = plugin;

  let state = EditorState.create({
    doc: "Line 1\nLine 2\nLine 3",
    extensions: [groupRangesField],
  });

  const initialRanges = buildRangeSet(state.doc, GroupValue, [
    { lineStart: 1, lineEnd: 1, groupIndex: 0, resultIds: [44] },
    { lineStart: 2, lineEnd: 2, groupIndex: 1, resultIds: [55] },
  ]);

  state = state.update({ effects: setGroupRanges.of(initialRanges) }).state;

  const deleteStart = state.doc.line(2).from - 1;
  state = state.update({
    changes: { from: deleteStart, to: deleteStart + 1, insert: "" },
  }).state;

  const summary = summarizeRanges(state.field(groupRangesField), state.doc);
  assert.strictEqual(summary.length, 1);
  assert.deepStrictEqual(summary[0].resultIds, [44]);
});

test("pasting into a merged line keeps the group intact", async () => {
  const plugin = await pluginModulePromise;
  const { GroupValue, setGroupRanges, groupRangesField } = plugin;

  let state = EditorState.create({
    doc: "alpha\nbeta",
    extensions: [groupRangesField],
  });

  const initialRanges = buildRangeSet(state.doc, GroupValue, [
    { lineStart: 1, lineEnd: 1, groupIndex: 0, resultIds: [71] },
    { lineStart: 2, lineEnd: 2, groupIndex: 1, resultIds: [72] },
  ]);

  state = state.update({ effects: setGroupRanges.of(initialRanges) }).state;

  const newlineIndex = state.doc.line(1).to;
  state = state.update({
    changes: { from: newlineIndex, to: newlineIndex + 1, insert: "" },
  }).state;

  // Paste text into the merged line and ensure the single group stretches.
  const insertSpot = state.doc.sliceString(0, state.doc.length).indexOf("beta");
  state = state.update({
    changes: { from: insertSpot, to: insertSpot, insert: " pasted" },
  }).state;

  const summary = summarizeRanges(state.field(groupRangesField), state.doc);
  assert.strictEqual(summary.length, 1);
  assert.deepStrictEqual(summary[0].resultIds, [71]);
});
