import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { cacheDir } from "./config.js";

// Settings live next to the APK cache so everything JNIXray owns is under
// one directory (~/.jnixray/) and easy for the user to nuke.
const settingsFile = path.join(path.dirname(cacheDir), "settings.json");

const DEFAULT = {
  ghidra: { homePath: "" },
  ida: { idat64Path: "" },
  binja: { installPath: "", pythonBin: "", licenseKey: "" },
};

function merge(cur, patch) {
  const out = { ...cur };
  for (const k of Object.keys(DEFAULT)) {
    out[k] = { ...DEFAULT[k], ...(cur[k] || {}), ...((patch && patch[k]) || {}) };
  }
  return out;
}

export async function readSettings() {
  try {
    const text = await fs.readFile(settingsFile, "utf-8");
    return merge(JSON.parse(text), {});
  } catch {
    return merge({}, {});
  }
}

export async function writeSettings(patch) {
  const cur = await readSettings();
  // Preserve existing secret if the client sent back the redacted placeholder.
  if (patch?.binja?.licenseKey === "••••••") delete patch.binja.licenseKey;
  const next = merge(cur, patch || {});
  await fs.mkdir(path.dirname(settingsFile), { recursive: true });
  await fs.writeFile(settingsFile, JSON.stringify(next, null, 2));
  return next;
}

export function redactSettings(s) {
  const ready = {
    ghidra: !!s.ghidra.homePath,
    ida: !!s.ida.idat64Path,
    binja: !!s.binja.installPath,
  };
  return {
    ghidra: { homePath: s.ghidra.homePath },
    ida: { idat64Path: s.ida.idat64Path },
    binja: {
      installPath: s.binja.installPath,
      pythonBin: s.binja.pythonBin,
      licenseKey: s.binja.licenseKey ? "••••••" : "",
      hasLicenseKey: !!s.binja.licenseKey,
    },
    ready,
    paths: { file: settingsFile, home: path.dirname(settingsFile) },
  };
}

export function settingsPath() {
  return settingsFile;
}

export function settingsExists() {
  return fssync.existsSync(settingsFile);
}
