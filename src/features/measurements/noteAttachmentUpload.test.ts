import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("text-only notes return before requesting a signed upload", async () => {
  const source = await readFile(new URL("./noteAttachmentUpload.ts", import.meta.url), "utf8");
  const functionStart = source.indexOf("export async function uploadWaferNoteAttachments");
  const emptyFilesGuard = source.indexOf("if (selectedFiles.length === 0) return [];", functionStart);
  const signedUploadRequest = source.indexOf('fetch("/api/storage/signed-upload"', functionStart);

  assert.notEqual(functionStart, -1);
  assert.notEqual(emptyFilesGuard, -1);
  assert.notEqual(signedUploadRequest, -1);
  assert.ok(emptyFilesGuard < signedUploadRequest);
});
