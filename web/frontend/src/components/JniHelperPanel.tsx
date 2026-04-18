import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  api,
  type DecompEngine,
  type DecompSettings,
  type JniHelperMethod,
  type JniHelperReport,
} from "../lib/api";
import { Badge, Button, Input } from "./ui";
import { PseudoC } from "../lib/pseudo-c";
import { enrichDecomp } from "../lib/enrich-decomp";
import { EngineIcon } from "./EngineIcons";

interface Props {
  serial: string | null;
  pkg: string;
}

type Tone = "jni" | "java" | "so" | "warn";

interface SoBind {
  lib: string;
  addr: number;
}

// -------- engine metadata --------------------------------------------------

const ENGINES: Record<
  DecompEngine,
  {
    id: DecompEngine;
    name: string;
    glow: string; // tailwind ring/shadow colour for the active state
  }
> = {
  ghidra: { id: "ghidra", name: "Ghidra", glow: "shadow-[0_10px_30px_-10px_rgba(229,57,53,0.55)] ring-rose-400/40" },
  ida: { id: "ida", name: "IDA Pro", glow: "shadow-[0_10px_30px_-10px_rgba(0,188,212,0.55)] ring-cyan-400/40" },
  binja: { id: "binja", name: "Binary Ninja", glow: "shadow-[0_10px_30px_-10px_rgba(0,212,170,0.55)] ring-emerald-400/40" },
};

// One-line, human-readable description of whatever the user has configured
// for a given engine. Used for the tooltip on the top-right status chips so
// you can see the path on hover without opening the edit form.
function enginePathLabel(engine: DecompEngine, s: DecompSettings): string {
  if (engine === "ghidra") return s.ghidra.homePath || "(no path set)";
  if (engine === "ida") return s.ida.idat64Path || "(no path set)";
  const parts = [
    s.binja.installPath || "(no install path)",
    s.binja.pythonBin && `python: ${s.binja.pythonBin}`,
    s.binja.hasLicenseKey && "license: saved",
  ].filter(Boolean);
  return parts.join("\n");
}

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const cls =
    tone === "jni"
      ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/30"
      : tone === "java"
        ? "bg-sky-500/15 text-sky-200 border-sky-400/30"
        : tone === "so"
          ? "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/30"
          : "bg-amber-500/15 text-amber-200 border-amber-400/30";
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10.5px] font-mono uppercase tracking-wider",
        cls,
      )}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
        <h3 className="text-[12px] font-semibold text-slate-200 uppercase tracking-wider">
          {title}
        </h3>
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </div>
      <div className="p-3 space-y-2">{children}</div>
    </section>
  );
}

// -------- engine config form (inline, per-engine) --------------------------

