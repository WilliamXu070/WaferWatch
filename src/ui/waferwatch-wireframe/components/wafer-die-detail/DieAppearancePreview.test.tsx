import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DieAppearanceTemplate } from "./DieAppearanceTemplate";

test("renders the neutral die template before an operator uploads an appearance image", () => {
  const markup = renderToStaticMarkup(<DieAppearanceTemplate />);

  assert.match(markup, /aria-label="Die template preview"/);
  assert.match(markup, /viewBox="0 0 180 140"/);
  assert.match(markup, /M31 16h96l22 22v86H31V16Z/);
});
