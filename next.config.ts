import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "host.docker.internal"],
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
