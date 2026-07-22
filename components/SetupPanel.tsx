"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Info,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { SetupDiagnostics, HealthLevel } from "@/lib/setup-types";
import { Surface } from "@/components/ui/Surface";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<SetupDiagnostics>;
  });

function levelIcon(level: HealthLevel) {
  const cls = "h-4 w-4 shrink-0";
  switch (level) {
    case "ok":
      return <CheckCircle2 className={`${cls} text-success`} aria-hidden />;
    case "warn":
      return <AlertTriangle className={`${cls} text-warning`} aria-hidden />;
    case "error":
      return <XCircle className={`${cls} text-error`} aria-hidden />;
    default:
      return <Info className={`${cls} text-info`} aria-hidden />;
  }
}

function levelBadgeClass(level: HealthLevel) {
  switch (level) {
    case "ok":
      return "badge-success";
    case "warn":
      return "badge-warning";
    case "error":
      return "badge-error";
    default:
      return "badge-info";
  }
}

function formatBytes(n: number | null) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ms: number | null) {
  if (ms == null) return "—";
  return new Date(ms).toLocaleString();
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [text]);

  return (
    <button
      type="button"
      className="btn btn-ghost btn-xs gap-1"
      onClick={onCopy}
      title="复制"
    >
      <Copy className="h-3.5 w-3.5" aria-hidden />
      {copied ? "已复制" : "复制"}
    </button>
  );
}

export function SetupPanel() {
  const { data, error, isLoading, mutate, isValidating } = useSWR(
    "/api/setup",
    fetcher,
    { revalidateOnFocus: true }
  );

  if (isLoading && !data) {
    return (
      <Surface>
        <p className="text-sm text-base-content/60">正在检测环境…</p>
      </Surface>
    );
  }

  if (error || !data) {
    return (
      <Surface>
        <p className="text-sm text-error">
          无法加载诊断信息：{error instanceof Error ? error.message : "未知错误"}
        </p>
        <button
          type="button"
          className="btn btn-sm mt-3"
          onClick={() => mutate()}
        >
          重试
        </button>
      </Surface>
    );
  }

  const envLabel = data.runtime.isWsl
    ? `WSL (${data.runtime.wslDistro ?? "?"})`
    : data.runtime.platform;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-base-content/50">
          运行时 {envLabel} · Node {data.runtime.node} ·{" "}
          {new Date(data.generatedAt).toLocaleString()}
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm gap-1"
          onClick={() => mutate()}
          disabled={isValidating}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isValidating ? "animate-spin" : ""}`}
            aria-hidden
          />
          刷新
        </button>
      </div>

      <section>
        <h2 className="section-title">健康检查</h2>
        <div className="space-y-2">
          {data.checks.map((c) => (
            <Surface key={c.id} padding="sm" className="flex gap-3">
              <div className="mt-0.5">{levelIcon(c.level)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{c.title}</span>
                  <span className={`badge badge-sm ${levelBadgeClass(c.level)}`}>
                    {c.level}
                  </span>
                </div>
                <p className="mt-1 break-all text-xs leading-relaxed text-base-content/60">
                  {c.detail}
                </p>
              </div>
            </Surface>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">数据目录</h2>
        <Surface className="space-y-2 text-sm">
          <Row label="dataDir" value={data.data.dataDir} />
          <Row label="来源" value={data.data.dataDirSource} />
          <Row
            label="可写"
            value={data.data.dataDirWritable ? "是" : "否"}
          />
          <Row
            label="paths 配置"
            value={
              data.data.pathsConfigDataDir
                ? `${data.data.pathsConfigPath} → ${data.data.pathsConfigDataDir}`
                : `${data.data.pathsConfigPath}（未创建）`
            }
          />
          <div className="overflow-x-auto pt-2">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>语料</th>
                  <th>基文件</th>
                  <th>最新分片</th>
                </tr>
              </thead>
              <tbody>
                {data.data.corpus.map((c) => (
                  <tr key={c.role}>
                    <td className="font-medium">{c.role}</td>
                    <td className="text-xs">
                      {c.exists
                        ? `${formatBytes(c.size)} · ${formatTime(c.mtimeMs)}`
                        : "无基文件"}
                    </td>
                    <td className="text-xs">
                      {c.latestDailyPath
                        ? `${pathBasename(c.latestDailyPath)} · ${formatTime(c.latestDailyMtimeMs)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      </section>

      <section>
        <h2 className="section-title">Hooks 安装位置</h2>
        <Surface className="space-y-2 text-sm">
          <Row label="本机 .cursor" value={data.hooks.cursorDir} />
          <Row
            label="hooks.json"
            value={data.hooks.hooksJsonExists ? "存在" : "缺失"}
          />
          <Row
            label="运行时脚本"
            value={
              data.hooks.runtimeScriptsMissing.length === 0
                ? `齐全（${data.hooks.runtimeScriptsPresent.length}）`
                : `缺 ${data.hooks.runtimeScriptsMissing.join(", ")}`
            }
          />
          {data.hooks.windows ? (
            <>
              <Row
                label="Windows .cursor"
                value={data.hooks.windows.cursorDir ?? "未探测到"}
              />
              <Row
                label="Windows hooks.json"
                value={
                  data.hooks.windows.cursorDir
                    ? data.hooks.windows.hooksJsonExists
                      ? "存在"
                      : "缺失"
                    : "—"
                }
              />
              <Row
                label="Windows dataDir"
                value={data.hooks.windows.pathsConfigDataDir ?? "—"}
              />
            </>
          ) : null}
        </Surface>
      </section>

      <section>
        <h2 className="section-title">推荐命令</h2>
        <div className="space-y-2">
          {data.suggestedCommands.map((cmd) => (
            <Surface key={cmd.label} padding="sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-base-content/70">
                  {cmd.label}
                </span>
                <CopyButton text={cmd.command} />
              </div>
              <pre className="overflow-x-auto rounded-lg bg-base-200/80 p-3 text-xs leading-relaxed">
                {cmd.command}
              </pre>
            </Surface>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">.env.local 片段</h2>
        <Surface padding="sm">
          <div className="mb-1 flex justify-end">
            <CopyButton text={data.envLocalSnippet} />
          </div>
          <pre className="overflow-x-auto rounded-lg bg-base-200/80 p-3 text-xs leading-relaxed">
            {data.envLocalSnippet}
          </pre>
        </Surface>
      </section>
    </div>
  );
}

function pathBasename(p: string) {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || p;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-3">
      <dt className="text-xs text-base-content/50">{label}</dt>
      <dd className="break-all text-xs sm:text-sm">{value}</dd>
    </div>
  );
}
