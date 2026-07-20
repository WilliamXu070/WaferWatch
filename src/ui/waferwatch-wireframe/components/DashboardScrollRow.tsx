import type { ReactNode } from "react";

export function DashboardScrollRow({
  label,
  children,
  className = ""
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={["dashboard-scroll-row", className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}
