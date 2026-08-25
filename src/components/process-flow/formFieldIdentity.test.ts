import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const formSources = [
  "../ProcessFlowDiagram.tsx",
  "FlowNodeCard.tsx",
  "ProcessArchiveDock.tsx",
  "ProcessFlowCanvas.tsx",
  "StepParameterEntryDialog.tsx",
  "StepTemplateDialog.tsx",
  "WaferCreateDialog.tsx",
  "../../ui/waferwatch-wireframe/components/WireframeTopbar.tsx"
];

test("Process Flow form controls have an id or name for browser autofill", async () => {
  for (const relativePath of formSources) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    const fields = source.match(/<(?:input|select|textarea)\b[^>]*>/g) ?? [];

    assert.ok(fields.length > 0, `${relativePath} should contain a native form control`);
    for (const field of fields) {
      assert.match(field, /\b(?:id|name)=/, `${relativePath} has a form control without an id or name: ${field}`);
    }
  }
});
