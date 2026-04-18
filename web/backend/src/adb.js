import { runCommand } from "./exec.js";
import { adbBin, fridaPsBin } from "./config.js";

export async function listDevices() {
  try {
    const { stdout } = await runCommand(adbBin, ["devices", "-l"]);
    const lines = stdout.split("\n").slice(1);
    const devices = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      const id = parts[0];
      const state = parts[1];
      const descriptors = Object.fromEntries(
        parts.slice(2).map((kv) => {
          const i = kv.indexOf(":");
          return i === -1 ? [kv, true] : [kv.slice(0, i), kv.slice(i + 1)];
        }),
      );
      if (!id) continue;
      devices.push({
        id,
        state,
        model: descriptors.model || null,
        product: descriptors.product || null,
        device: descriptors.device || null,
        transport: descriptors.transport_id || null,
      });
    }
    return devices;
  } catch (err) {
    return [];
  }
}

export async function getDeviceAbi(serial) {
  const { stdout } = await runCommand(adbBin, [
    "-s",
    serial,
    "shell",
    "getprop",
    "ro.product.cpu.abi",
  ]);
  return stdout.trim();
}

function parseFridaPsTable(text) {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const rows = [];
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*PID\s+/.test(lines[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return rows;

  const header = lines[headerIdx];
  const sep = lines[headerIdx + 1] || "";
  const cols = [];
  let start = 0;
  let inDashes = false;
  for (let i = 0; i <= sep.length; i++) {
    const ch = sep[i];
    if (ch === "-" && !inDashes) {
      start = i;
      inDashes = true;
    } else if (ch !== "-" && inDashes) {
      cols.push({ start, end: i });
      inDashes = false;
    }
  }

  const headers = cols.map((c) => header.slice(c.start, c.end).trim());

  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const row = {};
    cols.forEach((c, idx) => {
      row[headers[idx] || `col${idx}`] = line.slice(c.start, c.end).trim();
    });
    rows.push(row);
  }
  return rows;
}

async function fridaApplications(serial) {
  const args = ["-Uai"];
  if (serial) args.push("--device", serial);
  const { stdout, code, stderr } = await runCommand(fridaPsBin, args, {
    timeoutMs: 20000,
  });
  if (code !== 0) {
    throw new Error(stderr.trim() || `frida-ps exited ${code}`);
  }
  const rows = parseFridaPsTable(stdout);
  return rows.map((r) => ({
    pid: r.PID && r.PID !== "-" ? Number.parseInt(r.PID, 10) : null,
    name: r.Name || "",
    identifier: r.Identifier || "",
  }));
}

async function adbPackages(serial, flag) {
  const args = serial ? ["-s", serial] : [];
  args.push("shell", "pm", "list", "packages", flag);
  const { stdout, code } = await runCommand(adbBin, args, { timeoutMs: 20000 });
  if (code !== 0) return [];
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("package:"))
    .map((l) => l.slice("package:".length).trim())
    .filter(Boolean);
}

async function adbLabels(serial, packages) {
  if (!packages.length) return new Map();
  const args = serial ? ["-s", serial] : [];
  args.push("shell", "cmd", "package", "list", "packages", "--show-versioncode");
  void args;
  return new Map();
}

