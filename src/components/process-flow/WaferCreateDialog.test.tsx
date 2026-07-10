import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WaferCreateDialog } from "./WaferCreateDialog";

test("renders the suggested Greek name and selected wafer size", () => {
  const markup = renderToStaticMarkup(
    <WaferCreateDialog
      draft={{ waferCode: "SIGMA", diameterMm: 150 }}
      isPending={false}
      onCancel={() => undefined}
      onChange={() => undefined}
      onSubmit={() => undefined}
    />
  );

  assert.match(markup, /role="dialog"/);
  assert.match(markup, /value="SIGMA"/);
  assert.match(markup, /<option value="150" selected="">150 mm<\/option>/);
  assert.match(markup, />Create wafer<\/button>/);
});
