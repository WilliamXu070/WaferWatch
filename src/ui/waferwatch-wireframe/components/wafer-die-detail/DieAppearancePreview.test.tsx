import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DieAppearanceTemplate } from "./DieAppearanceTemplate";

test("renders the neutral die template before an operator uploads an appearance image", () => {
  const markup = renderToStaticMarkup(<DieAppearanceTemplate />);

  assert.match(markup, /aria-label="Die template preview"/);
  assert.match(markup, /viewBox="0 0 180 140"/);
  assert.match(markup, /M31 16h96l22 22v86H31V16Z/);
});

test("renders appearance previews from the Status model without mount-time server functions", async () => {
  const source = await readFile(new URL("./DieAppearancePreview.tsx", import.meta.url), "utf8");

  assert.match(source, /tile\.appearance\?\.imageUrl/);
  assert.doesNotMatch(source, /getTextSurface/);
  assert.doesNotMatch(source, /getAttachmentDownloadUrl/);
  assert.doesNotMatch(source, /WORKFLOW_REALTIME_EVENT/);
});
