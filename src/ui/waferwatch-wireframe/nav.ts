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

export type NavBasePath = "" | "/wireframe";

function withBasePath(path: string, navBasePath: NavBasePath) {
  return `${navBasePath}${path}`;
}

export function getMainNav(navBasePath: NavBasePath = ""): readonly SidebarNavItem[] {
  return [
    { key: "dashboard", label: "Dashboard", href: withBasePath("/dashboard", navBasePath), icon: "grid" },
    { key: "calendar", label: "Calendar", href: withBasePath("/calendar", navBasePath), icon: "calendar" }
  ];
}

export function getProcessNav(navBasePath: NavBasePath = ""): readonly SidebarNavItem[] {
  return [
    { key: "process-flow", label: "Process Flow", href: withBasePath("/process-flow", navBasePath), icon: "flow" },
    { key: "wafer-status", label: "Wafer / Die Status", href: withBasePath("/wafer-status", navBasePath), icon: "waferStatus" }
  ];
}

export const mainNav: readonly SidebarNavItem[] = [
  ...getMainNav("/wireframe")
];

export const processNav: readonly SidebarNavItem[] = [
  ...getProcessNav("/wireframe")
];
