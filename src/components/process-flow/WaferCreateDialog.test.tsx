import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WaferCreateDialog } from "./WaferCreateDialog";

test("renders the suggested Greek name and die count", () => {
  const markup = renderToStaticMarkup(
    <WaferCreateDialog
      draft={{ waferCode: "SIGMA", dieCount: 15 }}
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
  assert.match(markup, /id="flow-wafer-create-die-count"/);
  assert.match(markup, /name="dieCount"/);
  assert.match(markup, /value="15"/);
  assert.match(markup, /Creates 15 dies labeled SIGMA_1 through SIGMA_15/);
  assert.match(markup, />Create wafer<\/button>/);
});

test("renders a create failure inside the dialog", () => {
  const markup = renderToStaticMarkup(
    <WaferCreateDialog
      draft={{ waferCode: "RHO", dieCount: 10 }}
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
