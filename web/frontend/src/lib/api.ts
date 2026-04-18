export interface DeviceInfo {
  id: string;
  state: string;
  model: string | null;
  product: string | null;
  device: string | null;
  transport: string | null;
  abi: string | null;
}

export interface AppInfo {
  pid: number | null;
  name: string;
  identifier: string;
  sources: Array<"frida" | "pm">;
  system: boolean;
}

export interface AppListResponse {
  ok: boolean;
  error?: string;
  errors?: Array<{ source: string; message: string }>;
  apps: AppInfo[];
}

export interface LibraryInfo {
  name: string;
  abis: string[];
  sources: Array<"extracted" | "apk">;
}

export interface LibraryListResponse {
  ok: boolean;
  error?: string;
  package?: string;
  apks?: string[];
  libs: LibraryInfo[];
}

export interface Health {
  ok: boolean;
  jnitrace: string | null;
  frida: string | null;
  time: string;
}

export interface TraceOptions {
  target: string;
  libraries: string[];
  include: string[];
  exclude: string[];
  includeExport: string[];
  excludeExport: string[];
  injectMethod?: "spawn" | "attach";
  backtrace?: "fuzzy" | "accurate" | "none";
  remote?: string;
  hideData?: boolean;
  ignoreEnv?: boolean;
  ignoreVm?: boolean;
  output?: string;
  aux?: string[];
  prepend?: string;
  append?: string;
}

// --- JNI Helper (static APK analyzer) ----------------------------------
// Matches the JSON emitted by web/backend/py/jni_helper.py.

export interface JniHelperMethod {
  mangle: string;
  ret: string;
  args: string[];
  name?: string;
  sig?: string;
  static?: boolean;
  overload?: boolean;
}

export interface JniHelperStats {
  classesScanned: number;
  nativeClasses: number;
  nativeMethods: number;
  soFiles: number;
  jniSymbols: number;
}

export interface JniHelperReport {
  ok: boolean;
  error?: string;
  apk?: string;
  apkBasename?: string;
  package?: string;
  generatedAt?: string;
  stats?: JniHelperStats;
  // key = class FQN (or "__COMMON__" for JNI_OnLoad / JNI_OnUnload)
  dexInfo?: Record<string, JniHelperMethod[]>;
  // key = ELF entry path inside the APK, value = { symbol: st_value }
  soInfo?: Record<string, Record<string, number>>;
  warnings?: string[];
}

// --- Decompilers -------------------------------------------------------
// Per-method on-demand pseudo-C from Ghidra / IDA / Binary Ninja.
// Paths & license material are persisted server-side at ~/.jnixray/settings.json.

export type DecompEngine = "ghidra" | "ida" | "binja";

export interface DecompSettings {
  ghidra: { homePath: string };
  ida: { idat64Path: string };
  binja: {
    installPath: string;
    pythonBin: string;
    licenseKey: string; // always "••••••" or "" on the wire
    hasLicenseKey?: boolean;
  };
  ready: { ghidra: boolean; ida: boolean; binja: boolean };
  paths?: { file: string; home: string };
}

export interface DecompResult {
  ok: boolean;
  engine: DecompEngine;
  symbol: string;
  lib: string;
  text: string;
  error?: string;
}

export interface SessionSnapshot {
  id: string;
  status: "idle" | "running" | "stopped";
  startedAt: number | null;
  stoppedAt: number | null;
  exitCode: number | null;
  options: TraceOptions;
}

const base = "";

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(base + url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${r.status} ${r.statusText}: ${text}`);
  }
  return r.json();
}

export const api = {
  health: () => j<Health>("/api/health"),
  devices: () => j<{ devices: DeviceInfo[] }>("/api/devices"),
  apps: (serial?: string, opts?: { system?: boolean }) => {
    const params = new URLSearchParams();
    if (serial) params.set("serial", serial);
    if (opts?.system) params.set("system", "1");
    const qs = params.toString();
    return j<AppListResponse>("/api/apps" + (qs ? `?${qs}` : ""));
  },
  soDownloadUrl: (pkg: string, relPath: string) =>
    `${base}/api/apps/${encodeURIComponent(pkg)}/so?path=${encodeURIComponent(relPath)}`,
  libraries: (pkg: string, serial?: string) => {
    const qs = serial ? `?serial=${encodeURIComponent(serial)}` : "";
    return j<LibraryListResponse>(
      `/api/apps/${encodeURIComponent(pkg)}/libraries${qs}`,
    );
  },
  startSession: (options: TraceOptions) =>
    j<{ id: string; snapshot: SessionSnapshot }>("/api/sessions", {
      method: "POST",
      body: JSON.stringify(options),
    }),
  stopSession: (id: string) =>
    j<{ ok: boolean; snapshot: SessionSnapshot }>(`/api/sessions/${id}`, {
      method: "DELETE",
    }),
  jniHelper: (pkg: string, serial?: string) => {
    const qs = serial ? `?serial=${encodeURIComponent(serial)}` : "";
    return j<JniHelperReport>(
      `/api/apps/${encodeURIComponent(pkg)}/jni-helper${qs}`,
      { method: "POST" },
    );
  },
  getDecompSettings: () =>
    j<{ ok: boolean; settings: DecompSettings }>("/api/decomp/settings"),
  saveDecompSettings: (patch: {
    ghidra?: Partial<DecompSettings["ghidra"]>;
    ida?: Partial<DecompSettings["ida"]>;
    binja?: Partial<DecompSettings["binja"]>;
  }) =>
    j<{ ok: boolean; settings: DecompSettings }>("/api/decomp/settings", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  decompile: (req: {
    engine: DecompEngine;
    pkg: string;
    lib: string;
    symbol: string;
  }) =>
    j<DecompResult>("/api/decomp", {
      method: "POST",
      body: JSON.stringify(req),
    }),
};
