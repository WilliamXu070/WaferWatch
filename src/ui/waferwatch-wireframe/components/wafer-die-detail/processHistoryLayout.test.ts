import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps visit parameters, notes, and composer in one ordered vertical scroll surface", async () => {
  const source = await readFile(new URL("./WaferDieNotes.tsx", import.meta.url), "utf8");
  const detailStart = source.indexOf('<section className="wafer-step-detail grid');
  const detailEnd = source.indexOf("{historyCorrectionMode", detailStart);
  const detailSource = source.slice(detailStart, detailEnd);

  assert.ok(detailStart >= 0 && detailEnd > detailStart);
  assert.equal((detailSource.match(/overflow-y-auto/g) ?? []).length, 1);
  assert.match(detailSource, /wafer-step-detail__scroll[^\"]*overflow-x-hidden overflow-y-auto/);
  assert.doesNotMatch(detailSource, /wafer-step-detail__parameters[^\"]*(?:max-h|overflow-y)/);
  assert.doesNotMatch(detailSource, /wafer-step-detail__notes[^\"]*overflow-y/);

  const parametersIndex = detailSource.indexOf('className="wafer-step-detail__parameters');
  const notesIndex = detailSource.indexOf('className="wafer-step-detail__notes');
  const composerIndex = detailSource.indexOf('className="wafer-step-detail__composer');

  assert.ok(parametersIndex >= 0);
  assert.ok(notesIndex > parametersIndex);
  assert.ok(composerIndex > notesIndex);
});
