"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WireframeShellDto } from "@/features/wireframe/types";
import {
  CalendarIcon,
  ChevronRightIcon,
  FlowIcon,
  GridIcon,
  HelpIcon,
  WaferLogoIcon,
  WaferStatusIcon
} from "../icons";
import {
  mainNav,
  processNav,
  wireframeBrand,
  type SidebarNavItem
} from "../nav";

const iconByKey = {
  grid: GridIcon,
  calendar: CalendarIcon,
  flow: FlowIcon,
  waferStatus: WaferStatusIcon
} as const;

function NavRow({ item, active }: { item: SidebarNavItem; active: boolean }) {
  const Icon = iconByKey[item.icon];

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={[
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
        active
          ? "bg-[#f2f2e8] font-semibold text-[#151512]"
          : "font-medium text-[#55534a] hover:bg-[#f7f7ee]"
      ].join(" ")}
    >
      <Icon className={active ? "text-[#151512]" : "text-[#8a887b]"} />
      <span className="flex-1">{item.label}</span>
      {item.badge ? (
        <span className="min-w-[22px] rounded-full bg-[#efefe3] px-1.5 py-0.5 text-center text-[11px] font-semibold text-[#55534a]">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function WireframeSidebar({ shell }: { shell: WireframeShellDto }) {
  const pathname = usePathname() ?? "";
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const processActive = processNav.some((item) => isActive(item.href));

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-[#e9e9df] bg-white px-4 py-5">
      <div className="flex items-center gap-2.5 px-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#141412] text-white">
          <WaferLogoIcon />
        </span>
        <span className="text-[17px] font-semibold tracking-tight text-[#151512]">
          {wireframeBrand.name}
        </span>
      </div>

      <nav className="mt-7 flex flex-col gap-1" aria-label="Main">
        <p className="px-3 pb-1 text-[11px] font-semibold tracking-[0.06em] text-[#98968a]">
          Main
        </p>
        {mainNav.map((item) => {
          const badge =
            item.key === "calendar" && shell.calendarEventCount > 0
              ? shell.calendarEventCount
              : item.badge;

          return <NavRow key={item.key} item={{ ...item, badge }} active={isActive(item.href)} />;
        })}
      </nav>

      <div className="mt-7">
        <p className="px-3 pb-1 text-[11px] font-semibold tracking-[0.06em] text-[#98968a]">
          Current process
        </p>
        <div
          className={[
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
            processActive
              ? "bg-[#f2f2e8] font-semibold text-[#151512]"
              : "font-medium text-[#55534a]"
          ].join(" ")}
        >
          <CalendarIcon className="text-[#8a887b]" />
          <span className="flex-1">{shell.currentProcess?.name ?? "No active process"}</span>
          <span className="min-w-[22px] rounded-full bg-[#efefe3] px-1.5 py-0.5 text-center text-[11px] font-semibold text-[#55534a]">
            {shell.currentProcess?.activeDieCount ?? 0}
          </span>
        </div>
        <div className="mt-1 flex flex-col gap-1 pl-3">
          {processNav.map((item) => {
            const Icon = iconByKey[item.icon];
            const active = isActive(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
                  active
                    ? "bg-[#f2f2e8] font-semibold text-[#151512]"
                    : "font-medium text-[#6b6a5f] hover:bg-[#f7f7ee]"
                ].join(" ")}
              >
                <Icon className={active ? "text-[#151512]" : "text-[#9c9a8c]"} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-7">
        <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.06em] text-[#98968a]">
          Team
        </p>
        {shell.teamMembers.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {shell.teamMembers.map((member) => (
              <li key={member.id} className="flex items-center gap-3 px-3 py-1.5">
                <span className="grid h-8 w-8 place-items-center rounded-full border border-[#e4e3d8] bg-[#faf9f3] text-[11px] font-semibold text-[#55534a]">
                  {member.initials}
                </span>
                <span className="leading-tight">
                  <span className="block text-[13px] font-semibold text-[#151512]">{member.name}</span>
                  <span className="block text-[11px] text-[#98968a]">{member.role}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 text-[13px] font-medium text-[#6b6a5f]">No active team members</p>
        )}
      </div>

      <div className="mt-auto border-t border-[#eeeee4] pt-4">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#55534a] transition-colors hover:bg-[#f7f7ee]"
        >
          <HelpIcon className="text-[#8a887b]" />
          <span className="flex-1 text-left">Help &amp; support</span>
          <ChevronRightIcon className="text-[#9c9a8c]" />
        </button>
      </div>
    </aside>
  );
}
