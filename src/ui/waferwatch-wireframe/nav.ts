import type { ProcessSummary } from "./types";

export type SidebarNavItem = {
  key: string;
  label: string;
  href: string;
  icon: "grid" | "calendar" | "flow" | "waferStatus";
  badge?: number;
};

export type SidebarTeamMember = {
  initials: string;
  name: string;
  role: string;
};

export const wireframeBrand = {
  name: "WaferWatch"
} as const;

export const mainNav: readonly SidebarNavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/wireframe/dashboard", icon: "grid" },
  { key: "calendar", label: "Calendar", href: "/wireframe/calendar", icon: "calendar", badge: 8 }
];

export const processNav: readonly SidebarNavItem[] = [
  { key: "process-flow", label: "Process Flow", href: "/wireframe/process-flow", icon: "flow" },
  { key: "wafer-status", label: "Wafer / Die Status", href: "/wireframe/wafer-status", icon: "waferStatus" }
];

export const currentProcess: ProcessSummary = {
  id: "alpha-poling-r2",
  name: "ALPHA Poling R2",
  version: "R2",
  activeDieCount: 18
};

export const teamMembers: readonly SidebarTeamMember[] = [
  { initials: "AD", name: "Adam", role: "Process lead" },
  { initials: "BA", name: "Barbara", role: "Inspection" },
  { initials: "WI", name: "William", role: "Admin" }
];
