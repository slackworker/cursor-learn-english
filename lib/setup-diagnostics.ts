import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import {
  defaultEventsPath,
  defaultPromptCorpusPath,
  defaultThinkingCorpusPath,
  getCursorDir,
  getDataDir,
  getHomeDir,
  getPathsConfigPath,
  PATHS_CONFIG_BASENAME,
  readConfiguredDataDir,
} from "./default-paths";
import type {
  CorpusFileStat,
  HealthCheck,
  SetupDiagnostics,
} from "./setup-types";

export type {
  CorpusFileStat,
  HealthCheck,
  HealthLevel,
  SetupDiagnostics,
} from "./setup-types";

const HOOK_RUNTIME_SCRIPTS = [
  "capture-event.mjs",
  "capture-prompt.mjs",
  "capture-thinking.mjs",
  "default-paths.mjs",
  "jsonl-daily.mjs",
  "thinking-dedupe.mjs",
];

function isWsl(): boolean {
  if (process.env.WSL_DISTRO_NAME) return true;
  try {
    const release = fs.readFileSync("/proc/version", "utf8").toLowerCase();
    return release.includes("microsoft") || release.includes("wsl");
  } catch {
    return false;
  }
}

function wslDistroName(): string | null {
  if (process.env.WSL_DISTRO_NAME) return process.env.WSL_DISTRO_NAME;
  return isWsl() ? "Ubuntu" : null;
}

function linuxPathToWslUnc(linuxPath: string, distro: string): string {
  const abs = path.resolve(linuxPath);
  return `\\\\wsl$\\${distro}${abs.replace(/\//g, "\\")}`;
}

