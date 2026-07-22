export type HealthLevel = "ok" | "warn" | "error" | "info";

export type HealthCheck = {
  id: string;
  level: HealthLevel;
  title: string;
  detail: string;
};

export type CorpusFileStat = {
  role: "events" | "thinking" | "prompt";
  basePath: string;
  exists: boolean;
  size: number | null;
  mtimeMs: number | null;
  latestDailyPath: string | null;
  latestDailyMtimeMs: number | null;
};

export type SetupDiagnostics = {
  generatedAt: string;
  runtime: {
    platform: string;
    isWsl: boolean;
    wslDistro: string | null;
    homeDir: string;
    cwd: string;
    node: string;
  };
  data: {
    dataDir: string;
    dataDirSource: "env" | "paths-config" | "default";
    dataDirExists: boolean;
    dataDirWritable: boolean;
    pathsConfigPath: string;
    pathsConfigDataDir: string | null;
    envDataDir: string | null;
    corpus: CorpusFileStat[];
  };
  hooks: {
    cursorDir: string;
    hooksJsonExists: boolean;
    scriptsDirExists: boolean;
    runtimeScriptsPresent: string[];
    runtimeScriptsMissing: string[];
    windows?: {
      cursorDir: string | null;
      hooksJsonExists: boolean;
      pathsConfigDataDir: string | null;
    };
  };
  checks: HealthCheck[];
  suggestedCommands: {
    label: string;
    command: string;
  }[];
  envLocalSnippet: string;
};
