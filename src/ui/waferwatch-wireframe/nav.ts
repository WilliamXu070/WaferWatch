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
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "grid" },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: "calendar" }
];

export const processNav: readonly SidebarNavItem[] = [
  { key: "process-flow", label: "Process Flow", href: "/process-flow", icon: "flow" },
  { key: "wafer-status", label: "Wafer / Die Status", href: "/wafer-status", icon: "waferStatus" }
];
