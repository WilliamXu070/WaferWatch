import assert from "node:assert/strict";
import test from "node:test";
import catalog from "./polingCatalog.json";
import {
  POLING_SERIES_PALETTE,
  buildPolingPointPositions,
  getNextPolingOverlapRecord,
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
  pulses: number
): PolingRecord {
  return {
    id,
    specimenReference: `SPECIMEN-${id}`,
    dieLabel: `R1C${id}`,
    voltage,
    pulses,
    pulseWidthMs: 10
  };
}

test("exact-coordinate selection cycles in visible order and wraps", () => {
  const first = polingRecord("1", 500, 20);
  const second = polingRecord("2", 500, 20);
  const third = polingRecord("3", 500, 20);
  const records = [first, second, third];

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

test("overlap cycling uses only the supplied visible records and their order", () => {
  const hidden = polingRecord("hidden", 510, 10);
  const firstVisible = polingRecord("first", 510, 10);
  const secondVisible = polingRecord("second", 510, 10);
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
