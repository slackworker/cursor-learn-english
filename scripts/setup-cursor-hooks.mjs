#!/usr/bin/env node
/**
 * Cross-platform Cursor Hooks installer.
 *
 * Usage:
 *   node scripts/setup-cursor-hooks.mjs
 *   node scripts/setup-cursor-hooks.mjs --data-dir=/path/to/data
 *   node scripts/setup-cursor-hooks.mjs --also-windows
 *     → Windows hooks.json delegates to WSL via wsl.exe (avoids UNC write failures)
 *
 * Writes:
 *   <cursor-dir>/hooks.json
 *   <cursor-dir>/scripts/*.mjs   (hook runtime only)
 *   <cursor-dir>/cursor-learn-english.paths.json
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { PATHS_CONFIG_BASENAME } from './default-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

/** Scripts that Hooks actually import at runtime (exclude dict builders etc.). */
const HOOK_RUNTIME_SCRIPTS = [
  'capture-event.mjs',
  'capture-prompt.mjs',
  'capture-thinking.mjs',
  'capture-response-to-txt.mjs',
  'default-paths.mjs',
  'hook-log.mjs',
  'jsonl-daily.mjs',
  'thinking-dedupe.mjs',
  'prune-jsonl.mjs',
  'dedupe-thinking-corpus.mjs',
];

function printHelp() {
  console.log(`Usage: node scripts/setup-cursor-hooks.mjs [options]

Options:
  --data-dir=<path>     Shared data directory for Hooks (and preferred for Web)
  --cursor-dir=<path>   Install target (default: ~/.cursor or %USERPROFILE%\\.cursor)
  --also-windows        On WSL: also install into the Windows user .cursor.
                        Windows hooks run Linux scripts via wsl.exe (recommended;
                        avoids Cursor sandbox / UNC write issues to \\\\wsl$\\...)
  --dry-run             Print actions without writing
  -h, --help            Show help
`);
}

function parseArgs(argv) {
  const opts = {
    dataDir: null,
    cursorDir: null,
    alsoWindows: false,
    dryRun: false,
    help: false,
  };
  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '--also-windows') opts.alsoWindows = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--data-dir=')) opts.dataDir = arg.slice('--data-dir='.length);
    else if (arg.startsWith('--cursor-dir=')) opts.cursorDir = arg.slice('--cursor-dir='.length);
    else if (arg === '--data-dir' || arg === '--cursor-dir') {
      console.error(`Error: ${arg} requires =value (e.g. ${arg}=/path)`);
      process.exit(1);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }
  return opts;
}

function getHomeDir() {
  return os.platform() === 'win32'
    ? process.env.USERPROFILE || os.homedir()
    : process.env.HOME || os.homedir();
}

function isWsl() {
  if (process.env.WSL_DISTRO_NAME) return true;
  try {
    const release = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
    return release.includes('microsoft') || release.includes('wsl');
  } catch {
    return false;
  }
}

function wslDistroName() {
  if (process.env.WSL_DISTRO_NAME) return process.env.WSL_DISTRO_NAME;
  return 'Ubuntu';
}

/** /home/foo/bar -> \\wsl$\Ubuntu\home\foo\bar */
function linuxPathToWslUnc(linuxPath, distro = wslDistroName()) {
  const abs = path.resolve(linuxPath);
  const withBackslashes = abs.replace(/\//g, '\\');
  return `\\\\wsl$\\${distro}${withBackslashes}`;
}

/** C:\\Users\\You -> /mnt/c/Users/You */
function windowsPathToWslMount(winPath) {
  const cleaned = String(winPath).replace(/\r/g, '').trim();
  const m = cleaned.match(/^([A-Za-z]):\\(.*)$/);
  if (!m) return null;
  const drive = m[1].toLowerCase();
  const rest = m[2].replace(/\\/g, '/');
  return `/mnt/${drive}/${rest}`;
}

function detectWindowsUserProfileMount() {
  try {
    const out = execFileSync('cmd.exe', ['/c', 'echo %USERPROFILE%'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 8000,
    });
    return windowsPathToWslMount(out);
  } catch {
    return null;
  }
}

function defaultProjectDataDir() {
  return path.join(PROJECT_ROOT, 'data');
}

function ensureDir(dir, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] mkdir -p ${dir}`);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, contents, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] write ${filePath}`);
    return;
  }
  fs.writeFileSync(filePath, contents);
}

