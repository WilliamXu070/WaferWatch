import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WaferGeometryPreview } from "./WaferGeometryPreview";

test("queued wafer geometry remains fully visible inside its preview", () => {
  const markup = renderToStaticMarkup(
    <WaferGeometryPreview
      className="h-full w-full max-w-[220px]"
      colorSeed="NU"
      modeKeyword="post-dice"
      selectedDieCode="N3"
    />
  );

  assert.doesNotMatch(markup, /opacity-50/);
  assert.match(markup, /<svg[^>]*class="h-full w-full max-w-\[220px\]"/);
});
