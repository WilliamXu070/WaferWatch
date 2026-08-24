import { GoldenFixtureRun } from "./lib/fixtures.mjs";
import { writeManifest } from "./lib/environment.mjs";

export default async function globalSetup() {
  const fixtures = new GoldenFixtureRun();
  const manifest = await fixtures.seedAll();
  writeManifest(manifest);
}
