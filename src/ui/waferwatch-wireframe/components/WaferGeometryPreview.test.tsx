import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WaferStatusTile } from "./WaferStatusTile";

test("queued wafer geometry remains fully visible inside its interactive tile", () => {
  const markup = renderToStaticMarkup(
    <WaferStatusTile
      tile={{
        id: "nu-n3",
        projectId: "project-1",
        waferId: "wafer-1",
        code: "N3",
        family: "NU",
        dieLabel: "N3",
        stepLabel: "Testing",
        status: "queued",
        waferStateName: "post-dice",
        mode: "diced"
      }}
      selected
      isUndiced={false}
      onSelect={() => undefined}
    />
  );

  assert.doesNotMatch(markup, /opacity-50/);
  assert.match(markup, /<svg[^>]*class="h-full w-full max-w-\[220px\]"/);
  assert.match(markup, /<button[^>]*aria-pressed="true"/);
});
