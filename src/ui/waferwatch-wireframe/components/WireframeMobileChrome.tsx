"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { WireframeShellDto } from "@/features/wireframe/types";
import type { CreateProcessAction } from "./WaferWatchShell";
import {
  CalendarIcon,
  CloseIcon,
  FlowIcon,
  GridIcon,
  MenuIcon,
  PlusIcon,
  SearchIcon,
  UserIcon,
  WaferLogoIcon,
  WaferStatusIcon
} from "../icons";
import {
  getMainNav,
  getProcessNav,
  type NavBasePath,
  type SidebarNavItem,
  wireframeBrand
} from "../nav";

const iconByKey = {
  grid: GridIcon,
  calendar: CalendarIcon,
  flow: FlowIcon,
  waferStatus: WaferStatusIcon
} as const;

function hrefWithProcess(href: string, processId: string) {
  return `${href}?processId=${encodeURIComponent(processId)}`;
}

function withCurrentProcess(href: string, processId: string | null | undefined) {
  return processId ? hrefWithProcess(href, processId) : href;
}

function MobileNavLink({
  item,
  active,
  onClick,
  onIntent
}: {
  item: SidebarNavItem;
  active: boolean;
  onClick?: () => void;
  onIntent?: () => void;
}) {
  const Icon = iconByKey[item.icon];

  return (
    <Link
      href={item.href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      onPointerEnter={onIntent}
      onTouchStart={onIntent}
      className={[
        "flex min-h-[46px] items-center gap-3 rounded-xl px-3 text-[14px] font-semibold transition-colors",
        active ? "bg-[#f0f1f3] text-[#151512]" : "text-[#55534a] hover:bg-[#f8f9fb]"
      ].join(" ")}
    >
      <Icon className={active ? "text-[#151512]" : "text-[#8a887b]"} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span className="rounded-full bg-[#eceef1] px-2 py-0.5 text-[11px] font-semibold text-[#55534a]">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function WireframeMobileChrome({
  shell,
  navBasePath = "",
  onSignOut,
  onCreateProcess
}: {
  shell: WireframeShellDto;
  navBasePath?: NavBasePath;
  onSignOut?: () => void | Promise<void>;
  onCreateProcess?: CreateProcessAction;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedProcessId = searchParams.get("processId");
  const currentProcess = shell.currentProcess;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isCreatingProcess, setIsCreatingProcess] = useState(false);
  const [createNameDraft, setCreateNameDraft] = useState("");
  const [, startCreate] = useTransition();
  const createInputRef = useRef<HTMLInputElement>(null);
  const createInFlightRef = useRef(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const mainNav = getMainNav(navBasePath).map((item) => ({
    ...item,
    href: withCurrentProcess(item.href, currentProcess?.id),
    badge: item.key === "calendar" && shell.calendarEventCount > 0 ? shell.calendarEventCount : item.badge
  }));
  const processNav = currentProcess
    ? getProcessNav(navBasePath).map((item) => ({
        ...item,
        href: hrefWithProcess(item.href, currentProcess.id)
      }))
    : getProcessNav(navBasePath);
  const bottomNav = [...mainNav, ...processNav];
  const currentProcessSelected = Boolean(currentProcess && selectedProcessId === currentProcess.id);

  const startCreatingProcess = () => {
    if (!onCreateProcess) return;
    setCreateNameDraft("");
    setIsCreatingProcess(true);
    setTimeout(() => createInputRef.current?.focus(), 0);
  };

  const cancelCreatingProcess = () => {
    setCreateNameDraft("");
    setIsCreatingProcess(false);
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
        setDrawerOpen(false);
        router.refresh();
        router.push(hrefWithProcess(`${navBasePath}/process-flow`, res.data.id));
      }).catch(() => {
        createInFlightRef.current = false;
      });
    });
  };

  return (
    <>
      <header className="wireframe-mobile-topbar md:hidden">
        <button
          type="button"
          className="wireframe-mobile-icon-button"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <MenuIcon />
        </button>
        <Link href={`${navBasePath}/dashboard`} className="wireframe-mobile-brand" aria-label="Dashboard">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#141412] text-white">
            <WaferLogoIcon />
          </span>
          <span>{wireframeBrand.name}</span>
        </Link>
        <button type="button" className="wireframe-mobile-icon-button" aria-label="Search">
          <SearchIcon />
        </button>
      </header>

      <nav className="wireframe-mobile-bottom-nav md:hidden" aria-label="Primary mobile navigation">
        {bottomNav.map((item) => {
          const Icon = iconByKey[item.icon];
          const active = isActive(item.href.split("?")[0]);
          const disabledProcessLink = !currentProcess && (item.key === "process-flow" || item.key === "wafer-status");

          return (
            <Link
              key={item.key}
              href={item.href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              onPointerEnter={() => router.prefetch(item.href)}
              onTouchStart={() => router.prefetch(item.href)}
              className={[
                "wireframe-mobile-bottom-nav__item",
                active ? "is-active" : "",
                disabledProcessLink ? "is-disabled" : ""
              ].join(" ")}
            >
              <Icon />
              <span>{item.key === "wafer-status" ? "Status" : item.label.replace("Process ", "")}</span>
            </Link>
          );
        })}
      </nav>

      {drawerOpen ? (
        <div className="wireframe-mobile-drawer md:hidden" role="presentation">
          <button
            type="button"
            className="wireframe-mobile-drawer__scrim"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="wireframe-mobile-drawer__panel" aria-label="Mobile navigation">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#141412] text-white">
                  <WaferLogoIcon />
                </span>
                <span className="truncate text-[17px] font-semibold text-[#151512]">
                  {wireframeBrand.name}
                </span>
              </div>
              <button
                type="button"
                className="wireframe-mobile-icon-button"
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>

            <div className="mt-6 grid gap-6">
              <nav className="grid gap-1" aria-label="Main">
                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98968a]">
                  Main
                </p>
                {mainNav.map((item) => (
                  <MobileNavLink
                    key={item.key}
                  item={item}
                  active={isActive(item.href)}
                  onClick={() => setDrawerOpen(false)}
                  onIntent={() => router.prefetch(item.href)}
                  />
                ))}
              </nav>

              <section className="grid gap-2">
                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98968a]">
                  Current process
                </p>
                <div
                  className={[
                    "rounded-xl border border-[#e7e7e2] px-3 py-3",
                    currentProcessSelected ? "bg-[#f6f7f8]" : "bg-white"
                  ].join(" ")}
                >
                  <p className="truncate text-[14px] font-semibold text-[#151512]">
                    {currentProcess?.name ?? "No active process"}
                  </p>
                  <p className="mt-1 text-[12px] font-semibold text-[#8a887b]">
                    {currentProcess ? `${currentProcess.activeDieCount} active die` : "Create a process to enable flow and status"}
                  </p>
                </div>
                {onCreateProcess ? (
                  isCreatingProcess ? (
                    <div className="flex min-h-[46px] items-center gap-2 rounded-xl border border-dashed border-[#b7b6aa] bg-white px-3">
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
                        className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#151512] outline-none placeholder:text-[#98968a]"
                        placeholder="Name new process"
                        aria-label="New process name"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={startCreatingProcess}
                      className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-dashed border-[#c9c8be] bg-white px-3 text-[14px] font-semibold text-[#55534a]"
                      aria-label="Add process"
                    >
                      <PlusIcon className="text-[#8a887b]" />
                      New process
                    </button>
                  )
                ) : null}
                <nav className="grid gap-1" aria-label="Process">
                  {processNav.map((item) => (
                    <MobileNavLink
                      key={item.key}
                    item={item}
                    active={isActive(item.href.split("?")[0])}
                    onClick={() => setDrawerOpen(false)}
                    onIntent={() => router.prefetch(item.href)}
                    />
                  ))}
                </nav>
              </section>

              <section className="grid gap-2">
                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98968a]">
                  Account
                </p>
                <div className="flex min-h-[46px] items-center gap-3 rounded-xl border border-[#e7e7e2] px-3 text-[14px] font-semibold text-[#55534a]">
                  <UserIcon />
                  Me
                </div>
                {onSignOut ? (
                  <form action={onSignOut}>
                    <button
                      type="submit"
                      className="min-h-[46px] w-full rounded-xl border border-[#e7e7e2] bg-white px-3 text-[14px] font-semibold text-[#44443f]"
                    >
                      Sign out
                    </button>
                  </form>
                ) : null}
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
