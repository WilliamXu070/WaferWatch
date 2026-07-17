import type { NextConfig } from "next";

const scriptRoot = process.env.INIT_CWD ?? process.env.PWD ?? process.cwd();
const worktreeMarker = "/.worktrees/";
const dependencyRoot = scriptRoot.includes(worktreeMarker)
  ? scriptRoot.slice(0, scriptRoot.indexOf(worktreeMarker))
  : scriptRoot;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "host.docker.internal"],
  experimental: {
    // The default persistent Turbopack cache grew to 7.7 GB in this checkout.
    // Keep dev artifacts in memory so restart/page work cannot steadily consume disk.
    turbopackFileSystemCacheForDev: false,
    // Process navigation is authenticated and dynamic, but its prefetched RSC
    // payload can safely stay reusable until realtime or an action refreshes it.
    staleTimes: {
      dynamic: 30,
      static: 60
    }
  },
  turbopack: {
    root: dependencyRoot
  }
};

export default nextConfig;
