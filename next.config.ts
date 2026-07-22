import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // 避免上级目录存在 package-lock.json 时 Turbopack 误判工作区根目录
  turbopack: {
    root: projectRoot,
  },
  // 允许用局域网 IP（平板等）访问 dev：否则 /_next/* 脚本会被拦成 403，页面壳能开但数据一直加载中
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;
