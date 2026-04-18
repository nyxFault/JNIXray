import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ansiToReact } from "../lib/ansi";
import { TraceParser, type CallEvent, type TraceEvent } from "../lib/trace-parser";
import type { WireLog } from "../lib/ws";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Input, Switch } from "./ui";
import { TraceEventCard } from "./TraceEventCard";

interface Props {
  logs: WireLog[];
  status: "idle" | "running" | "stopped";
  onClear: () => void;
}

type Mode = "pretty" | "raw";

export function LiveTraceViewer({ logs, status, onClear }: Props) {
  const [paused, setPaused] = useState(false);
  const [autoscroll, setAutoscroll] = useState(true);
  const [mode, setMode] = useState<Mode>("pretty");
  const [query, setQuery] = useState("");
  const [hideMeta, setHideMeta] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);

  const events: TraceEvent[] = useMemo(() => {
    const p = new TraceParser();
    for (const l of logs) {
      if (l.stream === "meta") {
        p.feed(l.data);
      } else {
        p.feed(l.data);
      }
    }
    p.flush();
    return p.events();
  }, [logs]);

  const rawLines = useMemo(() => {
    const text = logs.map((l) => l.data).join("");
    return text.split(/(?<=\n)/);
  }, [logs]);

  const filteredRaw = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && !hideMeta) return rawLines;
    return rawLines.filter((line) => {
      if (hideMeta && (line.startsWith("[jnixray]") || line.startsWith("$ jnitrace"))) return false;
      if (!q) return true;
      return line.toLowerCase().includes(q);
    });
  }, [rawLines, query, hideMeta]);

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((ev) => {
      if (hideMeta && ev.kind === "meta") {
        if (/^\[jnixray\]/.test(ev.text) || /^\$ jnitrace/.test(ev.text)) return false;
      }
      if (!q) return true;
      if (ev.kind === "call") {
        if (ev.method.toLowerCase().includes(q)) return true;
        if (ev.namespace.toLowerCase().includes(q)) return true;
        if (String(ev.tid ?? "").includes(q)) return true;
        if (ev.args.some((a) => a.value.toLowerCase().includes(q) || a.type.toLowerCase().includes(q))) return true;
        if (ev.retValue?.toLowerCase().includes(q)) return true;
        return false;
      }
      if (ev.kind === "library") {
        return ev.name.toLowerCase().includes(q) || ev.path.toLowerCase().includes(q);
      }
      return ev.text.toLowerCase().includes(q);
    });
  }, [events, query, hideMeta]);

  const stats = useMemo(() => {
    let bytes = 0;
    for (const l of logs) bytes += l.data.length;
    const calls = events.filter((e): e is CallEvent => e.kind === "call") as CallEvent[];
    const threads = new Set<number>();
    const methods = new Map<string, number>();
    for (const c of calls) {
      if (c.tid != null) threads.add(c.tid);
      methods.set(c.method, (methods.get(c.method) || 0) + 1);
    }
    const topMethods = [...methods.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    return {
      bytes,
      lines: rawLines.length,
      calls: calls.length,
      threads: threads.size,
      topMethods,
    };
  }, [events, logs, rawLines]);

  useEffect(() => {
    if (!paused && autoscroll) {
      endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [filteredEvents.length, filteredRaw.length, paused, autoscroll]);

  function download() {
    const blob = new Blob([logs.map((l) => l.data).join("")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jnixray-trace-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="flex-1 min-w-0 h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle>
            <span className="text-brand-300">04.</span> Live trace
          </CardTitle>
          {status === "running" ? (
            <Badge tone="ok">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              running
            </Badge>
          ) : status === "stopped" ? (
            <Badge tone="warn">stopped</Badge>
          ) : (
            <Badge tone="neutral">idle</Badge>
          )}
          <Badge tone="brand">{stats.calls} JNI calls</Badge>
          <Badge tone="neutral">{stats.threads} threads</Badge>
          <Badge tone="neutral">{stats.lines} lines</Badge>
          <Badge tone="neutral">{(stats.bytes / 1024).toFixed(1)} KB</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-white/10 bg-slate-900/60 p-0.5">
            <button
              onClick={() => setMode("pretty")}
              className={clsx(
                "px-2.5 py-1 text-xs rounded-md transition",
                mode === "pretty"
                  ? "bg-brand-500/20 text-brand-100"
                  : "text-slate-300 hover:text-white",
              )}
            >
              Pretty
            </button>
            <button
              onClick={() => setMode("raw")}
              className={clsx(
                "px-2.5 py-1 text-xs rounded-md transition",
                mode === "raw"
                  ? "bg-brand-500/20 text-brand-100"
                  : "text-slate-300 hover:text-white",
              )}
            >
              Raw
            </button>
          </div>
          <Switch
            label={paused ? "Paused" : "Live"}
            checked={!paused}
            onChange={(v) => setPaused(!v)}
          />
          <Switch label="Autoscroll" checked={autoscroll} onChange={setAutoscroll} />
          <Switch label="Hide meta" checked={hideMeta} onChange={setHideMeta} />
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear
          </Button>
          <Button size="sm" variant="secondary" onClick={download} disabled={logs.length === 0}>
            Export
          </Button>
        </div>
      </CardHeader>
      <CardBody className="flex-1 flex flex-col gap-3 min-h-0">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <Input
            className="flex-1"
            placeholder={
              mode === "pretty"
                ? "Filter calls by method / arg / return / TID…"
                : "Filter lines (substring)…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {stats.topMethods.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
              <span className="uppercase tracking-wider">Top:</span>
              {stats.topMethods.map(([m, n]) => (
                <button
                  key={m}
                  onClick={() => setQuery(m)}
                  className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/10 hover:bg-white/[0.1] font-mono"
                >
                  {m}
                  <span className="ml-1 text-slate-500">{n}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className={clsx(
            "flex-1 min-h-0 rounded-lg border border-white/10 bg-black/40",
            "overflow-auto scrollbar-thin",
          )}
        >
          {mode === "pretty" ? (
            <div className="p-3 space-y-2">
              {filteredEvents.length === 0 ? (
                <p className="text-slate-500 text-sm">
                  {status === "idle"
                    ? "Start a trace to see structured JNI calls here."
                    : "Waiting for output…"}
                </p>
              ) : (
                filteredEvents.map((ev) => (
                  <TraceEventCard key={ev.id} ev={ev} />
                ))
              )}
              <div ref={endRef} />
            </div>
          ) : (
            <div className="p-3 font-mono text-[12.5px] leading-[1.5]">
              {filteredRaw.length === 0 ? (
                <p className="text-slate-500">
                  {status === "idle" ? "Start a trace." : "Waiting for output…"}
                </p>
              ) : (
                filteredRaw.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all">
                    {ansiToReact(line)}
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
