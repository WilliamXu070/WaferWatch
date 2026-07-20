import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LinkedNoteText } from "./LinkedNoteText";

test("turns explicit and www note URLs into safe links", () => {
  const markup = renderToStaticMarkup(
    <p>
      <LinkedNoteText>
        {"Results: https://example.com/runs/42 and www.example.org/report."}
      </LinkedNoteText>
    </p>
  );

  assert.match(markup, /href="https:\/\/example\.com\/runs\/42"/);
  assert.match(markup, /href="https:\/\/www\.example\.org\/report"/);
  assert.equal((markup.match(/target="_blank"/g) ?? []).length, 2);
  assert.equal((markup.match(/rel="noopener noreferrer"/g) ?? []).length, 2);
  assert.match(markup, /report<\/a>\.<\/p>$/);
});

test("preserves line breaks and keeps balanced URL punctuation", () => {
  const markup = renderToStaticMarkup(
    <p>
      <LinkedNoteText>{"First line\nSee https://example.com/wiki/Test_(result))."}</LinkedNoteText>
    </p>
  );

  assert.match(markup, /First line\nSee /);
  assert.match(markup, /href="https:\/\/example\.com\/wiki\/Test_\(result\)"/);
  assert.match(markup, /result\)<\/a>\)\.<\/p>$/);
});

test("does not make unsupported schemes clickable", () => {
  const markup = renderToStaticMarkup(
    <p>
      <LinkedNoteText>{"Do not open javascript:alert(1) or file:///tmp/report."}</LinkedNoteText>
    </p>
  );

  assert.doesNotMatch(markup, /<a /);
  assert.match(markup, /javascript:alert\(1\)/);
  assert.match(markup, /file:\/\/\/tmp\/report/);
});

test("Wafer Status uses linked text for latest, history, and completion notes", async () => {
  const source = await readFile(new URL("./WaferDieNotes.tsx", import.meta.url), "utf8");

  assert.match(source, /<LinkedNoteText>\{note\.body\}<\/LinkedNoteText>/);
  assert.equal((source.match(/<LinkedNoteText>\{note\.body\}<\/LinkedNoteText>/g) ?? []).length, 2);
  assert.match(source, /<LinkedNoteText>\{selectedVisit\.completionNote\}<\/LinkedNoteText>/);
});
