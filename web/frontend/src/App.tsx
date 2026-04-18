import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AppPicker } from "./components/AppPicker";
import { DeviceSelector } from "./components/DeviceSelector";
import { LiveTraceViewer } from "./components/LiveTraceViewer";
import { TraceConfig } from "./components/TraceConfig";
import { JniHelperPanel } from "./components/JniHelperPanel";
import { Badge, Button } from "./components/ui";
import { api, type DeviceInfo, type Health, type TraceOptions } from "./lib/api";
import { openTraceSocket, type WireLog } from "./lib/ws";

const defaultOptions: TraceOptions = {
  target: "",
  libraries: ["libnative-lib.so"],
  include: [],
  exclude: [],
  includeExport: [],
  excludeExport: [],
  injectMethod: "spawn",
  backtrace: "accurate",
  hideData: false,
  ignoreEnv: false,
  ignoreVm: false,
};

type Tab = "device" | "app" | "config" | "jni";

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-transform"
    >
      {open ? (
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      ) : (
        <>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </>
      )}
    </svg>
  );
}

function StatusPill({ status }: { status: "idle" | "running" | "stopped" }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        tracing
      </span>
    );
  }
  if (status === "stopped") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-200">
        stopped
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-slate-700 bg-slate-800/80 text-slate-300">
      idle
    </span>
  );
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [device, setDevice] = useState<string | null>(null);
  const [devLoading, setDevLoading] = useState(false);

  const [options, setOptions] = useState<TraceOptions>(defaultOptions);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "stopped">("idle");
  const [logs, setLogs] = useState<WireLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("device");

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    if (device && tab === "device") setTab("app");
  }, [device]);

  useEffect(() => {
    if (options.target && tab === "app") setTab("config");
  }, [options.target]);

  const canStart = useMemo(
    () =>
      !!options.target &&
      options.libraries.length > 0 &&
      !(options.ignoreEnv && options.ignoreVm) &&
      status !== "running",
    [options, status],
  );

  const selectedDevice = devices.find((d) => d.id === device) || null;

  async function handleStart() {
    setError(null);
    setLogs([]);
    try {
      const { id } = await api.startSession(options);
      setSessionId(id);
      setStatus("running");
      const ws = openTraceSocket(
        id,
        (msg) => {
          if (msg.type === "log") {
            setLogs((prev) => [...prev, msg.payload as WireLog]);
          } else if (msg.type === "status") {
            setStatus(msg.payload.status);
          }
        },
        () => {
          setStatus((s) => (s === "running" ? "stopped" : s));
        },
      );
      wsRef.current = ws;
    } catch (e: any) {
      setError(e.message || String(e));
    }
  }

  async function handleStop() {
    if (!sessionId) return;
    try {
      await api.stopSession(sessionId);
    } catch (e: any) {
      setError(e.message || String(e));
    }
    try {
      wsRef.current?.send(JSON.stringify({ type: "stop" }));
    } catch {}
  }

  function TabButton({ id, label, badge }: { id: Tab; label: string; badge?: string | null }) {
    const active = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        className={clsx(
          "flex-1 px-3 py-2 text-xs font-medium transition border-b-2",
          active
            ? "text-brand-100 border-brand-400 bg-white/[0.03]"
            : "text-slate-400 border-transparent hover:text-slate-200 hover:bg-white/[0.02]",
        )}
      >
        {label}
        {badge && (
          <span className="ml-1.5 inline-flex items-center px-1.5 rounded-full bg-white/[0.06] text-[10px] font-mono text-slate-300">
            {badge}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <header className="shrink-0 border-b border-white/5 bg-slate-950/80 backdrop-blur">
        <div className="h-[52px] px-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="w-9 h-9 grid place-items-center rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200"
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <HamburgerIcon open={sidebarOpen} />
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/logo.svg"
              alt="JNIXray"
              width={32}
              height={32}
              className="w-8 h-8 shadow-glow rounded-lg select-none"
              draggable={false}
            />
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">
                <span className="text-white">JNI</span>
                <span className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">X</span>
                <span className="text-white">ray</span>
              </div>
              <div className="text-[10.5px] text-slate-400 -mt-0.5">
                JNI tracing for Android
              </div>
            </div>
          </div>

          <div className="ml-2 hidden md:flex items-center gap-1.5 text-[11px] text-slate-400">
            {selectedDevice && (
              <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.03] font-mono truncate max-w-[170px]">
                {selectedDevice.id}
                {selectedDevice.abi && <span className="text-slate-500"> · {selectedDevice.abi}</span>}
              </span>
            )}
            {options.target && (
              <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.03] font-mono truncate max-w-[260px]">
                {options.target}
              </span>
            )}
            {options.libraries.length > 0 && (
              <span className="px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.03] font-mono truncate max-w-[180px]">
                {options.libraries.join(", ")}
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <StatusPill status={status} />
            {status === "running" ? (
              <Button size="sm" variant="danger" onClick={handleStop}>
                Stop
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={handleStart} disabled={!canStart}>
                Start trace
              </Button>
            )}
            <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-white/5">
              {health ? (
                <>
                  <Badge tone="brand">jnitrace {health.jnitrace || "?"}</Badge>
                  <Badge tone="neutral">frida {health.frida || "?"}</Badge>
                </>
              ) : (
                <Badge tone="warn">backend offline</Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex overflow-hidden">
        <aside
          className={clsx(
            "shrink-0 border-r border-white/5 bg-slate-950/40 backdrop-blur",
            "flex flex-col overflow-hidden transition-[width] duration-200",
            sidebarOpen ? "w-[360px]" : "w-0",
          )}
        >
          <div className="shrink-0 flex border-b border-white/5 bg-slate-950/60">
            <TabButton id="device" label="Device" badge={selectedDevice ? "1" : null} />
            <TabButton id="app" label="App" badge={options.target ? "✓" : null} />
            <TabButton
              id="config"
              label="Config"
              badge={String(options.libraries.length)}
            />
            <TabButton
              id="jni"
              label="JNI Helper"
              badge={options.target ? "✓" : null}
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 space-y-3">
            {tab === "device" && (
              <DeviceSelector
                devices={devices}
                selected={device}
                onSelect={setDevice}
                onDevicesChanged={setDevices}
                loading={devLoading}
                setLoading={setDevLoading}
              />
            )}
            {tab === "app" && (
              <AppPicker
                serial={device}
                selected={options.target}
                onSelect={(identifier) =>
                  setOptions((prev) => ({ ...prev, target: identifier }))
                }
              />
            )}
            {tab === "config" && (
              <TraceConfig
                options={options}
                onChange={setOptions}
                onStart={handleStart}
                onStop={handleStop}
                running={status === "running"}
                canStart={canStart}
                serial={device}
              />
            )}
            {tab === "jni" && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11.5px] text-slate-400">
                Static JNI analysis for{" "}
                <span className="font-mono text-slate-200">
                  {options.target || "(pick an app)"}
                </span>
                .
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-200">
                {error}
              </div>
            )}
          </div>
        </aside>

        <section className="flex-1 min-w-0 min-h-0 p-3 flex">
          {tab === "jni" ? (
            <div className="flex-1 min-w-0 h-full overflow-y-auto scrollbar-thin pr-1">
              <JniHelperPanel serial={device} pkg={options.target} />
            </div>
          ) : (
            <LiveTraceViewer
              logs={logs}
              status={status}
              onClear={() => setLogs([])}
            />
          )}
        </section>
      </main>
    </div>
  );
}
