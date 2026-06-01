import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // 避免上级目录存在 package-lock.json 时 Turbopack 误判工作区根目录
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
