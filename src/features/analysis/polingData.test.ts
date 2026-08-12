import assert from "node:assert/strict";
import test from "node:test";
import catalog from "./polingCatalog.json";
import {
  POLING_SERIES_PALETTE,
  buildPolingPointPositions,
  getAdjacentPolingOverlapRecord,
  getNextPolingOverlapRecord,
  getPolingPointTitle,
  getPolingSeriesColors,
  getPolingSpecimens,
  type PolingRecord
} from "./polingData";

const POLING_RECORDS = catalog.records as readonly PolingRecord[];

test("poling catalog preserves the complete normalized import", () => {
  const imageRecords = POLING_RECORDS.filter((record) => record.imagePath);
  const dataOnlyRecords = POLING_RECORDS.filter((record) => !record.imagePath);
  const specimens = getPolingSpecimens(POLING_RECORDS);

  assert.equal(POLING_RECORDS.length, 270);
  assert.equal(imageRecords.length, 206);
  assert.equal(new Set(imageRecords.map((record) => record.imagePath)).size, 206);
  assert.equal(dataOnlyRecords.length, 64);
  assert.equal(specimens.length, 7);
  assert.deepEqual(specimens, [
    "TFA1.1M1R1",
    "TFA3.1M1R1",
    "TFA4.1M1R1",
    "TFA6.1M1R1",
    "TFA7.1M1R1",
    "TFB1.1M1R1",
    "TFB4.1M1R1"
  ]);
});

test("catalog retains all five source names and never uses generic chip names", () => {
  assert.deepEqual(
    [...new Set(POLING_RECORDS.map((record) => record.sourceFile))].sort(),
    [
      "Poling Parameters.xlsx",
      "TFLN poling June 22nd-pres (1).pptx",
      "TFLN poling June 29th-pres.pptx",
      "poling report August 4th-6th.pptx",
      "poling report July 24th-press.pptx"
    ]
  );
  assert.ok(
    POLING_RECORDS.every(
      (record) =>
        !record.specimenReference.toLowerCase().includes("chip") &&
        !record.dieLabel.toLowerCase().includes("chip")
    )
  );
});

test("the seven imported die series receive seven distinct colors", () => {
  const colors = getPolingSeriesColors(getPolingSpecimens(POLING_RECORDS));

  assert.equal(POLING_SERIES_PALETTE.length, 7);
  assert.equal(new Set(Object.values(colors)).size, 7);
});

test("data-only point titles describe the condition without no-image copy", () => {
  const record = POLING_RECORDS.find((candidate) => !candidate.imagePath);
  assert.ok(record);

  const title = getPolingPointTitle(record, 2);

  assert.match(title, new RegExp(record.specimenReference));
  assert.match(title, /2 records at this coordinate/);
  assert.doesNotMatch(title, /image|microscopy/i);
});

test("future specimen series continue receiving distinct stable colors", () => {
  const specimens = Array.from({ length: 20 }, (_, index) => `SPECIMEN-${index + 1}`);
  const first = getPolingSeriesColors(specimens);
  const second = getPolingSeriesColors(specimens);

  assert.deepEqual(first, second);
  assert.equal(new Set(Object.values(first)).size, specimens.length);
});

test("overlapping records retain identical source coordinates", () => {
  const overlap = POLING_RECORDS.filter(
    (record) => record.voltage === 500 && record.pulses === 1
  );
  const positions = buildPolingPointPositions(POLING_RECORDS);

  assert.ok(overlap.length > 1);
  for (const record of overlap) {
    assert.deepEqual(positions.get(record.id), {
      voltage: record.voltage,
      pulses: record.pulses
    });
  }
});

function polingRecord(
  id: string,
  voltage: number,
  pulses: number,
  displayOrder?: number
): PolingRecord {
  return {
    id,
    specimenReference: `SPECIMEN-${id}`,
    dieLabel: `R1C${id}`,
    voltage,
    pulses,
    pulseWidthMs: 10,
    displayOrder
  };
}

test("exact-coordinate selection cycles in display order and wraps", () => {
  const first = polingRecord("1", 500, 20, 10);
  const second = polingRecord("2", 500, 20, 20);
  const third = polingRecord("3", 500, 20, 30);
  const records = [third, first, second];

  assert.equal(getNextPolingOverlapRecord(records, first, null), first);
  assert.equal(getNextPolingOverlapRecord(records, first, first.id), second);
  assert.equal(getNextPolingOverlapRecord(records, first, second.id), third);
  assert.equal(getNextPolingOverlapRecord(records, first, third.id), first);
});

test("a singleton exact-coordinate stack keeps the clicked record selected", () => {
  const record = polingRecord("1", 480, 5);

  assert.equal(getNextPolingOverlapRecord([record], record, null), record);
  assert.equal(getNextPolingOverlapRecord([record], record, record.id), record);
});

test("overlap cycling uses only visible records while retaining display order", () => {
  const hidden = polingRecord("hidden", 510, 10);
  const firstVisible = polingRecord("first", 510, 10, 10);
  const secondVisible = polingRecord("second", 510, 10, 20);
  const differentCoordinate = polingRecord("different", 500, 10);
  const visibleRecords = [secondVisible, differentCoordinate, firstVisible];

  assert.equal(
    getNextPolingOverlapRecord(visibleRecords, firstVisible, hidden.id),
    firstVisible
  );
  assert.equal(
    getNextPolingOverlapRecord(visibleRecords, firstVisible, firstVisible.id),
    secondVisible
  );
  assert.equal(
    getNextPolingOverlapRecord(visibleRecords, firstVisible, secondVisible.id),
    firstVisible
  );
});

test("keyboard traversal visits every overlap in both directions without wrapping", () => {
  const first = polingRecord("1", 510, 10, 10);
  const second = polingRecord("2", 510, 10, 20);
  const third = polingRecord("3", 510, 10, 30);
  const records = [third, first, second];

  assert.equal(getAdjacentPolingOverlapRecord(records, first, 1), second);
  assert.equal(getAdjacentPolingOverlapRecord(records, second, 1), third);
  assert.equal(getAdjacentPolingOverlapRecord(records, third, 1), null);
  assert.equal(getAdjacentPolingOverlapRecord(records, third, -1), second);
  assert.equal(getAdjacentPolingOverlapRecord(records, second, -1), first);
  assert.equal(getAdjacentPolingOverlapRecord(records, first, -1), null);
});

test("keyboard overlap traversal excludes filtered records and ignores singletons", () => {
  const visible = polingRecord("visible", 480, 5, 10);
  const filtered = polingRecord("filtered", 480, 5, 20);

  assert.equal(getAdjacentPolingOverlapRecord([visible], visible, 1), null);
  assert.equal(getAdjacentPolingOverlapRecord([visible], filtered, -1), null);
});
