import { useState } from "react";
import clsx from "clsx";
import type { CallEvent, LibraryEvent, MetaEvent, TraceEvent } from "../lib/trace-parser";
import {
  categoryForMethod,
  categoryStyle,
  classifyArgValue,
  looksLikeHexdump,
  paletteForTid,
} from "../lib/trace-visual";

function ThreadChip({ tid }: { tid: number | null }) {
  const p = paletteForTid(tid);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono",
        "ring-1",
        p.bg,
        p.text,
        p.ring,
      )}
    >
      <span className={clsx("w-1.5 h-1.5 rounded-full", p.text.replace("text-", "bg-"))} />
      TID {tid ?? "?"}
    </span>
  );
}

function Ts({ ms }: { ms: number | null }) {
  if (ms == null) return null;
  return (
    <span className="font-mono tabular-nums text-[11px] text-slate-500">
      {ms.toLocaleString()} ms
    </span>
  );
}

function ArgValue({ type, value }: { type: string; value: string }) {
  const cls = classifyArgValue(type, value);
  const color =
    cls === "ptr"
      ? "text-sky-300"
      : cls === "num"
        ? "text-amber-200"
        : cls === "str"
          ? "text-emerald-200"
          : "text-slate-200";
  return <span className={clsx("font-mono text-[12.5px] break-all", color)}>{value}</span>;
}

function HexBlock({ text }: { text: string }) {
  return (
    <pre
      className={clsx(
        "mt-2 rounded-md border border-white/5 bg-black/50 p-2",
        "text-[11.5px] leading-[1.45] font-mono text-slate-300 whitespace-pre overflow-x-auto scrollbar-thin",
      )}
    >
      {text}
    </pre>
  );
}

