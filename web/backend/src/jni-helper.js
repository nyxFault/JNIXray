import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { runCommand } from "./exec.js";
import { adbBin, pythonBin, pyScriptsDir, cacheDir } from "./config.js";

async function adb(serial, args, { timeoutMs = 30000, env } = {}) {
  const a = serial ? ["-s", serial, ...args] : args;
  return runCommand(adbBin, a, { timeoutMs, env });
}

async function ensureDir(p) {
  if (!fssync.existsSync(p)) await fs.mkdir(p, { recursive: true });
}

function safePkgDir(pkg) {
  const slug = (pkg || "unknown").replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(cacheDir, slug);
}

async function getApkPaths(serial, pkg) {
  const { stdout, code } = await adb(serial, ["shell", `pm path ${pkg}`]);
  if (code !== 0) return [];
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("package:"))
    .map((l) => l.slice("package:".length).trim())
    .filter(Boolean);
}

async function pullApk(serial, pkg) {
  const paths = await getApkPaths(serial, pkg);
  if (paths.length === 0) throw new Error(`Package not installed: ${pkg}`);
  const dir = safePkgDir(pkg);
  await ensureDir(dir);
  // Prefer the base APK (shortest name) — split APKs rarely hold native libs.
  const base =
    paths.find((p) => /\/base\.apk$/.test(p)) ||
    paths.sort((a, b) => a.length - b.length)[0];
  const dest = path.join(dir, path.basename(base));
  const r = await adb(serial, ["pull", base, dest], { timeoutMs: 180000 });
  if (r.code !== 0) {
    throw new Error(
      `adb pull failed for ${base}: ${r.stderr.trim() || r.stdout.trim()}`,
    );
  }
  return dest;
}

export async function runJniHelper({ serial, pkg }) {
  if (!pkg) throw new Error("Missing package name");
  await ensureDir(cacheDir);
  const apkPath = await pullApk(serial, pkg);

  const outFile = path.join(
    path.dirname(apkPath),
    `jni-helper-${path.basename(apkPath, ".apk")}.json`,
  );
  const script = path.join(pyScriptsDir, "jni_helper.py");

  const r = await runCommand(
    pythonBin,
    [script, apkPath, "-o", outFile],
    {
      timeoutMs: 300000,
      env: { PYTHONWARNINGS: "ignore" },
    },
  );

  if (!fssync.existsSync(outFile)) {
    const err = (r.stderr || r.stdout || "").trim();
    throw new Error(err || `jni_helper.py exited ${r.code}`);
  }

  const text = await fs.readFile(outFile, "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`invalid JSON from jni_helper.py: ${e.message}`);
  }
  parsed.package = pkg;
  parsed.apkBasename = path.basename(apkPath);
  return parsed;
}
