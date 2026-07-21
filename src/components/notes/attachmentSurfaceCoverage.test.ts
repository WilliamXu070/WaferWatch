import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function findTsxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return findTsxFiles(absolutePath);
    }
    return entry.isFile() && entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")
      ? [absolutePath]
      : [];
  }));
  return nested.flat();
}

test("every native file-input surface also accepts drag and drop", async () => {
  const files = await findTsxFiles(srcRoot);
  const uncovered: string[] = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/type=["']file["']/.test(source) && !/useDropzone/.test(source)) {
      uncovered.push(path.relative(srcRoot, file));
    }
  }

  assert.deepEqual(uncovered, []);
});

test("all persistent note attachment editors use the shared drop zone", async () => {
  const noteEditors = [
    path.join(srcRoot, "components/ProcessFlowDiagram.tsx"),
    path.join(srcRoot, "components/process-flow/StepParameterEntryDialog.tsx"),
    path.join(srcRoot, "ui/waferwatch-wireframe/components/wafer-die-detail/WaferDieNotes.tsx")
  ];

  for (const noteEditor of noteEditors) {
    const source = await readFile(noteEditor, "utf8");
    assert.match(source, /<PendingNoteAttachments/);
  }
});
