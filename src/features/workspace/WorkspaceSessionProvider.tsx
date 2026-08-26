"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { getCalendarWeekRange } from "./calendar-range";
import {
  clearProcessWorkspaceSessions,
  getProcessWorkspaceState,
  setProcessWorkspaceHotBootstrap
} from "./store";
import { parseHotBootstrap, type ProcessHotBootstrap, type WorkspaceHotLoadingMode } from "./types";

type WorkspaceSessionContextValue = {
  activeProcessId: string | null;
  activeProcessSummary: ProcessHotBootstrap["processSummary"] | null;
  mode: WorkspaceHotLoadingMode;
  ensureProcessBootstrap: (processId: string, force?: boolean) => Promise<ProcessHotBootstrap | null>;
  switchActiveProcess: (
    processId: string,
    summary?: ProcessHotBootstrap["processSummary"]
  ) => Promise<ProcessHotBootstrap | null>;
  clearSession: () => void;
};

const WorkspaceSessionContext = createContext<WorkspaceSessionContextValue | null>(null);

export function WorkspaceSessionProvider({
  children,
  initialActiveProcessId,
  initialBootstrap,
  mode
}: {
  children: ReactNode;
  initialActiveProcessId: string | null;
  initialBootstrap: ProcessHotBootstrap | null;
  mode: WorkspaceHotLoadingMode;
}) {
  const [selectionOverride, setSelectionOverride] = useState<{
    processId: string | null;
    summary: ProcessHotBootstrap["processSummary"] | null;
  } | null>(() => {
    if (mode === "on" && initialBootstrap) setProcessWorkspaceHotBootstrap(initialBootstrap);
    return null;
  });
  const activeProcessId = selectionOverride ? selectionOverride.processId : initialActiveProcessId;
  const activeProcessSummary = selectionOverride ? selectionOverride.summary : initialBootstrap?.processSummary ?? null;
  const bootstrapAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (mode === "on" && initialBootstrap) setProcessWorkspaceHotBootstrap(initialBootstrap);
  }, [initialBootstrap, mode]);

  const ensureProcessBootstrap = useCallback(async (processId: string, force = false) => {
    if (mode !== "on") return null;
    const cached = getProcessWorkspaceState(processId).hotBootstrap;
    if (cached && !force) return cached;

    bootstrapAbortRef.current?.abort();
    const controller = new AbortController();
    bootstrapAbortRef.current = controller;
    const range = getCalendarWeekRange();
    const query = new URLSearchParams({ from: range.from, to: range.to });
    const response = await fetch(`/api/processes/${processId}/bootstrap?${query}`, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error("The process hot bootstrap could not be loaded.");
    const bootstrap = parseHotBootstrap(await response.json());
    if (bootstrap.templateId !== processId) throw new Error("The process hot bootstrap identity did not match.");
    setProcessWorkspaceHotBootstrap(bootstrap);
    return bootstrap;
  }, [mode]);

  const switchActiveProcess = useCallback(async (
    processId: string,
    summary?: ProcessHotBootstrap["processSummary"]
  ) => {
    setSelectionOverride({ processId, summary: summary ?? null });
    const bootstrap = await ensureProcessBootstrap(processId);
    if (bootstrap) {
      setSelectionOverride((current) => current?.processId === processId
        ? { processId, summary: bootstrap.processSummary }
        : current);
    }
    return bootstrap;
  }, [ensureProcessBootstrap]);

  const clearSession = useCallback(() => {
    bootstrapAbortRef.current?.abort();
    bootstrapAbortRef.current = null;
    clearProcessWorkspaceSessions();
    setSelectionOverride({ processId: null, summary: null });
  }, []);

  const value = useMemo<WorkspaceSessionContextValue>(() => ({
    activeProcessId,
    activeProcessSummary,
    mode,
    ensureProcessBootstrap,
    switchActiveProcess,
    clearSession
  }), [activeProcessId, activeProcessSummary, clearSession, ensureProcessBootstrap, mode, switchActiveProcess]);

  return <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>;
}

export function useWorkspaceSession() {
  const context = useContext(WorkspaceSessionContext);
  if (!context) throw new Error("useWorkspaceSession must be used inside WorkspaceSessionProvider.");
  return context;
}
