import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MobileWaferSelectionBar } from "./MobileWaferSelectionBar";

test("offers touch-safe iPhone movement, checkpoint, and delete actions", () => {
  const markup = renderToStaticMarkup(
    <MobileWaferSelectionBar
      label="A2 selected"
      moveTargets={[{ id: "cleaning", label: "Cleaning" }]}
      canSubmitCheckpoint
      canDelete
      deleteLabel="Delete die"
      isPending={false}
      onClear={() => undefined}
      onDelete={() => undefined}
      onMove={() => undefined}
      onSubmitCheckpoint={() => undefined}
    />
  );

  assert.match(markup, /A2 selected/);
  assert.match(markup, /Tap an action or drag on the map/);
  assert.match(markup, /Move to/);
  assert.match(markup, /Cleaning/);
  assert.match(markup, /Submit review/);
  assert.match(markup, />Clear</);
  assert.match(markup, />Delete die</);
});
