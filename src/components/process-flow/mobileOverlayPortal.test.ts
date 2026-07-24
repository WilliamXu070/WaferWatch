import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mounts mobile workflow overlays above the fixed app shell", async () => {
  const [
    portalSource,
    diagramSource,
    waferCreateSource,
    parameterSource,
    templateSource,
    historySource,
    cssSource
  ] = await Promise.all([
    readFile(new URL("../../ui/waferwatch-wireframe/components/WaferWatchPortal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../ProcessFlowDiagram.tsx", import.meta.url), "utf8"),
    readFile(new URL("WaferCreateDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("StepParameterEntryDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("StepTemplateDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../ui/waferwatch-wireframe/components/wafer-die-detail/HistoryCorrectionDialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/globals.css", import.meta.url), "utf8")
  ]);

  assert.match(portalSource, /waferwatch-overlay-theme/);
  assert.match(portalSource, /createPortal\([\s\S]*document\.body/);
  assert.match(diagramSource, /<WaferWatchPortal>[\s\S]*flow-wafer-move-dialog-backdrop--keyboard-aware/);
  assert.match(waferCreateSource, /<WaferWatchPortal>[\s\S]*flow-wafer-move-dialog-backdrop/);
  assert.match(parameterSource, /<WaferWatchPortal>[\s\S]*process-flow-parameter-panel-host/);
  assert.match(templateSource, /<WaferWatchPortal>\{dialog\}<\/WaferWatchPortal>/);
  assert.match(historySource, /<WaferWatchPortal>[\s\S]*history-correction-dialog-backdrop[\s\S]*z-\[220\]/);
  assert.match(cssSource, /\.history-correction-dialog__actions \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(cssSource, /\.history-correction-dialog__body :is\(input, select, textarea\) \{[\s\S]*font-size: 16px;/);
});
