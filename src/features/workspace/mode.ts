import type { WorkspaceHotLoadingMode } from "./types";

export function getWorkspaceHotLoadingMode(): WorkspaceHotLoadingMode {
  const value = process.env.WORKSPACE_HOT_LOADING_V2;
  return value === "on" || value === "shadow" ? value : "off";
}
