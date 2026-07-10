import assert from "node:assert/strict";
import test from "node:test";
import { processFlowWaferCreateSchema } from "./schemas";
import { GREEK_WAFER_FAMILIES, getNextGreekWaferCode, normalizeWaferCode } from "./waferNaming";

test("suggests the next unused Greek wafer family", () => {
  assert.equal(getNextGreekWaferCode([]), "ALPHA");
  assert.equal(getNextGreekWaferCode(["ALPHA", "BETA-N1"]), "GAMMA");
  assert.equal(getNextGreekWaferCode(GREEK_WAFER_FAMILIES.slice(0, 17)), "SIGMA");
  assert.equal(getNextGreekWaferCode(GREEK_WAFER_FAMILIES), "ALPHA-2");
});

test("normalizes custom wafer names before persistence", () => {
  assert.equal(normalizeWaferCode("  custom wafer  "), "CUSTOM WAFER");
});

test("validates custom wafer name and selected diameter", () => {
  const parsed = processFlowWaferCreateSchema.parse({
    templateId: "11111111-1111-4111-8111-111111111103",
    waferCode: "SIGMA",
    diameterMm: 150
  });

  assert.equal(parsed.waferCode, "SIGMA");
  assert.equal(parsed.diameterMm, 150);
  assert.throws(() => processFlowWaferCreateSchema.parse({
    templateId: "11111111-1111-4111-8111-111111111103",
    waferCode: "bad/name",
    diameterMm: 150
  }));
});
