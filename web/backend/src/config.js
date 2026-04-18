import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, "..", "..", "..");
export const venvDir = path.join(repoRoot, ".venv");
export const venvBin = path.join(venvDir, "bin");

function resolveBin(name, envOverride) {
  if (envOverride && process.env[envOverride]) return process.env[envOverride];
  const local = path.join(venvBin, name);
  if (fs.existsSync(local)) return local;
  return name;
}

// Env overrides let packaged builds (e.g. the AppImage) point at their
// bundled Python + jnitrace without relying on a repo-local .venv.
export const jnitraceBin = resolveBin("jnitrace", "JNIXRAY_JNITRACE");
export const fridaPsBin = resolveBin("frida-ps", "JNIXRAY_FRIDA_PS");
export const fridaBin = resolveBin("frida", "JNIXRAY_FRIDA");
export const pythonBin = resolveBin("python3", "JNIXRAY_PYTHON");
export const adbBin = process.env.ADB_BIN || "adb";

export const backendDir = path.resolve(__dirname, "..");
export const pyScriptsDir = path.join(backendDir, "py");

// Runtime scratch space for APK pulls and jni_helper JSON outputs.
const jnixrayHome =
  process.env.JNIXRAY_HOME ||
  path.join(process.env.HOME || process.env.USERPROFILE || ".", ".jnixray");
export const cacheDir = path.join(jnixrayHome, "cache");

export const port = Number.parseInt(process.env.PORT || "4455", 10);
export const host = process.env.HOST || "127.0.0.1";
