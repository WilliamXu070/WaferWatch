import type { NextConfig } from "next";

const scriptRoot = process.env.INIT_CWD ?? process.env.PWD ?? process.cwd();
const worktreeMarker = "/.worktrees/";
const dependencyRoot = scriptRoot.includes(worktreeMarker)
  ? scriptRoot.slice(0, scriptRoot.indexOf(worktreeMarker))
  : scriptRoot;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "host.docker.internal"],
  turbopack: {
    root: dependencyRoot
  }
};

export default nextConfig;
