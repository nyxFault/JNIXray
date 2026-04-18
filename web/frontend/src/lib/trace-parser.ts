const ANSI = /\x1b\[[0-9;]*m/g;
const TS_PREFIX = /^\s*(\d+)\s*ms\s?/;

export interface TraceArg {
  type: string;
  value: string;
  data?: string;
  className?: string;
}

export interface BacktraceFrame {
  address: string;
  symbol?: string;
  module?: string;
  base?: string;
}

export interface CallEvent {
  kind: "call";
  id: number;
  ts: number;
  tid: number | null;
  namespace: "JNIEnv" | "JavaVM" | string;
  method: string;
  args: TraceArg[];
  retType?: string;
  retValue?: string;
  retClass?: string;
  retData?: string;
  backtrace: BacktraceFrame[];
}

export interface LibraryEvent {
  kind: "library";
  id: number;
  ts: number | null;
  tid: number | null;
  name: string;
  path: string;
}

export interface MetaEvent {
  kind: "meta";
  id: number;
  ts: number | null;
  tid: number | null;
  text: string;
}

export type TraceEvent = CallEvent | LibraryEvent | MetaEvent;

type PendingBrace = "retClass" | "argClass";

interface WorkingCall extends CallEvent {
  _lastArg?: TraceArg;
  _inBacktrace: boolean;
  _dataLines?: string[];
  _pendingBrace?: PendingBrace | null;
}

function splitBrace(text: string): {
  value: string;
  inner?: string;
  open: boolean;
} {
  const openIdx = text.indexOf("{");
  if (openIdx === -1) return { value: text.trim(), open: false };
  const tail = text.slice(openIdx + 1);
  const closeIdx = tail.lastIndexOf("}");
  const value = text.slice(0, openIdx).trim();
  if (closeIdx === -1) {
    return { value, inner: tail.trim(), open: true };
  }
  const inner = tail.slice(0, closeIdx).trim();
  return { value, inner, open: false };
}

export class TraceParser {
  private buffer = "";
  private counter = 0;
  private currentTid: number | null = null;
  private currentCall: WorkingCall | null = null;
  private out: TraceEvent[] = [];

  events(): TraceEvent[] {
    return this.out;
  }

  reset() {
    this.buffer = "";
    this.currentCall = null;
    this.currentTid = null;
    this.out = [];
    this.counter = 0;
  }

  feed(chunk: string): TraceEvent[] {
    const before = this.out.length;
    this.buffer += chunk.replace(ANSI, "");
    let idx;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);
      this.handleLine(line);
    }
    return this.out.slice(before);
  }

  flush(): TraceEvent[] {
    const before = this.out.length;
    if (this.currentCall) this.commitCall();
    return this.out.slice(before);
  }

  private nextId() {
    return ++this.counter;
  }

  private handleLine(raw: string) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      if (this.currentCall) {
        this.currentCall._inBacktrace = this.currentCall._inBacktrace;
      }
      return;
    }

    const tidMatch = line.match(/^\s*\/\*\s*TID\s+(\d+)\s*\*\/\s*$/);
    if (tidMatch) {
      if (this.currentCall) this.commitCall();
      this.currentTid = Number.parseInt(tidMatch[1], 10);
      return;
    }

    const libMatch = line.match(
      /^Traced library\s+"([^"]+)"\s+loaded from path\s+"([^"]*)"\.?$/,
    );
    if (libMatch) {
      if (this.currentCall) this.commitCall();
      this.out.push({
        kind: "library",
        id: this.nextId(),
        ts: null,
        tid: this.currentTid,
        name: libMatch[1],
        path: libMatch[2],
      });
      return;
    }

    const tsMatch = line.match(TS_PREFIX);
    const ts = tsMatch ? Number.parseInt(tsMatch[1], 10) : null;
    const rest = tsMatch ? line.slice(tsMatch[0].length) : line;

    if (
      this.currentCall &&
      this.currentCall._pendingBrace &&
      !this.currentCall._inBacktrace
    ) {
      if (/^-+Backtrace-+\s*$/.test(rest)) {
        this.currentCall._pendingBrace = null;
        this.currentCall._inBacktrace = true;
        return;
      }
      const cleaned = rest.replace(/^\|[:\s]?\s*/, "");
      const closeIdx = cleaned.indexOf("}");
      const chunk = (closeIdx === -1 ? cleaned : cleaned.slice(0, closeIdx))
        .trimEnd();
      const slot = this.currentCall._pendingBrace;
      if (slot === "retClass") {
        const prev = this.currentCall.retClass || "";
        this.currentCall.retClass =
          prev + (prev && chunk ? "\n" : "") + chunk;
      } else if (slot === "argClass" && this.currentCall._lastArg) {
        const arg = this.currentCall._lastArg;
        const prev = arg.className || "";
        arg.className = prev + (prev && chunk ? "\n" : "") + chunk;
      }
      if (closeIdx !== -1) this.currentCall._pendingBrace = null;
      return;
    }

    const callHeader = rest.match(/^\[\+\]\s*([A-Za-z_][\w*]*)->([\w<>]+)\s*$/);
    if (callHeader) {
      if (this.currentCall) this.commitCall();
      this.currentCall = {
        kind: "call",
        id: this.nextId(),
        ts: ts ?? 0,
        tid: this.currentTid,
        namespace: callHeader[1],
        method: callHeader[2],
        args: [],
        backtrace: [],
        _inBacktrace: false,
      };
      return;
    }

    if (/^-+Backtrace-+\s*$/.test(rest)) {
      if (this.currentCall) this.currentCall._inBacktrace = true;
      return;
    }

    if (this.currentCall && this.currentCall._inBacktrace) {
      const bt = rest.match(/^\|->\s+(0x[0-9a-fA-F]+)(?::\s*(.+))?$/);
      if (bt) {
        const frame: BacktraceFrame = { address: bt[1] };
        const tail = bt[2];
        if (tail) {
          const m = tail.match(/^(.+?)\s*\(([^:]+):\s*(0x[0-9a-fA-F]+)\)\s*$/);
          if (m) {
            frame.symbol = m[1].trim();
            frame.module = m[2].trim();
            frame.base = m[3];
          } else {
            frame.symbol = tail.trim();
          }
        }
        this.currentCall.backtrace.push(frame);
        return;
      }
    }

    if (this.currentCall) {
      const argMatch = rest.match(/^\|-\s+([^:]+?)\s*:\s*(.+?)\s*$/);
      if (argMatch) {
        const split = splitBrace(argMatch[2]);
        const arg: TraceArg = {
          type: argMatch[1].trim(),
          value: split.value,
        };
        if (split.inner !== undefined) arg.className = split.inner;
        this.currentCall.args.push(arg);
        this.currentCall._lastArg = arg;
        if (split.open) this.currentCall._pendingBrace = "argClass";
        return;
      }

      const retMatch = rest.match(/^\|=\s+([^:]+?)\s*:\s*(.+?)\s*$/);
      if (retMatch) {
        const split = splitBrace(retMatch[2]);
        this.currentCall.retType = retMatch[1].trim();
        this.currentCall.retValue = split.value;
        if (split.inner !== undefined) this.currentCall.retClass = split.inner;
        if (split.open) this.currentCall._pendingBrace = "retClass";
        return;
      }

      const dataMatch = rest.match(/^\|:\s*(.*)$/);
      if (dataMatch && this.currentCall._lastArg) {
        const arg = this.currentCall._lastArg;
        arg.data = arg.data ? arg.data + "\n" + dataMatch[1] : dataMatch[1];
        return;
      }

      if (/^\|?\s*}\s*$/.test(rest)) {
        return;
      }
    }

    if (this.currentCall) this.commitCall();
    this.out.push({
      kind: "meta",
      id: this.nextId(),
      ts,
      tid: this.currentTid,
      text: line,
    });
  }

  private commitCall() {
    if (!this.currentCall) return;
    const {
      _inBacktrace,
      _lastArg,
      _dataLines,
      _pendingBrace,
      ...rest
    } = this.currentCall as any;
    this.out.push(rest as CallEvent);
    this.currentCall = null;
  }
}
