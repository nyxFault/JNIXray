export interface PaletteEntry {
  bg: string;
  text: string;
  ring: string;
}

const PALETTE: PaletteEntry[] = [
  { bg: "bg-sky-500/15", text: "text-sky-200", ring: "ring-sky-400/30" },
  { bg: "bg-emerald-500/15", text: "text-emerald-200", ring: "ring-emerald-400/30" },
  { bg: "bg-amber-500/15", text: "text-amber-200", ring: "ring-amber-400/30" },
  { bg: "bg-fuchsia-500/15", text: "text-fuchsia-200", ring: "ring-fuchsia-400/30" },
  { bg: "bg-rose-500/15", text: "text-rose-200", ring: "ring-rose-400/30" },
  { bg: "bg-teal-500/15", text: "text-teal-200", ring: "ring-teal-400/30" },
  { bg: "bg-indigo-500/15", text: "text-indigo-200", ring: "ring-indigo-400/30" },
  { bg: "bg-lime-500/15", text: "text-lime-200", ring: "ring-lime-400/30" },
];

const tidCache = new Map<number, PaletteEntry>();
let tidOrder = 0;

export function paletteForTid(tid: number | null): PaletteEntry {
  if (tid == null) return { bg: "bg-slate-700/40", text: "text-slate-300", ring: "ring-slate-500/30" };
  const cached = tidCache.get(tid);
  if (cached) return cached;
  const entry = PALETTE[tidOrder++ % PALETTE.length];
  tidCache.set(tid, entry);
  return entry;
}

export type Category =
  | "array"
  | "string"
  | "class"
  | "method"
  | "field"
  | "ref"
  | "exception"
  | "monitor"
  | "register"
  | "buffer"
  | "other";

export function categoryForMethod(method: string): Category {
  const m = method;
  if (/Array/.test(m)) return "array";
  if (/String/.test(m)) return "string";
  if (/^FindClass$|Class$|DefineClass/.test(m)) return "class";
  if (/Method/.test(m)) return "method";
  if (/Field/.test(m)) return "field";
  if (/Ref$|NewLocalRef|NewGlobalRef|DeleteLocalRef|DeleteGlobalRef/.test(m)) return "ref";
  if (/Exception|Throw/.test(m)) return "exception";
  if (/Monitor/.test(m)) return "monitor";
  if (/RegisterNatives|UnregisterNatives/.test(m)) return "register";
  if (/Buffer|DirectByte/.test(m)) return "buffer";
  return "other";
}

export function categoryStyle(cat: Category): { dot: string; text: string; label: string } {
  switch (cat) {
    case "array":
      return { dot: "bg-amber-400", text: "text-amber-200", label: "array" };
    case "string":
      return { dot: "bg-emerald-400", text: "text-emerald-200", label: "string" };
    case "class":
      return { dot: "bg-sky-400", text: "text-sky-200", label: "class" };
    case "method":
      return { dot: "bg-fuchsia-400", text: "text-fuchsia-200", label: "method" };
    case "field":
      return { dot: "bg-violet-400", text: "text-violet-200", label: "field" };
    case "ref":
      return { dot: "bg-teal-400", text: "text-teal-200", label: "ref" };
    case "exception":
      return { dot: "bg-rose-400", text: "text-rose-200", label: "exception" };
    case "monitor":
      return { dot: "bg-yellow-400", text: "text-yellow-200", label: "monitor" };
    case "register":
      return { dot: "bg-indigo-400", text: "text-indigo-200", label: "register" };
    case "buffer":
      return { dot: "bg-pink-400", text: "text-pink-200", label: "buffer" };
    default:
      return { dot: "bg-slate-400", text: "text-slate-300", label: "other" };
  }
}

export function looksLikeHexdump(s: string | undefined): boolean {
  if (!s) return false;
  return /^[0-9a-fA-F]{4,8}:?\s+([0-9a-fA-F]{2}\s+){4,}/m.test(s);
}

export function classifyArgValue(type: string, value: string): string {
  const t = type.toLowerCase();
  if (/jstring|char\*|\bstring\b/.test(t)) return "str";
  if (/^0x[0-9a-fA-F]+$/.test(value)) return "ptr";
  if (/^-?\d+$/.test(value)) return "num";
  return "other";
}