function CallCard({ ev }: { ev: CallEvent }) {
  const [openBacktrace, setOpenBacktrace] = useState(false);
  const cat = categoryForMethod(ev.method);
  const catStyle = categoryStyle(cat);
  const palette = paletteForTid(ev.tid);

  return (
    <div
      className={clsx(
        "group rounded-xl border border-white/10 bg-white/[0.03]",
        "hover:border-white/20 hover:bg-white/[0.05] transition",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
      )}
    >
      <div
        className={clsx(
          "flex items-center gap-2 px-3 py-2 border-b border-white/5 rounded-t-xl",
          palette.bg,
        )}
      >
        <span className={clsx("w-2 h-2 rounded-full", catStyle.dot)} />
        <span className={clsx("text-[12.5px] font-semibold tracking-wide", catStyle.text)}>
          {ev.namespace}
          <span className="text-slate-400">-&gt;</span>
          <span className="text-white">{ev.method}</span>
        </span>
        <span className="text-[10.5px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/30 text-slate-300">
          {catStyle.label}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <ThreadChip tid={ev.tid} />
          <Ts ms={ev.ts} />
        </div>
      </div>

      <div className="px-3 py-2 space-y-2">
        {ev.args.length > 0 && (
          <div className="rounded-lg border border-white/5 bg-black/30">
            <table className="w-full text-[12.5px]">
              <tbody>
                {ev.args.map((a, i) => (
                  <tr key={i} className="align-top">
                    <td className="w-6 px-2 py-1 text-slate-500 font-mono">#{i}</td>
                    <td className="w-52 px-2 py-1 text-slate-400 font-mono">{a.type}</td>
                    <td className="px-2 py-1">
                      <ArgValue type={a.type} value={a.value} />
                      {a.className && (
                        <span className="ml-2 text-[11px] text-slate-400 font-mono">
                          {"{ "}
                          <span className="text-fuchsia-200">{a.className}</span>
                          {" }"}
                        </span>
                      )}
                      {a.data && (
                        <div className="mt-1">
                          {looksLikeHexdump(a.data) ? (
                            <HexBlock text={a.data} />
                          ) : (
                            <div className="font-mono text-[12px] text-slate-300 whitespace-pre-wrap break-all bg-black/40 border border-white/5 rounded-md px-2 py-1">
                              {a.data}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ev.retType && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
            <span className="mt-0.5 text-[11px] uppercase tracking-wider text-emerald-300">
              return
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[12px] text-slate-400">{ev.retType}</span>
                <ArgValue type={ev.retType} value={ev.retValue || ""} />
                {ev.retClass && (
                  <span className="text-[11px] text-slate-400 font-mono">
                    {"{ "}
                    <span className="text-fuchsia-200">{ev.retClass}</span>
                    {" }"}
                  </span>
                )}
              </div>
              {ev.retData && (
                <HexBlock text={ev.retData} />
              )}
            </div>
          </div>
        )}

        {ev.backtrace.length > 0 ? (
          <div className="rounded-lg border border-white/5 bg-black/30">
            <button
              type="button"
              onClick={() => setOpenBacktrace((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-slate-300 hover:bg-white/[0.03] rounded-t-lg"
            >
              <span className="inline-flex items-center gap-2">
                <span
                  className={clsx(
                    "w-2 h-2 border-r-2 border-b-2 border-slate-400 transition-transform inline-block",
                    openBacktrace ? "rotate-45" : "-rotate-45",
                  )}
                />
                Backtrace
                <span className="text-slate-500">({ev.backtrace.length})</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {ev.backtrace[0]?.module || ""}
              </span>
            </button>
            {openBacktrace && (
              <div className="px-3 pb-2">
                <ol className="divide-y divide-white/5">
                  {ev.backtrace.map((f, i) => (
                    <li
                      key={i}
                      className="py-1.5 flex items-start gap-3 font-mono text-[12px] px-1 -mx-1 rounded"
                    >
                      <span className="text-slate-500 w-5 text-right">{i}</span>
                      <span className="text-sky-300">{f.address}</span>
                      <span className="flex-1 min-w-0 break-all text-slate-200">
                        {f.symbol || (
                          <span className="text-slate-500">(no symbol)</span>
                        )}
                      </span>
                      {f.module && (
                        <span className="text-slate-400">
                          {f.module}
                          {f.base && (
                            <span className="text-slate-600">@{f.base}</span>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-1.5 text-[11.5px] text-slate-400">
            No backtrace captured — set{" "}
            <span className="font-mono text-slate-200">Backtrace</span> to{" "}
            <span className="font-mono text-emerald-300">accurate</span> or{" "}
            <span className="font-mono text-emerald-300">fuzzy</span> to see
            frame addresses.
          </div>
        )}
      </div>
    </div>
  );
}

function LibraryCard({ ev }: { ev: LibraryEvent }) {
  return (
    <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/[0.08] px-3 py-2 flex items-center gap-3">
      <span className="text-indigo-300 text-[11px] uppercase tracking-wider">library</span>
      <span className="font-mono text-[12.5px] text-slate-100">{ev.name}</span>
      <span className="ml-auto font-mono text-[11.5px] text-slate-400 truncate">{ev.path}</span>
    </div>
  );
}

function MetaCard({ ev }: { ev: MetaEvent }) {
  const isBanner = /^Tracing\./i.test(ev.text) || ev.text.startsWith("[jnixray]");
  return (
    <div
      className={clsx(
        "rounded-lg px-3 py-1.5 text-[12.5px] font-mono",
        isBanner
          ? "border border-white/5 bg-white/[0.02] text-slate-400"
          : "border border-amber-400/20 bg-amber-400/5 text-amber-200",
      )}
    >
      {ev.text}
    </div>
  );
}

export function TraceEventCard({ ev }: { ev: TraceEvent }) {
  if (ev.kind === "call") return <CallCard ev={ev} />;
  if (ev.kind === "library") return <LibraryCard ev={ev} />;
  return <MetaCard ev={ev} />;
}
