import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MobileWaferSelectionBar } from "./MobileWaferSelectionBar";

test("keeps iPhone die selection compact and drag-first", () => {
  const markup = renderToStaticMarkup(
    <MobileWaferSelectionBar
      label="A2 selected"
      canDelete
      deleteLabel="Delete die"
      isPending={false}
      onClear={() => undefined}
      onDelete={() => undefined}
    />
  );

  assert.match(markup, /A2 selected/);
  assert.match(markup, /Drag to move/);
  assert.match(markup, />Clear</);
  assert.match(markup, />Delete die</);
  assert.doesNotMatch(markup, /Move to|Complete|Archive/);
});
