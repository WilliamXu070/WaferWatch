#!/usr/bin/env node
import fs from "node:fs";
import { GoldenFixtureRun, teardownGoldenRun } from "./lib/fixtures.mjs";
import { manifestPath, readManifest, writeManifest } from "./lib/environment.mjs";

const command = process.argv[2] || "seed";
if (command === "seed") {
  if (fs.existsSync(manifestPath)) throw new Error("A golden-flow manifest already exists. Teardown it first.");
  const fixtures = new GoldenFixtureRun();
  const manifest = await fixtures.seedAll();
  writeManifest(manifest);
  console.log(JSON.stringify({ runId: manifest.runId, scenarios: Object.keys(manifest.scenarios) }, null, 2));
} else if (command === "teardown") {
  if (fs.existsSync(manifestPath)) {
    await teardownGoldenRun(readManifest());
    fs.rmSync(manifestPath, { force: true });
  }
} else if (command === "show") {
  console.log(JSON.stringify(readManifest(), null, 2));
} else {
  throw new Error(`Unknown command ${command}; expected seed, teardown, or show.`);
}