export async function listApplications(serial, { system = false } = {}) {
  const result = {
    ok: true,
    errors: [],
    apps: [],
  };

  let fridaApps = [];
  try {
    fridaApps = await fridaApplications(serial);
  } catch (err) {
    result.errors.push({ source: "frida-ps", message: err.message || String(err) });
  }

  const byId = new Map();
  for (const a of fridaApps) {
    if (!a.identifier) continue;
    byId.set(a.identifier, {
      identifier: a.identifier,
      name: a.name || a.identifier,
      pid: a.pid,
      sources: ["frida"],
      system: false,
    });
  }

  try {
    const thirdParty = await adbPackages(serial, "-3");
    for (const id of thirdParty) {
      const existing = byId.get(id);
      if (existing) {
        if (!existing.sources.includes("pm")) existing.sources.push("pm");
        existing.system = false;
      } else {
        byId.set(id, {
          identifier: id,
          name: id,
          pid: null,
          sources: ["pm"],
          system: false,
        });
      }
    }
  } catch (err) {
    result.errors.push({ source: "pm -3", message: err.message || String(err) });
  }

  if (system) {
    try {
      const sys = await adbPackages(serial, "-s");
      for (const id of sys) {
        const existing = byId.get(id);
        if (existing) {
          if (!existing.sources.includes("pm")) existing.sources.push("pm");
          existing.system = true;
        } else {
          byId.set(id, {
            identifier: id,
            name: id,
            pid: null,
            sources: ["pm"],
            system: true,
          });
        }
      }
    } catch (err) {
      result.errors.push({ source: "pm -s", message: err.message || String(err) });
    }
  }

  const apps = [...byId.values()].sort((a, b) => {
    if ((b.pid ? 1 : 0) !== (a.pid ? 1 : 0)) return (b.pid ? 1 : 0) - (a.pid ? 1 : 0);
    if (a.system !== b.system) return a.system ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  if (apps.length === 0 && result.errors.length > 0) {
    result.ok = false;
    result.error = result.errors.map((e) => `${e.source}: ${e.message}`).join("; ");
  }
  result.apps = apps;
  return result;
}

async function adbShell(serial, cmd) {
  const args = serial ? ["-s", serial] : [];
  args.push("shell", cmd);
  return runCommand(adbBin, args, { timeoutMs: 15000 });
}

async function packageApkPaths(serial, pkg) {
  const { stdout, code } = await adbShell(serial, `pm path ${pkg}`);
  if (code !== 0) return [];
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("package:"))
    .map((l) => l.slice("package:".length).trim())
    .filter(Boolean);
}

function dirname(p) {
  const i = p.lastIndexOf("/");
  return i > 0 ? p.slice(0, i) : p;
}

export async function listAppLibraries(serial, pkg) {
  if (!pkg) return { ok: false, error: "Missing package name", libs: [] };

  const apks = await packageApkPaths(serial, pkg);
  if (apks.length === 0) {
    return { ok: false, error: `Package not installed: ${pkg}`, libs: [] };
  }

  const libs = new Map();
  const add = (name, abi, source) => {
    if (!name || !name.endsWith(".so")) return;
    if (!libs.has(name)) {
      libs.set(name, { name, abis: new Set(), sources: new Set() });
    }
    const entry = libs.get(name);
    if (abi) entry.abis.add(abi);
    if (source) entry.sources.add(source);
  };

  const appDirs = new Set(apks.map(dirname));

  for (const dir of appDirs) {
    try {
      const { stdout, code } = await adbShell(serial, `ls ${dir}/lib 2>/dev/null`);
      if (code === 0 && stdout.trim()) {
        const abis = stdout.split(/\s+/).filter(Boolean);
        for (const abi of abis) {
          const r = await adbShell(serial, `ls ${dir}/lib/${abi} 2>/dev/null`);
          if (r.code !== 0) continue;
          const files = r.stdout.split(/\s+/).filter(Boolean);
          for (const f of files) add(f, abi, "extracted");
        }
      }
    } catch {}
  }

  if (libs.size === 0) {
    for (const apk of apks) {
      try {
        const { stdout } = await adbShell(
          serial,
          `unzip -l "${apk}" 2>/dev/null`,
        );
        for (const line of stdout.split("\n")) {
          const m = line.match(/\blib\/([^/\s]+)\/([^/\s]+\.so)\s*$/);
          if (m) add(m[2], m[1], "apk");
        }
      } catch {}
    }
  }

  const result = [...libs.values()]
    .map((l) => ({
      name: l.name,
      abis: [...l.abis].sort(),
      sources: [...l.sources],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ok: true,
    package: pkg,
    apks,
    libs: result,
  };
}

export async function fridaVersion() {
  try {
    const { stdout, code } = await runCommand(fridaPsBin, ["--version"]);
    if (code === 0) return stdout.trim();
  } catch {}
  return null;
}
