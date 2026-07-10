import assert from "node:assert/strict";
import test from "node:test";
import { mapProfilesToTeamMembers, type TeamDirectoryProfile } from "./teamDirectory";

function profile(overrides: Partial<TeamDirectoryProfile>): TeamDirectoryProfile {
  return {
    id: "profile-id",
    display_name: "Process User",
    email: "user@mcmaster.ca",
    role: "researcher",
    is_active: true,
    ...overrides
  };
}

test("maps active signed-up profiles independently of project membership", () => {
  const team = mapProfilesToTeamMembers([
    profile({ id: "saeed", display_name: "Saeed Oghbaey", email: "oghbaeys@mcmaster.ca" }),
    profile({ id: "mulei", display_name: "Mulei", email: "wu1272@mcmaster.ca" }),
    profile({ id: "william", display_name: "William Xu", email: "xu803@mcmaster.ca", role: "admin" })
  ]);

  assert.deepEqual(team, [
    { id: "saeed", initials: "SO", name: "Saeed Oghbaey", role: "Researcher" },
    { id: "mulei", initials: "M", name: "Mulei", role: "Researcher" },
    { id: "william", initials: "WX", name: "William Xu", role: "Admin" }
  ]);
});

test("excludes inactive, seeded local, and automation profiles", () => {
  const team = mapProfilesToTeamMembers([
    profile({ id: "inactive", is_active: false }),
    profile({ id: "seeded", email: "william@waferwatch.local" }),
    profile({ id: "playwright", display_name: "Playwright User", email: "pw-user@gmail.com" }),
    profile({ id: "timeline", display_name: "Timeline Test", email: "timeline.test.20260616@gmail.com" }),
    profile({ id: "real", display_name: "Leila", email: "leila@mcmaster.ca" })
  ]);

  assert.deepEqual(team, [
    { id: "real", initials: "L", name: "Leila", role: "Researcher" }
  ]);
});
