import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getSelectionKindLabel,
  getVisibleSelectionStack,
  isSingleSelection
} from "./selectionInspectorState";

test("shows the four most recent selection cards and summarizes the hidden remainder", () => {
  const items = Array.from({ length: 6 }, (_, index) => ({ id: index + 1 }));
  const stack = getVisibleSelectionStack(items);

  assert.deepEqual(stack.visibleItems.map((item) => item.id), [3, 4, 5, 6]);
  assert.equal(stack.hiddenCount, 2);
});

test("distinguishes one editable item from a parameter-null multi-selection", () => {
  assert.equal(isSingleSelection(1), true);
  assert.equal(isSingleSelection(2), false);
  assert.equal(isSingleSelection(6), false);
  assert.equal(getSelectionKindLabel([{ isDie: true }]), "Selected die");
  assert.equal(getSelectionKindLabel([{ isDie: true }, { isDie: true }]), "2 dies selected");
});

test("mounts the parameter panel only behind the single-selection policy", async () => {
  const source = await readFile(new URL("./ProcessFlowSelectionInspector.tsx", import.meta.url), "utf8");

  assert.match(source, /const isSingle = isSingleSelection\(items\.length\)/);
  assert.match(source, /\{isSingle \? \(\s*<SelectionParameterPanel/);
});

test("keeps the phone inspector compact until details are requested", async () => {
  const [componentSource, cssSource] = await Promise.all([
    readFile(new URL("./ProcessFlowSelectionInspector.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/globals.css", import.meta.url), "utf8")
  ]);

  assert.match(componentSource, /useState\(false\)/);
  assert.match(componentSource, /aria-expanded=\{isMobileExpanded\}/);
  assert.match(cssSource, /max-height: min\(48svh, 460px\)/);
  assert.match(cssSource, /:not\(\.is-mobile-expanded\)[\s\S]*__body > :not\(\.process-flow-selection-stack\)/);
  assert.match(cssSource, /\.process-flow-selection-stack \{\s*height: 82px;/);
});
