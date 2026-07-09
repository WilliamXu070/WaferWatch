"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { WireframeShellDto } from "@/features/wireframe/types";
import type { CreateProcessAction, UpdateProcessNameAction } from "./WaferWatchShell";
import {
  CalendarIcon,
  ChevronRightIcon,
  FlowIcon,
  GridIcon,
  HelpIcon,
  PlusIcon,
  WaferLogoIcon,
  WaferStatusIcon
} from "../icons";
import {
  getMainNav,
  getProcessNav,
  type NavBasePath,
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
          ? "bg-[#f3f4f6] font-semibold text-[#151512]"
          : "font-medium text-[#55534a] hover:bg-[#f8f9fb]"
      ].join(" ")}
    >
      <Icon className={active ? "text-[#151512]" : "text-[#8a887b]"} />
      <span className="flex-1">{item.label}</span>
      {item.badge ? (
        <span className="min-w-[22px] rounded-full bg-[#f3f4f6] px-1.5 py-0.5 text-center text-[11px] font-semibold text-[#55534a]">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function hrefWithProcess(href: string, processId: string) {
  return `${href}?processId=${encodeURIComponent(processId)}`;
}

function withCurrentProcess(href: string, processId: string | null | undefined) {
  return processId ? hrefWithProcess(href, processId) : href;
}

export function WireframeSidebar({
  shell,
  navBasePath = "",
  onUpdateProcessName,
  onCreateProcess
}: {
  shell: WireframeShellDto;
  navBasePath?: NavBasePath;
  onUpdateProcessName?: UpdateProcessNameAction;
  onCreateProcess?: CreateProcessAction;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const selectedProcessId = searchParams.get("processId");
  const currentProcess = shell.currentProcess;
  const mainNav = getMainNav(navBasePath).map((item) => ({
    ...item,
    href: withCurrentProcess(item.href, currentProcess?.id)
  }));
  const processNav = getProcessNav(navBasePath);

  // expanded = sub-nav visible; toggled by single click
  const [expanded, setExpanded] = useState(() => Boolean(currentProcess && selectedProcessId === currentProcess.id));
  const processDrawerOpen = !currentProcess || expanded;
  const processIsSelected = Boolean(currentProcess && expanded);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const processActive = processIsSelected && processNav.some((item) => isActive(item.href));

  // inline rename
  const [isEditing, setIsEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(currentProcess?.name ?? "");
  const [isCreatingProcess, setIsCreatingProcess] = useState(false);
  const [createNameDraft, setCreateNameDraft] = useState("");
  const [, startRename] = useTransition();
  const [, startCreate] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const createInFlightRef = useRef(false);

  const startEditing = () => {
    if (!currentProcess) return;
    setNameDraft(currentProcess.name);
    setIsEditing(true);
    // focus on next tick after render
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitRename = () => {
    const next = nameDraft.trim();
    if (!currentProcess || !onUpdateProcessName || next.length < 2) {
      setIsEditing(false);
      return;
    }
    if (next === currentProcess.name) {
      setIsEditing(false);
      return;
    }
    startRename(() => {
      void onUpdateProcessName({ templateId: currentProcess.id, name: next }).then((res) => {
        if (res.ok) router.refresh();
      });
    });
    setIsEditing(false);
  };

  const cancelRename = () => {
    setIsEditing(false);
    setNameDraft(currentProcess?.name ?? "");
  };

  const handleProcessClick = () => {
    if (!currentProcess || isEditing) return;
    setExpanded((prev) => !prev);
  };

  const handleProcessDoubleClick = () => {
    if (!currentProcess || !onUpdateProcessName) return;
    if (!expanded) setExpanded(true);
    startEditing();
  };

  const startCreatingProcess = () => {
    if (!onCreateProcess) return;
    setCreateNameDraft("");
    setIsCreatingProcess(true);
    setTimeout(() => createInputRef.current?.focus(), 0);
  };

  const cancelCreatingProcess = () => {
    setIsCreatingProcess(false);
    setCreateNameDraft("");
  };

  const commitCreateProcess = () => {
    if (!onCreateProcess) return;
    if (createInFlightRef.current) return;
    const nextName = createNameDraft.trim();
    if (nextName.length < 2) {
      cancelCreatingProcess();
      return;
    }

    createInFlightRef.current = true;
    startCreate(() => {
      void onCreateProcess({
        name: nextName,
        version: "1.0",
        isActive: true
      }).then((res) => {
        createInFlightRef.current = false;
        if (!res.ok) return;
        setIsCreatingProcess(false);
        setCreateNameDraft("");
        router.refresh();
        router.push(hrefWithProcess(`${navBasePath}/process-flow`, res.data.id));
      }).catch(() => {
        createInFlightRef.current = false;
      });
    });
  };

  return (
    <aside className="wireframe-sidebar hidden h-full w-[264px] shrink-0 flex-col border-r border-[#e9e9df] bg-white px-4 py-5 md:flex">
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
            "rounded-xl px-3 py-2.5 text-sm transition-all",
            processIsSelected
              ? "bg-[#f3f4f6] font-semibold text-[#151512]"
              : "font-medium text-[#55534a]"
          ].join(" ")}
        >
          <div className="flex items-center gap-3">
            <CalendarIcon className="shrink-0 text-[#8a887b]" />
            {isEditing && currentProcess ? (
              <input
                ref={inputRef}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.currentTarget.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                  if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
                }}
                className="min-w-0 flex-1 rounded-md border border-[#d1d5db] bg-white px-2 py-0.5 text-[13px] font-semibold text-[#151512] outline-none focus:border-[#151512]"
                aria-label="Process name"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={handleProcessClick}
                onDoubleClick={handleProcessDoubleClick}
                disabled={!currentProcess}
                title={onUpdateProcessName ? "Click to expand · Double-click to rename" : "Click to expand"}
                className="min-w-0 flex-1 truncate text-left disabled:cursor-default"
                aria-pressed={processIsSelected}
              >
                {currentProcess?.name ?? "No active process"}
              </button>
            )}
            {currentProcess ? (
              <span className="min-w-[22px] rounded-full bg-[#f3f4f6] px-1.5 py-0.5 text-center text-[11px] font-semibold text-[#55534a]">
                {currentProcess.activeDieCount}
              </span>
            ) : null}
          </div>
        </div>

        {/* Animated process drawer: create tile + Process Flow + Wafer / Die Status */}
        <div
          className={[
            "grid transition-[grid-template-rows,opacity,transform] duration-200 ease-out",
            processDrawerOpen
              ? "grid-rows-[1fr] opacity-100 translate-y-0"
              : "grid-rows-[0fr] opacity-0 -translate-y-1"
          ].join(" ")}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-2 flex flex-col gap-2">
              {onCreateProcess ? (
                isCreatingProcess ? (
                  <div className="flex items-center gap-2 rounded-xl border border-dashed border-[#b7b6aa] bg-white px-3 py-2.5 text-sm">
                    <PlusIcon className="shrink-0 text-[#8a887b]" />
                    <input
                      ref={createInputRef}
                      value={createNameDraft}
                      onChange={(event) => setCreateNameDraft(event.currentTarget.value)}
                      onBlur={commitCreateProcess}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitCreateProcess();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelCreatingProcess();
                        }
                      }}
                      className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-[#151512] outline-none placeholder:text-[#98968a]"
                      placeholder="Name new process"
                      aria-label="New process name"
                      autoFocus
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startCreatingProcess}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#c9c8be] bg-white px-3 py-2.5 text-[13px] font-semibold text-[#55534a] transition-colors hover:border-[#151512] hover:bg-[#f8f9fb] hover:text-[#151512]"
                    aria-label="Add process"
                  >
                    <PlusIcon className="text-[#8a887b]" />
                    New process
                  </button>
                )
              ) : null}
              {currentProcess
                ? processNav.map((item) => {
                    const Icon = iconByKey[item.icon];
                    const active = processActive && isActive(item.href);
                    return (
                      <Link
                        key={item.key}
                        href={hrefWithProcess(item.href, currentProcess.id)}
                        aria-current={active ? "page" : undefined}
                        className={[
                          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
                          active
                            ? "bg-[#f3f4f6] font-semibold text-[#151512]"
                            : "font-medium text-[#6b6a5f] hover:bg-[#f8f9fb]"
                        ].join(" ")}
                      >
                        <Icon className={active ? "text-[#151512]" : "text-[#9c9a8c]"} />
                        {item.label}
                      </Link>
                    );
                  })
                : null}
            </div>
          </div>
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
                <span className="grid h-8 w-8 place-items-center rounded-full border border-[#e5e7eb] bg-[#f8fafc] text-[11px] font-semibold text-[#55534a]">
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

      <div className="mt-auto border-t border-[#eef0f3] pt-4">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#55534a] transition-colors hover:bg-[#f8f9fb]"
        >
          <HelpIcon className="text-[#8a887b]" />
          <span className="flex-1 text-left">Help &amp; support</span>
          <ChevronRightIcon className="text-[#9c9a8c]" />
        </button>
      </div>
    </aside>
  );
}
