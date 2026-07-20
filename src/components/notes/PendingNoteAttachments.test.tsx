import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PendingNoteAttachments } from "./PendingNoteAttachments";

test("offers explicit iPhone camera, photo library, and file inputs", () => {
  const markup = renderToStaticMarkup(
    <PendingNoteAttachments
      files={[]}
      onAddFiles={() => undefined}
      onRemoveFile={() => undefined}
    />
  );

  assert.match(markup, /Take photo/);
  assert.match(markup, /Photo library/);
  assert.match(markup, /capture="environment"/);
  assert.match(markup, /accept="image\/\*/);
  assert.match(markup, />Files</);
  assert.match(markup, /Attach files/);
  assert.equal((markup.match(/type="file"/g) ?? []).length, 3);
});
