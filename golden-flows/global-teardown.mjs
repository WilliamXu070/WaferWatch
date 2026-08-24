import fs from "node:fs";
import { manifestPath, readManifest } from "./lib/environment.mjs";
import { teardownGoldenRun } from "./lib/fixtures.mjs";

export default async function globalTeardown() {
  if (!fs.existsSync(manifestPath) || process.env.GOLDEN_KEEP_FIXTURES === "1") return;
  await teardownGoldenRun(readManifest());
}