function EngineConfigForm({
  engine,
  settings,
  onSaved,
  onCancel,
}: {
  engine: DecompEngine;
  settings: DecompSettings | null;
  onSaved: (s: DecompSettings) => void;
  onCancel: () => void;
}) {
  const meta = ENGINES[engine];
  const [homePath, setHomePath] = useState(settings?.ghidra.homePath || "");
  const [idat64Path, setIdat64Path] = useState(
    settings?.ida.idat64Path || "",
  );
  const [installPath, setInstallPath] = useState(
    settings?.binja.installPath || "",
  );
  const [pythonBin, setPythonBin] = useState(settings?.binja.pythonBin || "");
  const [licenseKey, setLicenseKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      let patch: Parameters<typeof api.saveDecompSettings>[0] = {};
      if (engine === "ghidra") patch = { ghidra: { homePath: homePath.trim() } };
      if (engine === "ida") patch = { ida: { idat64Path: idat64Path.trim() } };
      if (engine === "binja")
        patch = {
          binja: {
            installPath: installPath.trim(),
            pythonBin: pythonBin.trim(),
            ...(licenseKey ? { licenseKey } : {}),
          },
        };
      const resp = await api.saveDecompSettings(patch);
      onSaved(resp.settings);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-white/10 bg-black/40 p-3 space-y-2 text-[12px]">
      <div className="flex items-center gap-2">
        <EngineIcon engine={engine} size={40} />
        <div className="font-semibold text-slate-100 text-[13px]">
          Configure {meta.name}
        </div>
      </div>

      {engine === "ghidra" && (
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">
            Ghidra home (folder containing <code>support/analyzeHeadless</code>)
          </span>
          <Input
            value={homePath}
            placeholder="/usr/share/ghidra/"
            onChange={(e) => setHomePath(e.target.value)}
          />
        </label>
      )}
      {engine === "ida" && (
        <label className="block space-y-1">
          <span className="text-[11px] text-slate-400">
            Path to the <code>idat64</code> executable (or the IDA install
            directory — we'll find <code>idat64</code> inside it)
          </span>
          <Input
            value={idat64Path}
            placeholder="/home/you/ida-pro-9.1/idat64"
            onChange={(e) => setIdat64Path(e.target.value)}
          />
        </label>
      )}
      {engine === "binja" && (
        <>
          <label className="block space-y-1">
            <span className="text-[11px] text-slate-400">
              Binary Ninja install folder
            </span>
            <Input
              value={installPath}
              placeholder="/opt/binaryninja"
              onChange={(e) => setInstallPath(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-slate-400">
              Python interpreter (optional — defaults to venv python)
            </span>
            <Input
              value={pythonBin}
              placeholder="/usr/bin/python3"
              onChange={(e) => setPythonBin(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-slate-400">
              License key (optional — leave empty if{" "}
              <code>~/.binaryninja/license.dat</code> is already present)
            </span>
            <Input
              type="password"
              value={licenseKey}
              placeholder={
                settings?.binja.hasLicenseKey ? "•••••• (already saved)" : ""
              }
              onChange={(e) => setLicenseKey(e.target.value)}
            />
          </label>
        </>
      )}

      {err && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-rose-200 text-[11.5px]">
          {err}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save & decompile"}
        </Button>
      </div>
    </div>
  );
}

// -------- engine button + decomp result block -----------------------------

function EngineButton({
  engine,
  ready,
  active,
  busy,
  onClick,
}: {
  engine: DecompEngine;
  ready: boolean;
  active: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const meta = ENGINES[engine];
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "group relative inline-flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg border transition",
        "min-w-[88px]",
        active
          ? clsx("ring-2", "border-white/15 bg-white/[0.05]", meta.glow)
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
      )}
      title={
        ready
          ? `Decompile with ${meta.name}`
          : `Configure ${meta.name} to decompile`
      }
    >
      <EngineIcon engine={engine} size={34} />
      <span
        className={clsx(
          "text-[11px] font-semibold tracking-tight",
          active ? "text-white" : "text-slate-300",
        )}
      >
        {meta.name}
      </span>
      <span
        className={clsx(
          "absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full",
          busy
            ? "bg-brand-400 animate-pulse"
            : ready
              ? "bg-emerald-400"
              : "bg-slate-600",
        )}
      />
    </button>
  );
}

function DecompBlock({
  jclass,
  m,
  bind,
  pkg,
  settings,
  onSettingsChange,
}: {
  jclass: string;
  m: JniHelperMethod;
  bind: SoBind;
  pkg: string;
  settings: DecompSettings | null;
  onSettingsChange: (s: DecompSettings) => void;
}) {
  void jclass;
  const [active, setActive] = useState<DecompEngine | null>(null);
  const [config, setConfig] = useState<DecompEngine | null>(null);
  const [busy, setBusy] = useState<DecompEngine | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<
    Partial<Record<DecompEngine, string>>
  >({});
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  async function kick(engine: DecompEngine) {
    setErr(null);
    setBusy(engine);
    try {
      const r = await api.decompile({
        engine,
        pkg,
        lib: bind.lib,
        symbol: m.mangle,
      });
      if (!r.ok) {
        setErr(r.error || `${engine} failed`);
      } else {
        setResults((prev) => ({ ...prev, [engine]: r.text }));
      }
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  function clickEngine(engine: DecompEngine) {
    setActive(engine);
    setConfig(null);
    setErr(null);
    const ready = settings?.ready[engine];
    if (!ready) {
      setConfig(engine);
      return;
    }
    if (results[engine]) return; // already have it
    kick(engine);
  }

  const rawText = active ? results[active] : undefined;
  const enrichedText = useMemo(
    () => (rawText ? enrichDecomp(rawText, m) : undefined),
    [rawText, m],
  );
  const activeText = showRaw ? rawText : enrichedText;
  const wasRewritten =
    rawText !== undefined &&
    enrichedText !== undefined &&
    rawText !== enrichedText;

  return (
    <div className="rounded-md border border-white/5 bg-black/40 p-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10.5px] uppercase tracking-wider text-slate-500">
          Decompile
        </span>
        {(Object.keys(ENGINES) as DecompEngine[]).map((e) => (
          <EngineButton
            key={e}
            engine={e}
            ready={!!settings?.ready[e]}
            active={active === e}
            busy={busy === e}
            onClick={() => clickEngine(e)}
          />
        ))}
        {active && results[active] && (
          <button
            className="ml-auto text-[11px] text-slate-400 hover:text-slate-200"
            onClick={() => kick(active)}
            disabled={busy !== null}
            title="Re-run decompiler"
          >
            ↻ rerun
          </button>
        )}
      </div>

      {config && (
        <EngineConfigForm
          engine={config}
          settings={settings}
          onCancel={() => {
            setConfig(null);
            setActive(null);
          }}
          onSaved={(s) => {
            onSettingsChange(s);
            setConfig(null);
            kick(config);
          }}
        />
      )}

      {err && active && !config && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11.5px] text-rose-200 whitespace-pre-wrap">
          {err}
        </div>
      )}

      {active && !config && busy === active && (
        <div className="flex items-center gap-2 text-[11.5px] text-slate-400">
          <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
          Running {ENGINES[active].name} on{" "}
          <code className="font-mono text-slate-300">
            {bind.lib.split("/").pop()}
          </code>
          …
        </div>
      )}

      {active && activeText !== undefined && busy !== active && (
        <div className="rounded-md overflow-hidden border border-white/10 shadow-[0_20px_60px_-30px_rgba(14,165,233,0.45)]">
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-white/5">
            <EngineIcon engine={active} size={24} />
            <span className="text-[10.5px] uppercase tracking-wider text-slate-300 font-semibold">
              {ENGINES[active].name} pseudo-C
            </span>
            <span className="text-slate-600">·</span>
            <code className="font-mono text-[11px] text-slate-400 truncate">
              {bind.lib.split("/").pop()}
            </code>
            <span className="text-slate-700">·</span>
            <code className="font-mono text-[10.5px] text-emerald-300/80 truncate">
              {m.mangle}
            </code>
            <div className="ml-auto flex items-center gap-2">
              {wasRewritten && (
                <button
                  type="button"
                  onClick={() => setShowRaw((v) => !v)}
                  title={
                    showRaw
                      ? "Show JNI-enriched signature (types & names from the DEX)"
                      : "Show decompiler output exactly as produced"
                  }
                  className={clsx(
                    "text-[10.5px] px-1.5 py-0.5 rounded border transition font-mono",
                    showRaw
                      ? "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200"
                      : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
                  )}
                >
                  {showRaw ? "raw" : "JNI-typed"}
                </button>
              )}
              <span className="text-[10.5px] text-slate-600 font-mono">
                {activeText.split("\n").length} lines
              </span>
              <button
                type="button"
                className={clsx(
                  "relative overflow-hidden text-[10.5px] px-1.5 py-0.5 rounded border font-mono transition-all duration-200",
                  copied
                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200 scale-105 shadow-[0_0_12px_-2px_rgba(16,185,129,0.55)]"
                    : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-100 hover:bg-white/[0.08]",
                )}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(activeText);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1400);
                  } catch {}
                }}
                title={copied ? "Copied to clipboard" : "Copy to clipboard"}
              >
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 transition-transform duration-200",
                    copied ? "translate-y-0" : "translate-y-0",
                  )}
                >
                  {copied ? (
                    <>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="animate-[copied-pop_0.35s_ease-out]"
                        aria-hidden="true"
                      >
                        <path d="M3 8.5l3.2 3.2L13 4.8" />
                      </svg>
                      <span>copied</span>
                    </>
                  ) : (
                    <span>copy</span>
                  )}
                </span>
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-100 hover:bg-white/[0.08] transition"
                onClick={() => {
                  const header =
                    `// ${ENGINES[active].name} pseudo-C\n` +
                    `// library: ${bind.lib}\n` +
                    `// symbol:  ${m.mangle}\n` +
                    (m.sig ? `// jni-sig: ${m.sig}\n` : "") +
                    `// variant: ${showRaw ? "raw decompiler output" : "JNI-typed (enriched from DEX)"}\n` +
                    `\n`;
                  const blob = new Blob([header + activeText], {
                    type: "text/x-c",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${m.mangle}.${active}.c`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 0);
                }}
                title={`Download ${m.mangle}.${active}.c`}
              >
                <DownloadIcon size={12} />
                <span>.c</span>
              </button>
            </div>
          </div>
          <PseudoC text={activeText} />
        </div>
      )}
    </div>
  );
}

// -------- method card ------------------------------------------------------

function MethodCard({
  jclass,
  m,
  bind,
  pkg,
  settings,
  onSettingsChange,
}: {
  jclass: string;
  m: JniHelperMethod;
  bind?: SoBind;
  pkg: string;
  settings: DecompSettings | null;
  onSettingsChange: (s: DecompSettings) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-white/10 bg-black/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] rounded-t-lg"
      >
        <span
          className={clsx(
            "w-2 h-2 border-r-2 border-b-2 border-slate-400 transition-transform inline-block",
            open ? "rotate-45" : "-rotate-45",
          )}
        />
        <span className="font-mono text-[12.5px] text-slate-100 truncate">
          {m.static && <span className="text-violet-300">static </span>}
          <span className="text-slate-400">{jclass}.</span>
          <span className="text-white">{m.name || "?"}</span>
          <span className="text-slate-400">{m.sig || ""}</span>
        </span>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {m.overload && <Pill tone="warn">overload</Pill>}
          {m.static && <Pill tone="java">static</Pill>}
          {bind && <Pill tone="so">bound</Pill>}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 text-[12px]">
          <div className="flex items-start gap-2">
            <span className="text-[10.5px] uppercase tracking-wider text-emerald-300 mt-0.5">
              JNI symbol
            </span>
            <code className="font-mono text-emerald-100 break-all">
              {m.mangle}
            </code>
          </div>
          {bind && (
            <div className="flex items-start gap-2">
              <span className="text-[10.5px] uppercase tracking-wider text-fuchsia-300 mt-0.5">
                .so offset
              </span>
              <code className="font-mono text-fuchsia-200">
                0x{bind.addr.toString(16)}
              </code>
              <span className="text-slate-500 font-mono text-[11px]">
                · {bind.lib}
              </span>
            </div>
          )}
          <div className="rounded-md overflow-hidden border border-white/10">
            <div className="px-2.5 py-1.5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-white/5 text-[10.5px] uppercase tracking-wider text-slate-400 font-semibold">
              C signature
            </div>
            <PseudoC
              text={`${m.ret} ${m.mangle}(\n  ${m.args.join(",\n  ")}\n);`}
              maxHeightClass="max-h-none"
            />
          </div>
          {bind && (
            <DecompBlock
              jclass={jclass}
              m={m}
              bind={bind}
              pkg={pkg}
              settings={settings}
              onSettingsChange={onSettingsChange}
            />
          )}
          {!bind && (
            <div className="text-[11px] text-slate-500 italic">
              Not exported by any .so — can't decompile. May be dynamically
              registered via <code>RegisterNatives</code>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DownloadIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2.5v7.5" />
      <path d="M4.5 7l3.5 3 3.5-3" />
      <path d="M3 13h10" />
    </svg>
  );
}

function SoDownloadButton({
  pkg,
  soPath,
  label,
  className,
}: {
  pkg: string;
  soPath: string;
  label?: string;
  className?: string;
}) {
  const basename = soPath.split("/").pop() || "library.so";
  return (
    <a
      href={api.soDownloadUrl(pkg, soPath)}
      download={basename}
      onClick={(e) => e.stopPropagation()}
      title={`Download ${basename}`}
      className={clsx(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white transition shrink-0",
        className,
      )}
    >
      <DownloadIcon size={13} />
      {label && (
        <span className="text-[10.5px] font-mono uppercase tracking-wider">
          {label}
        </span>
      )}
    </a>
  );
}

function SoSection({
  pkg,
  soInfo,
}: {
  pkg: string;
  soInfo: Record<string, Record<string, number>>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const entries = Object.entries(soInfo);
  if (!entries.length) {
    return (
      <p className="text-[12px] text-slate-500">
        No native libraries contained <code>Java_…</code> symbols. The app
        might register natives dynamically via <code>RegisterNatives</code>, or
        there are no .so files in this APK.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {entries.map(([so, syms]) => {
        const list = Object.entries(syms).sort((a, b) =>
          a[0].localeCompare(b[0]),
        );
        const isOpen = open === so;
        return (
          <div key={so} className="rounded-lg border border-white/10 bg-black/30">
            <div className="w-full flex items-center gap-2 px-3 py-2 rounded-t-lg hover:bg-white/[0.03]">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : so)}
                className="flex-1 flex items-center gap-2 min-w-0 text-left"
              >
                <span
                  className={clsx(
                    "w-2 h-2 border-r-2 border-b-2 border-slate-400 transition-transform inline-block",
                    isOpen ? "rotate-45" : "-rotate-45",
                  )}
                />
                <span className="font-mono text-[12.5px] text-slate-100 truncate">
                  {so}
                </span>
                <span className="ml-auto text-[11px] text-slate-500 font-mono shrink-0">
                  {list.length} symbols
                </span>
              </button>
              <SoDownloadButton pkg={pkg} soPath={so} label=".so" />
            </div>
            {isOpen && (
              <div className="px-3 pb-2 pt-1">
                <table className="w-full text-[12px]">
                  <tbody>
                    {list.map(([sym, addr]) => (
                      <tr key={sym} className="align-top">
                        <td className="pr-3 py-0.5 font-mono text-fuchsia-200 w-24">
                          0x{addr.toString(16)}
                        </td>
                        <td className="py-0.5 font-mono text-slate-200 break-all">
                          {sym}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// -------- top-level panel --------------------------------------------------

export function JniHelperPanel({ serial, pkg }: Props) {
  const [report, setReport] = useState<JniHelperReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyBound, setOnlyBound] = useState(false);

  const [settings, setSettings] = useState<DecompSettings | null>(null);
  const [editEngine, setEditEngine] = useState<DecompEngine | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getDecompSettings()
      .then((r) => {
        if (alive && r.ok) setSettings(r.settings);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function run() {
    if (!pkg) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await api.jniHelper(pkg, serial || undefined);
      if (!r.ok) {
        setErr(r.error || "jni_helper.py failed");
        setReport(null);
      } else {
        setReport(r);
      }
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // JNI mangle -> first .so that exports it (with its offset).
  const mangleToBind = useMemo(() => {
    const out = new Map<string, SoBind>();
    const so = report?.soInfo || {};
    for (const [lib, syms] of Object.entries(so)) {
      for (const [n, v] of Object.entries(syms)) {
        if (!out.has(n)) out.set(n, { lib, addr: v });
      }
    }
    return out;
  }, [report]);

  const filteredClasses = useMemo(() => {
    if (!report?.dexInfo) return [] as Array<[string, JniHelperMethod[]]>;
    const q = query.trim().toLowerCase();
    const all = Object.entries(report.dexInfo).filter(
      ([cls]) => cls !== "__COMMON__",
    );
    const filtered = all
      .map(([cls, methods]) => {
        const ms = methods.filter((m) => {
          if (onlyBound && !mangleToBind.has(m.mangle)) return false;
          if (!q) return true;
          return (
            cls.toLowerCase().includes(q) ||
            (m.name || "").toLowerCase().includes(q) ||
            m.mangle.toLowerCase().includes(q) ||
            (m.sig || "").toLowerCase().includes(q)
          );
        });
        return [cls, ms] as [string, JniHelperMethod[]];
      })
      .filter(([, ms]) => ms.length > 0);
    filtered.sort((a, b) => a[0].localeCompare(b[0]));
    return filtered;
  }, [report, query, onlyBound, mangleToBind]);

  const commonMethods =
    report?.dexInfo?.["__COMMON__"] || ([] as JniHelperMethod[]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-brand-500/10 to-transparent p-3">
        <div className="flex items-center gap-2">
          <div>
            <div className="text-[12.5px] font-semibold text-slate-100">
              JNI Helper
            </div>
            <div className="text-[11px] text-slate-400">
              Static APK analysis — pairs <code>native</code> Java methods with
              their C symbols
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {settings &&
              (Object.keys(ENGINES) as DecompEngine[]).map((e) => {
                const cfgPath = enginePathLabel(e, settings);
                const ready = settings.ready[e];
                const title = ready
                  ? `${ENGINES[e].name}\n${cfgPath}\n\nClick to edit path`
                  : `${ENGINES[e].name} — not configured\n\nClick to set the path`;
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() =>
                      setEditEngine((cur) => (cur === e ? null : e))
                    }
                    title={title}
                    className={clsx(
                      "relative inline-flex items-center justify-center rounded-md border p-1 transition cursor-pointer",
                      ready
                        ? "border-emerald-400/30 bg-emerald-500/5 hover:bg-emerald-500/10"
                        : "border-white/10 bg-white/[0.02] opacity-70 hover:opacity-100 hover:bg-white/[0.05]",
                      editEngine === e && "ring-2 ring-brand-400/50",
                    )}
                  >
                    <EngineIcon engine={e} size={28} />
                    <span
                      className={clsx(
                        "absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-slate-950",
                        ready ? "bg-emerald-400" : "bg-slate-600",
                      )}
                    />
                  </button>
                );
              })}
            <Button
              size="sm"
              variant="primary"
              onClick={run}
              disabled={!pkg || loading}
            >
              {loading ? "Analyzing…" : report ? "Re-run" : "Run on APK"}
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <Badge tone="neutral">package: {pkg || "—"}</Badge>
          {serial && <Badge tone="neutral">device: {serial}</Badge>}
          {report?.stats && (
            <>
              <Badge tone="ok">
                {report.stats.nativeMethods} native methods
              </Badge>
              <Badge tone="brand">{report.stats.nativeClasses} classes</Badge>
              <Badge tone="neutral">{report.stats.soFiles} .so</Badge>
              <Badge tone="neutral">
                {report.stats.jniSymbols} JNI symbols
              </Badge>
            </>
          )}
        </div>
        {editEngine && (
          <div className="mt-3">
            <EngineConfigForm
              engine={editEngine}
              settings={settings}
              onSaved={(s) => {
                setSettings(s);
                setEditEngine(null);
              }}
              onCancel={() => setEditEngine(null)}
            />
          </div>
        )}
      </div>

      {err && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-200 whitespace-pre-wrap">
          {err}
        </div>
      )}

      {report?.warnings && report.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11.5px] text-amber-100 space-y-1">
          {report.warnings.map((w, i) => (
            <div key={i} className="font-mono">
              {w}
            </div>
          ))}
        </div>
      )}

      {!report && !err && (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
          <div className="text-sm text-slate-300">
            {pkg ? (
              <>
                Click{" "}
                <span className="font-mono text-brand-200">Run on APK</span> to
                pull <span className="font-mono">{pkg}</span> from the device
                and analyze it statically.
              </>
            ) : (
              "Pick a device and an application first."
            )}
          </div>
        </div>
      )}

      {report && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              className="flex-1 min-w-[200px]"
              placeholder="Filter by class, method, mangled symbol…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label className="inline-flex items-center gap-2 text-[12px] text-slate-300 px-2 py-1 rounded-md border border-white/10 bg-white/[0.03] cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-brand-400"
                checked={onlyBound}
                onChange={(e) => setOnlyBound(e.target.checked)}
              />
              bound to .so only
            </label>
          </div>

          <Section
            title="Native methods"
            right={
              <span className="text-[11px] text-slate-500 font-mono">
                {filteredClasses.reduce((n, [, m]) => n + m.length, 0)} shown
              </span>
            }
          >
            {filteredClasses.length === 0 ? (
              <p className="text-[12px] text-slate-500">
                No matches. Try clearing the filter.
              </p>
            ) : (
              filteredClasses.map(([cls, methods]) => (
                <div key={cls} className="space-y-1.5">
                  <div className="text-[11.5px] font-mono text-slate-400 px-1">
                    {cls}
                  </div>
                  {methods.map((m) => (
                    <MethodCard
                      key={m.mangle + (m.sig || "")}
                      jclass={cls}
                      m={m}
                      bind={mangleToBind.get(m.mangle)}
                      pkg={pkg}
                      settings={settings}
                      onSettingsChange={setSettings}
                    />
                  ))}
                </div>
              ))
            )}
          </Section>

          <Section
            title=".so exports"
            right={
              <span className="text-[11px] text-slate-500 font-mono">
                {Object.keys(report.soInfo || {}).length} libraries
              </span>
            }
          >
            <SoSection pkg={pkg} soInfo={report.soInfo || {}} />
          </Section>

          {commonMethods.length > 0 && (
            <Section title="JNI lifecycle hooks">
              <div className="space-y-1.5">
                {commonMethods.map((m) => (
                  <MethodCard
                    key={m.mangle}
                    jclass="(global)"
                    m={m}
                    bind={mangleToBind.get(m.mangle)}
                    pkg={pkg}
                    settings={settings}
                    onSettingsChange={setSettings}
                  />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
