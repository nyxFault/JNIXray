import { useEffect } from "react";
import type { DeviceInfo } from "../lib/api";
import { api } from "../lib/api";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from "./ui";

interface Props {
  devices: DeviceInfo[];
  selected: string | null;
  onSelect: (id: string) => void;
  onDevicesChanged: (devices: DeviceInfo[]) => void;
  loading: boolean;
  setLoading: (b: boolean) => void;
}

export function DeviceSelector({
  devices,
  selected,
  onSelect,
  onDevicesChanged,
  loading,
  setLoading,
}: Props) {
  async function refresh() {
    setLoading(true);
    try {
      const { devices } = await api.devices();
      onDevicesChanged(devices);
      const first = devices.find((d) => d.state === "device");
      if (!selected && first) onSelect(first.id);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="text-brand-300">01.</span> Target device
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
          {loading ? "Scanning…" : "Refresh"}
        </Button>
      </CardHeader>
      <CardBody>
        {devices.length === 0 ? (
          <p className="text-sm text-slate-400">
            No devices found. Plug in your phone and run <code>adb devices</code>.
          </p>
        ) : (
          <ul className="space-y-2">
            {devices.map((d) => {
              const active = d.id === selected;
              const offline = d.state !== "device";
              return (
                <li key={d.id}>
                  <button
                    onClick={() => !offline && onSelect(d.id)}
                    disabled={offline}
                    className={
                      "w-full text-left rounded-xl border px-3 py-2.5 transition " +
                      (active
                        ? "border-brand-400/50 bg-brand-500/10 shadow-glow"
                        : offline
                          ? "border-white/5 bg-white/[0.02] opacity-60 cursor-not-allowed"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]")
                    }
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">{d.id}</span>
                      <Badge tone={offline ? "warn" : "ok"}>{d.state}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                      {d.model && <span>model: {d.model}</span>}
                      {d.abi && <span>abi: {d.abi}</span>}
                      {d.product && <span>product: {d.product}</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