function copyFile(src, dest, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] cp ${src} -> ${dest}`);
    return;
  }
  fs.copyFileSync(src, dest);
}

function resolveLinuxNodePath() {
  try {
    const out = execFileSync('bash', ['-lc', 'command -v node'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out && fs.existsSync(out)) return out;
  } catch {
    // fall through
  }
  const nvmGuess = path.join(
    getHomeDir(),
    '.nvm/versions/node',
  );
  try {
    const versions = fs.readdirSync(nvmGuess).sort().reverse();
    for (const v of versions) {
      const candidate = path.join(nvmGuess, v, 'bin', 'node');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    // ignore
  }
  return '/usr/bin/node';
}

function loadHooksTemplate() {
  const hooksSrc = path.join(PROJECT_ROOT, 'hooks', 'hooks.json');
  return JSON.parse(fs.readFileSync(hooksSrc, 'utf8'));
}

/** Quote an argument for Windows CreateProcess / cmd-style command lines. */
function quoteCmdArg(arg) {
  const s = String(arg);
  if (!/[ \t"]/.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

/** Rewrite hooks.json commands to run inside WSL (stdin still piped by Cursor). */
function buildWslDelegatedHooksJson({ distro, nodePath, linuxScriptsDir }) {
  const template = loadHooksTemplate();
  const wrap = (command) => {
    // "node ./scripts/capture-prompt.mjs" → absolute WSL node + script
    const m = String(command).match(/node\s+\.\/scripts\/([^\s]+)/i);
    if (!m) return command;
    const scriptAbs = `${linuxScriptsDir.replace(/\\/g, '/')}/${m[1]}`;
    return `wsl.exe -d ${quoteCmdArg(distro)} -e ${quoteCmdArg(nodePath)} ${quoteCmdArg(scriptAbs)}`;
  };
  const hooks = {};
  for (const [step, entries] of Object.entries(template.hooks || {})) {
    hooks[step] = (entries || []).map((entry) => ({
      ...entry,
      command: wrap(entry.command),
    }));
  }
  return { ...template, hooks };
}

function installInto(cursorDir, dataDir, { dryRun, label, hooksJson, windowsMode }) {
  const scriptsDir = path.join(cursorDir, 'scripts');
  ensureDir(scriptsDir, dryRun);

  console.log(`\n[${label}] Installing into ${cursorDir}`);
  console.log(`[${label}] dataDir = ${dataDir}`);

  for (const name of HOOK_RUNTIME_SCRIPTS) {
    const src = path.join(PROJECT_ROOT, 'scripts', name);
    if (!fs.existsSync(src)) {
      console.warn(`[${label}] skip missing ${name}`);
      continue;
    }
    copyFile(src, path.join(scriptsDir, name), dryRun);
  }
  console.log(`[${label}] copied ${HOOK_RUNTIME_SCRIPTS.length} runtime scripts`);

  const hooksPayload = hooksJson || loadHooksTemplate();
  writeFile(
    path.join(cursorDir, 'hooks.json'),
    `${JSON.stringify(hooksPayload, null, 2)}\n`,
    dryRun
  );
  console.log(`[${label}] wrote hooks.json`);

  const pathsPayload = {
    dataDir,
    projectRoot: PROJECT_ROOT,
    updatedAt: new Date().toISOString(),
    ...(windowsMode ? { windowsMode } : {}),
  };
  writeFile(
    path.join(cursorDir, PATHS_CONFIG_BASENAME),
    `${JSON.stringify(pathsPayload, null, 2)}\n`,
    dryRun
  );
  console.log(`[${label}] wrote ${PATHS_CONFIG_BASENAME}`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const dataDir = path.resolve(opts.dataDir || defaultProjectDataDir());
  const cursorDir = opts.cursorDir
    ? path.resolve(opts.cursorDir)
    : path.join(getHomeDir(), '.cursor');

  ensureDir(dataDir, opts.dryRun);

  installInto(cursorDir, dataDir, {
    dryRun: opts.dryRun,
    label: os.platform() === 'win32' ? 'windows' : 'local',
  });

  if (opts.alsoWindows) {
    if (!isWsl()) {
      console.warn('\n--also-windows is only used inside WSL; skipped.');
    } else {
      const winHome = detectWindowsUserProfileMount();
      if (!winHome) {
        console.error(
          '\nCould not detect Windows %USERPROFILE% via cmd.exe; skip Windows install.'
        );
        console.error(
          'Install manually from Windows PowerShell / CMD, e.g.:\n' +
            `  node scripts/setup-cursor-hooks.mjs --data-dir="${linuxPathToWslUnc(dataDir)}"`
        );
      } else {
        const winCursor = path.join(winHome, '.cursor');
        const distro = wslDistroName();
        const nodePath = resolveLinuxNodePath();
        // Delegate to the Linux install we just wrote (honors --cursor-dir).
        const linuxScriptsDir = path.join(cursorDir, 'scripts');
        const delegated = buildWslDelegatedHooksJson({
          distro,
          nodePath,
          linuxScriptsDir,
        });
        installInto(winCursor, dataDir, {
          dryRun: opts.dryRun,
          label: 'windows-via-wsl',
          hooksJson: delegated,
          windowsMode: 'wsl-delegate',
        });
        console.log(`
Windows Hooks 改为经 wsl.exe 调用 Linux 脚本写入（避免 UNC / 沙箱写失败）：
  distro: ${distro}
  node:   ${nodePath}
  scripts:${linuxScriptsDir}
示例命令:
  ${delegated.hooks.beforeSubmitPrompt[0].command}
`);
      }
    }
  } else if (isWsl()) {
    const unc = linuxPathToWslUnc(dataDir);
    console.log(`
若 Windows 上还有迁不走的 Cursor 项目，请再装一份 Windows Hooks（指向同一数据目录）：

  # 在 WSL 里一键顺带安装：
  node scripts/setup-cursor-hooks.mjs --data-dir="${dataDir}" --also-windows

  # 或在 Windows（PowerShell）里，于本仓库对应路径执行：
  node scripts/setup-cursor-hooks.mjs --data-dir="${unc}"
`);
  }

  console.log(`
✓ 配置完成。接下来：
  1. 重启 Cursor（若已打开），使 hooks.json 生效。
  2. 在 Cursor 里随便发一条对话，触发一次 Hooks。
  3. 打开仪表盘 /setup 体检页确认采集路径一致。
  4. Web 端建议在 .env.local 设置：
       CURSOR_DASHBOARD_DATA_DIR=${dataDir}

注意：Cursor 跑的是 ~/.cursor/scripts/ 里的副本。
      以后改了本仓库采集脚本或 hooks/hooks.json，请再执行本安装器一次。
`);
}

main();
