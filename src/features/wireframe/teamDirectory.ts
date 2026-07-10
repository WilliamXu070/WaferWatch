import type { WireframeShellTeamMemberDto } from "./types";

export type TeamDirectoryProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  is_active: boolean;
};

function getDisplayName(profile: TeamDirectoryProfile) {
  return profile.display_name?.trim() || profile.email?.trim() || "Process user";
}

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "WW";
}

export function mapProfileToTeamIdentity(profile: TeamDirectoryProfile) {
  const name = getDisplayName(profile);

  return {
    id: profile.id,
    initials: getInitials(name),
    name
  };
}

function getProfileRoleLabel(role: string | null | undefined) {
  if (role === "admin") {
    return "Admin";
  }

  if (role === "process_engineer") {
    return "Process team";
  }

  if (role === "researcher") {
    return "Researcher";
  }

  return "Viewer";
}

export function isVisibleTeamProfile(profile: TeamDirectoryProfile) {
  const name = profile.display_name?.trim().toLowerCase() ?? "";
  const email = profile.email?.trim().toLowerCase() ?? "";

  if (!profile.is_active || email.endsWith("@waferwatch.local")) {
    return false;
  }

  return !(
    name.includes("playwright") ||
    name === "timeline test" ||
    email.startsWith("playwright.") ||
    email.startsWith("pw-user@") ||
    email.startsWith("timeline.test.")
  );
}

export function mapProfilesToTeamMembers(
  profiles: readonly TeamDirectoryProfile[]
): WireframeShellTeamMemberDto[] {
  return profiles
    .filter(isVisibleTeamProfile)
    .map((profile) => {
      const identity = mapProfileToTeamIdentity(profile);

      return {
        ...identity,
        role: getProfileRoleLabel(profile.role)
      };
    });
}
