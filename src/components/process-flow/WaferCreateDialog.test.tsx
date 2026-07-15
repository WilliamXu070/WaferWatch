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
  assert.match(markup, /id="flow-wafer-create-name"/);
  assert.match(markup, /name="waferCode"/);
  assert.match(markup, /id="flow-wafer-create-size"/);
  assert.match(markup, /name="diameterMm"/);
  assert.match(markup, /<option value="150" selected="">150 mm<\/option>/);
  assert.match(markup, />Create wafer<\/button>/);
});

test("renders a create failure inside the dialog", () => {
  const markup = renderToStaticMarkup(
    <WaferCreateDialog
      draft={{ waferCode: "RHO", diameterMm: 100 }}
      errorMessage="A wafer named RHO already exists."
      isPending={false}
      onCancel={() => undefined}
      onChange={() => undefined}
      onSubmit={() => undefined}
    />
  );

  assert.match(markup, /role="alert"/);
  assert.match(markup, /A wafer named RHO already exists\./);
});
