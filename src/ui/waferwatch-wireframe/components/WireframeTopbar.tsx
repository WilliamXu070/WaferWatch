"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  PlusIcon,
  SearchIcon,
  UserIcon
} from "../icons";
import type { CreateWaferAtProcessStartAction } from "./WaferWatchShell";

export function WireframeTopbar({
  onCreateWaferAtProcessStart,
  onSignOut
}: {
  onCreateWaferAtProcessStart?: CreateWaferAtProcessStartAction;
  onSignOut?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const [isCreatingWafer, startCreateWaferTransition] = useTransition();
  const processTemplateId = searchParams.get("processId");
  const showAddWafer =
    Boolean(onCreateWaferAtProcessStart && processTemplateId) &&
    (pathname === "/process-flow" ||
      pathname.startsWith("/process-flow/") ||
      pathname === "/wireframe/process-flow" ||
      pathname.startsWith("/wireframe/process-flow/"));

  const handleAddWafer = () => {
    if (!onCreateWaferAtProcessStart || !processTemplateId || isCreatingWafer) {
      return;
    }

    const waferCode = window.prompt("Wafer code");
    const trimmedWaferCode = waferCode?.trim();
    if (!trimmedWaferCode) {
      return;
    }

    startCreateWaferTransition(() => {
      void onCreateWaferAtProcessStart({
        templateId: processTemplateId,
        waferCode: trimmedWaferCode
      }).then((result) => {
        if (!result.ok) {
          window.alert(result.error);
          return;
        }

        router.refresh();
      });
    });
  };

  return (
    <header className="wireframe-topbar flex items-center gap-4 border-b border-[#eeeeea] bg-white px-8 py-5">
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8a8a83]">
          <SearchIcon />
        </span>
        <input
          type="text"
          readOnly
          placeholder="Search wafers, steps, die notes..."
          aria-label="Search"
          className="h-11 w-full rounded-xl border border-[#e4e4df] bg-white pl-11 pr-16 text-[15px] text-[#111111] caret-transparent placeholder:text-[#9b9b94] focus:outline-none focus:ring-2 focus:ring-[#d9d9d2]"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-[#e4e4df] bg-white px-1.5 py-0.5 text-[11px] font-medium text-[#8a8a83]">
          ⌘ K
        </kbd>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-11 items-center overflow-hidden rounded-xl border border-[#e4e4df] bg-white">
          <button
            type="button"
            className="flex h-11 items-center gap-2 px-4 text-sm font-medium text-[#44443f] transition-colors hover:bg-[#fafafa]"
          >
            <UserIcon />
            Me
          </button>
        </div>
        {showAddWafer ? (
          <button
            type="button"
            onClick={handleAddWafer}
            disabled={isCreatingWafer}
            className="flex h-11 items-center gap-2 rounded-xl bg-[#111111] px-5 text-sm font-semibold text-white transition-all hover:-translate-y-px hover:bg-black active:translate-y-0"
          >
            <PlusIcon />
            {isCreatingWafer ? "Adding..." : "Add wafer"}
          </button>
        ) : null}
        {onSignOut ? (
          <form action={onSignOut}>
            <button
              type="submit"
              className="flex h-11 items-center rounded-xl border border-[#e4e4df] bg-white px-4 text-sm font-semibold text-[#44443f] transition-colors hover:bg-[#fafafa]"
            >
              Sign out
            </button>
          </form>
        ) : null}
      </div>
    </header>
  );
}