function windowsPathToWslMount(winPath: string): string | null {
  const cleaned = String(winPath).replace(/\r/g, "").trim();
  const m = cleaned.match(/^([A-Za-z]):\\(.*)$/);
  if (!m) return null;
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}`;
}

function detectWindowsUserProfileMount(): string | null {
  if (!isWsl()) return null;
  try {
    const out = execFileSync("cmd.exe", ["/c", "echo %USERPROFILE%"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 8000,
    });
    return windowsPathToWslMount(out);
  } catch {
    return null;
  }
}

function dataDirSource(): "env" | "paths-config" | "default" {
  if (process.env.CURSOR_DASHBOARD_DATA_DIR) return "env";
  if (readConfiguredDataDir()) return "paths-config";
  return "default";
}

function canWriteDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-probe-${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function listDailyShards(basePath: string): { path: string; mtimeMs: number }[] {
  const dir = path.dirname(basePath);
  const base = path.basename(basePath);
  const stem = base.endsWith(".jsonl") ? base.slice(0, -6) : base;
  const re = new RegExp(
    `^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d{4}-\\d{2}-\\d{2})\\.jsonl$`
  );
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => re.test(name))
      .map((name) => {
        const full = path.join(dir, name);
        return { path: full, mtimeMs: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch {
    return [];
  }
}

function corpusStat(
  role: CorpusFileStat["role"],
  basePath: string
): CorpusFileStat {
  let exists = false;
  let size: number | null = null;
  let mtimeMs: number | null = null;
  try {
    const st = fs.statSync(basePath);
    exists = st.isFile();
    size = st.size;
    mtimeMs = st.mtimeMs;
  } catch {
    // missing legacy base file is fine if dailies exist
  }
  const dailies = listDailyShards(basePath);
  const latest = dailies[0] ?? null;
  return {
    role,
    basePath,
    exists,
    size,
    mtimeMs,
    latestDailyPath: latest?.path ?? null,
    latestDailyMtimeMs: latest?.mtimeMs ?? null,
  };
}

function listPresentScripts(scriptsDir: string): {
  present: string[];
  missing: string[];
} {
  const present: string[] = [];
  const missing: string[] = [];
  for (const name of HOOK_RUNTIME_SCRIPTS) {
    if (fs.existsSync(path.join(scriptsDir, name))) present.push(name);
    else missing.push(name);
  }
  return { present, missing };
}

function readPathsConfigDataDir(cursorDir: string): string | null {
  return readConfiguredDataDir(cursorDir);
}

export function getSetupDiagnostics(): SetupDiagnostics {
  const checks: HealthCheck[] = [];
  const dataDir = getDataDir();
  const source = dataDirSource();
  const cursorDir = getCursorDir();
  const scriptsDir = path.join(cursorDir, "scripts");
  const { present, missing } = listPresentScripts(scriptsDir);
  const hooksJsonExists = fs.existsSync(path.join(cursorDir, "hooks.json"));
  const dataDirExists = fs.existsSync(dataDir);
  const writable = canWriteDir(dataDir);
  const wsl = isWsl();
  const distro = wslDistroName();
  const pathsConfigDataDir = readPathsConfigDataDir(cursorDir);

  const corpus = [
    corpusStat("events", defaultEventsPath()),
    corpusStat("thinking", defaultThinkingCorpusPath()),
    corpusStat("prompt", defaultPromptCorpusPath()),
  ];

  if (!hooksJsonExists || missing.length > 0) {
    checks.push({
      id: "hooks-install",
      level: "error",
      title: "本机 Hooks 未完整安装",
      detail: !hooksJsonExists
        ? `未找到 ${path.join(cursorDir, "hooks.json")}。请运行安装命令。`
        : `缺少脚本：${missing.join(", ")}`,
    });
  } else {
    checks.push({
      id: "hooks-install",
      level: "ok",
      title: "本机 Hooks 已安装",
      detail: `${cursorDir} 下 hooks.json 与运行时脚本齐全。`,
    });
  }

  if (!pathsConfigDataDir) {
    checks.push({
      id: "paths-config",
      level: "warn",
      title: `尚未写入 ${PATHS_CONFIG_BASENAME}`,
      detail:
        "Hooks 将回退到默认 ~/projects/cursor-learn-english/data。建议重新运行安装器并指定 --data-dir。",
    });
  } else if (path.resolve(pathsConfigDataDir) !== path.resolve(dataDir) && source === "env") {
    checks.push({
      id: "paths-config",
      level: "warn",
      title: "Web 环境变量与 Hooks paths 配置不一致",
      detail: `Web(CURSOR_DASHBOARD_DATA_DIR)=${dataDir}；Hooks(${PATHS_CONFIG_BASENAME})=${pathsConfigDataDir}`,
    });
  } else {
    checks.push({
      id: "paths-config",
      level: "ok",
      title: "数据目录配置已落盘",
      detail: `${getPathsConfigPath(cursorDir)} → ${pathsConfigDataDir}`,
    });
  }

  if (!writable) {
    checks.push({
      id: "data-writable",
      level: "error",
      title: "数据目录不可写",
      detail: dataDir,
    });
  } else {
    checks.push({
      id: "data-writable",
      level: "ok",
      title: "数据目录可写",
      detail: dataDir,
    });
  }

  const latestActivity = corpus
    .map((c) => c.latestDailyMtimeMs ?? c.mtimeMs)
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => b - a)[0];

  if (!latestActivity) {
    checks.push({
      id: "recent-write",
      level: "warn",
      title: "尚未看到语料文件",
      detail: "安装 Hooks 后在 Cursor 发一条消息，再刷新本页。",
    });
  } else {
    const ageMin = Math.round((Date.now() - latestActivity) / 60000);
    checks.push({
      id: "recent-write",
      level: ageMin > 24 * 60 ? "warn" : "ok",
      title: "最近采集活动",
      detail:
        ageMin < 1
          ? "不到 1 分钟前有写入"
          : ageMin < 60
            ? `${ageMin} 分钟前有写入`
            : `${Math.round(ageMin / 60)} 小时前有写入`,
    });
  }

  let windowsInfo: SetupDiagnostics["hooks"]["windows"];
  if (wsl) {
    const winHome = detectWindowsUserProfileMount();
    const winCursor = winHome ? path.join(winHome, ".cursor") : null;
    const winHooks = winCursor
      ? fs.existsSync(path.join(winCursor, "hooks.json"))
      : false;
    const winPaths = winCursor ? readPathsConfigDataDir(winCursor) : null;
    windowsInfo = {
      cursorDir: winCursor,
      hooksJsonExists: winHooks,
      pathsConfigDataDir: winPaths,
    };

    if (!winCursor) {
      checks.push({
        id: "windows-hooks",
        level: "info",
        title: "未能探测 Windows 用户目录",
        detail: "若有纯 Windows 项目，请在 Windows 侧手动安装 Hooks。",
      });
    } else if (!winHooks) {
      checks.push({
        id: "windows-hooks",
        level: "warn",
        title: "Windows 侧尚未安装 Hooks",
        detail:
          "打开 C:\\ 下项目时的对话不会写入当前 WSL 数据目录。可用 --also-windows 一并安装。",
      });
    } else {
      const expectedUnc = distro ? linuxPathToWslUnc(dataDir, distro) : null;
      const same =
        winPaths &&
        (path.resolve(winPaths) === path.resolve(dataDir) ||
          (expectedUnc &&
            winPaths.replace(/\//g, "\\").toLowerCase() ===
              expectedUnc.replace(/\//g, "\\").toLowerCase()));
      checks.push({
        id: "windows-hooks",
        level: same ? "ok" : "warn",
        title: same
          ? "Windows Hooks 已指向同一数据目录"
          : "Windows Hooks 已安装，但 dataDir 可能不一致",
        detail: `Windows ${PATHS_CONFIG_BASENAME}: ${winPaths ?? "(未设置)"}${
          expectedUnc ? `；期望 UNC: ${expectedUnc}` : ""
        }`,
      });
    }
  }

  const suggestedCommands: SetupDiagnostics["suggestedCommands"] = [
    {
      label: "安装 / 更新本机 Hooks（数据目录=本仓库 data/）",
      command: `node scripts/setup-cursor-hooks.mjs --data-dir="${dataDir}"`,
    },
  ];

  if (wsl && distro) {
    suggestedCommands.push({
      label: "WSL 一键：本机 + Windows Hooks（Windows 写 UNC）",
      command: `node scripts/setup-cursor-hooks.mjs --data-dir="${dataDir}" --also-windows`,
    });
    suggestedCommands.push({
      label: "仅在 Windows 安装（PowerShell，仓库需可访问）",
      command: `node scripts/setup-cursor-hooks.mjs --data-dir="${linuxPathToWslUnc(dataDir, distro)}"`,
    });
  }

  const envLocalSnippet = [
    `# 与 Hooks 共用同一数据根目录`,
    `CURSOR_DASHBOARD_DATA_DIR=${dataDir}`,
    `EVENTS_JSONL_PATH=${path.join(dataDir, "cursor-events.jsonl")}`,
    `CORPUS_JSONL_PATH=${path.join(dataDir, "thinking-corpus.jsonl")}`,
    `PROMPT_CORPUS_PATH=${path.join(dataDir, "prompt-corpus.jsonl")}`,
  ].join("\n");

  return {
    generatedAt: new Date().toISOString(),
    runtime: {
      platform: os.platform(),
      isWsl: wsl,
      wslDistro: distro,
      homeDir: getHomeDir(),
      cwd: process.cwd(),
      node: process.version,
    },
    data: {
      dataDir,
      dataDirSource: source,
      dataDirExists,
      dataDirWritable: writable,
      pathsConfigPath: getPathsConfigPath(cursorDir),
      pathsConfigDataDir,
      envDataDir: process.env.CURSOR_DASHBOARD_DATA_DIR || null,
      corpus,
    },
    hooks: {
      cursorDir,
      hooksJsonExists,
      scriptsDirExists: fs.existsSync(scriptsDir),
      runtimeScriptsPresent: present,
      runtimeScriptsMissing: missing,
      windows: windowsInfo,
    },
    checks,
    suggestedCommands,
    envLocalSnippet,
  };
}
