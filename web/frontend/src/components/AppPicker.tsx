import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { api, type AppInfo } from "../lib/api";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Input, Switch } from "./ui";

interface Props {
  serial: string | null;
  selected: string;
  onSelect: (identifier: string) => void;
}

type Filter = "all" | "running" | "installed";

export function AppPicker({ serial, selected, onSelect }: Props) {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showSystem, setShowSystem] = useState(false);

  async function refresh() {
    if (!serial) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.apps(serial, { system: showSystem });
      if (!r.ok) setError(r.error || "app listing failed");
      setApps(r.apps || []);
    } catch (e: any) {
      setApps([]);
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setApps([]);
    if (serial) refresh();
  }, [serial, showSystem]);

  const counts = useMemo(() => {
    let running = 0;
    let installed = 0;
    for (const a of apps) {
      if (a.pid != null) running += 1;
      else installed += 1;
    }
    return { running, installed, total: apps.length };
  }, [apps]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((a) => {
      if (filter === "running" && a.pid == null) return false;
      if (filter === "installed" && a.pid != null) return false;
      if (!q) return true;
      return (
        a.identifier.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q)
      );
    });
  }, [apps, query, filter]);

  function TabBtn({ id, label, n }: { id: Filter; label: string; n: number }) {
    const active = filter === id;
    return (
      <button
        onClick={() => setFilter(id)}
        className={clsx(
          "px-2.5 py-1 text-xs rounded-md border transition",
          active
            ? "bg-brand-500/15 text-brand-100 border-brand-400/40"
            : "bg-white/[0.03] text-slate-300 border-white/10 hover:bg-white/[0.07]",
        )}
      >
        {label}
        <span
          className={clsx(
            "ml-1.5 inline-flex items-center justify-center px-1.5 rounded-full text-[10px]",
            active ? "bg-brand-500/30 text-brand-50" : "bg-slate-700/60 text-slate-200",
          )}
        >
          {n}
        </span>
      </button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="text-brand-300">02.</span> Application
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={refresh} disabled={!serial || loading}>
            {loading ? "Listing…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        {!serial ? (
          <p className="text-sm text-slate-400">Select a device first.</p>
        ) : (
          <>
            <Input
              placeholder="Search by name or package (com.example.app)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <TabBtn id="all" label="All" n={counts.total} />
              <TabBtn id="running" label="Running" n={counts.running} />
              <TabBtn id="installed" label="Installed" n={counts.installed} />
              <div className="ml-auto">
                <Switch
                  label="System apps"
                  checked={showSystem}
                  onChange={setShowSystem}
                />
              </div>
            </div>
            {error && (
              <p className="mt-3 text-xs text-amber-300">
                {error}
              </p>
            )}
            <div className="mt-3 max-h-[360px] overflow-y-auto scrollbar-thin rounded-lg border border-white/5">
              {filtered.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">
                  {apps.length === 0 && !loading
                    ? "No applications found."
                    : "No matches."}
                </p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {filtered.map((a) => {
                    const active = a.identifier === selected;
                    return (
                      <li key={a.identifier || a.name}>
                        <button
                          onClick={() => onSelect(a.identifier)}
                          className={
                            "w-full text-left px-3 py-2 transition " +
                            (active
                              ? "bg-brand-500/15"
                              : "hover:bg-white/[0.04]")
                          }
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-slate-100 truncate">
                              {a.name}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {a.pid != null ? (
                                <Badge tone="ok">pid {a.pid}</Badge>
                              ) : (
                                <Badge tone="neutral">installed</Badge>
                              )}
                              {a.system && <Badge tone="warn">system</Badge>}
                            </div>
                          </div>
                          <div className="mt-0.5 text-xs font-mono text-slate-400 break-all">
                            {a.identifier}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
