import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { api, type LibraryInfo } from "../lib/api";
import { Button, Input } from "./ui";

interface Props {
  serial: string | null;
  pkg: string;
  selected: string[];
  onChange: (libs: string[]) => void;
}

export function LibraryPicker({ serial, pkg, selected, onChange }: Props) {
  const [libs, setLibs] = useState<LibraryInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [query, setQuery] = useState("");

  async function detect() {
    if (!pkg) return;
    setLoading(true);
    setError(null);
    setTouched(true);
    try {
      const r = await api.libraries(pkg, serial || undefined);
      if (!r.ok) {
        setError(r.error || "Could not enumerate libraries.");
        setLibs([]);
      } else {
        setLibs(r.libs);
        if (r.libs.length === 0) {
          setError(
            "No .so files found — the app may ship no native libraries, or they live outside the default lib/ path.",
          );
        }
      }
    } catch (e: any) {
      setError(e.message || String(e));
      setLibs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLibs([]);
    setError(null);
    setTouched(false);
  }, [pkg, serial]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allSelected = libs.length > 0 && libs.every((l) => selectedSet.has(l.name));
  const wildcard = selected.includes("*");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return libs;
    return libs.filter((l) => l.name.toLowerCase().includes(q));
  }, [libs, query]);

  function toggle(name: string) {
    const next = new Set(selected.filter((s) => s !== "*"));
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange([...next]);
  }

  function selectAll() {
    if (allSelected) {
      onChange(selected.filter((s) => !libs.some((l) => l.name === s)));
    } else {
      const union = new Set(selected.filter((s) => s !== "*"));
      for (const l of libs) union.add(l.name);
      onChange([...union]);
    }
  }

  function setWildcard(on: boolean) {
    if (on) onChange(["*"]);
    else onChange(selected.filter((s) => s !== "*"));
  }

  return (
    <div className="rounded-lg border border-white/5 bg-black/20">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <Button size="sm" variant="secondary" onClick={detect} disabled={!pkg || loading}>
          {loading ? "Scanning…" : touched ? "Rescan" : "Detect from app"}
        </Button>
        <label
          className={clsx(
            "text-[11px] px-2 py-1 rounded-md border cursor-pointer select-none",
            wildcard
              ? "bg-brand-500/20 border-brand-400/40 text-brand-100"
              : "bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.07]",
          )}
        >
          <input
            type="checkbox"
            className="mr-1.5 align-middle"
            checked={wildcard}
            onChange={(e) => setWildcard(e.target.checked)}
          />
          Trace all libraries (<span className="font-mono">*</span>)
        </label>
        {!pkg && (
          <span className="text-[11px] text-slate-500">
            Pick a package first.
          </span>
        )}
      </div>

      {error && (
        <div className="px-3 pb-2 text-[11px] text-amber-300">{error}</div>
      )}

      {libs.length > 0 && !wildcard && (
        <>
          <div className="px-3 pb-2 flex items-center gap-2">
            <Input
              className="flex-1"
              placeholder={`Filter (${libs.length} .so)…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button size="sm" variant="ghost" onClick={selectAll}>
              {allSelected ? "Clear" : "Select all"}
            </Button>
          </div>
          <div className="max-h-[200px] overflow-y-auto scrollbar-thin px-2 pb-2">
            <ul className="space-y-1">
              {filtered.map((l) => {
                const active = selectedSet.has(l.name);
                return (
                  <li key={l.name}>
                    <button
                      type="button"
                      onClick={() => toggle(l.name)}
                      className={clsx(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition",
                        active
                          ? "bg-brand-500/15 text-brand-100 ring-1 ring-brand-400/40"
                          : "hover:bg-white/[0.05] text-slate-200",
                      )}
                    >
                      <span
                        className={clsx(
                          "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                          active
                            ? "bg-brand-500 border-brand-400 text-white"
                            : "border-white/20",
                        )}
                      >
                        {active && (
                          <svg
                            viewBox="0 0 24 24"
                            width="10"
                            height="10"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      <span className="font-mono text-[12px] truncate">
                        {l.name}
                      </span>
                      <span className="ml-auto flex flex-wrap items-center gap-1">
                        {l.abis.map((abi) => (
                          <span
                            key={abi}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/70 border border-white/5 text-slate-300 font-mono"
                          >
                            {abi}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="text-center text-[11px] text-slate-500 py-2">
                  No matches.
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
