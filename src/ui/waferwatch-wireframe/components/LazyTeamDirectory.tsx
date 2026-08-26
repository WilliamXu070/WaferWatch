"use client";

import { useEffect, useState } from "react";
import type { WireframeShellTeamMemberDto } from "@/features/wireframe/types";

export function LazyTeamDirectory() {
  const [members, setMembers] = useState<WireframeShellTeamMemberDto[] | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      void fetch("/api/team-directory", { cache: "no-store" })
        .then((response) => response.ok ? response.json() as Promise<WireframeShellTeamMemberDto[]> : [])
        .then((rows) => {
          if (active) setMembers(rows);
        });
    };
    const windowWithIdle = window as typeof window & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const idleId = windowWithIdle.requestIdleCallback?.(load);
    const timerId = idleId === undefined ? window.setTimeout(load, 250) : null;
    return () => {
      active = false;
      if (idleId !== undefined) windowWithIdle.cancelIdleCallback?.(idleId);
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, []);

  if (members === null) {
    return <p className="px-3 text-[13px] font-medium text-[#98968a]">Loading team…</p>;
  }
  if (members.length === 0) {
    return <p className="px-3 text-[13px] font-medium text-[#6b6a5f]">No active team members</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {members.map((member) => (
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
  );
}
