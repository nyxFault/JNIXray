import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import { runCommand } from "./exec.js";
import { pythonBin, pyScriptsDir, cacheDir } from "./config.js";
import { readSettings } from "./settings.js";

function safeSlug(s) {
  return String(s || "unknown").replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function extractSo(apkPath, libRel, outDir) {
  await fs.mkdir(outDir, { recursive: true });
  const cached = path.join(outDir, path.basename(libRel));
  if (fssync.existsSync(cached) && fssync.statSync(cached).size > 0) return cached;
  const r = await runCommand(
    pythonBin,
    [path.join(pyScriptsDir, "extract_so.py"), apkPath, libRel, outDir],
    { timeoutMs: 30000 },
  );
  if (r.code !== 0 || !fssync.existsSync(cached)) {
    throw new Error(
      `extract_so.py failed: ${r.stderr.trim() || r.stdout.trim() || `exit ${r.code}`}`,
    );
  }
  return cached;
}

export function locateCachedApk(pkg) {
  const dir = path.join(cacheDir, safeSlug(pkg));
  if (!fssync.existsSync(dir)) {
    throw new Error("APK not cached yet — run JNI Helper on this package first.");
  }
  const apk = fssync.readdirSync(dir).find((f) => f.endsWith(".apk"));
  if (!apk) {
    throw new Error("No APK in cache — re-run JNI Helper on this package.");
  }
  return { apkPath: path.join(dir, apk), pkgDir: dir };
}

function assertExecutable(filePath, kind) {
  let st;
  try {
    st = fssync.statSync(filePath);
  } catch (err) {
    throw new Error(
      `${kind} not found at ${filePath} (${err.code || err.message}).`,
    );
  }
  if (st.isDirectory()) {
    throw new Error(
      `${kind} path is a directory, not a file: ${filePath}. Point it at the actual binary.`,
    );
  }
  if (!st.isFile()) {
    throw new Error(`${kind} is not a regular file: ${filePath}`);
  }
  try {
    fssync.accessSync(filePath, fssync.constants.X_OK);
  } catch {
    throw new Error(
      `${kind} is not executable: ${filePath}. Fix with: chmod +x ${filePath}`,
    );
  }
}

// Ghidra's launcher (and IDA, occasionally) dumps a JDK banner on stderr
// before it even starts doing anything useful. When the run fails we grab
// both streams and strip that banner so the user sees the *actual* error
// instead of "openjdk version 21.0.11-ea…".
const JDK_BANNER_RE =
  /^\s*(openjdk|java)\s+(version|runtime|64-bit|client)\b.*$/i;

function cleanToolOutput(s) {
  return (s || "")
    .split(/\r?\n/)
    .filter((ln) => !JDK_BANNER_RE.test(ln))
    .join("\n")
    .trim();
}

async function writeToolLog(pkgDir, engine, r) {
  try {
    const logFile = path.join(pkgDir, `decomp-${engine}.log`);
    const body = `# exit=${r.code}\n\n## stdout\n${r.stdout || ""}\n\n## stderr\n${r.stderr || ""}\n`;
    await fs.writeFile(logFile, body, "utf-8");
    return logFile;
  } catch {
    return null;
  }
}

function failureMessage(kind, r, logFile) {
  const tail = (s, n) => {
    const lines = (s || "").split(/\r?\n/);
    return lines.slice(-n).join("\n");
  };
  const cleanErr = cleanToolOutput(r.stderr);
  const cleanOut = cleanToolOutput(r.stdout);
  const body =
    cleanErr && cleanOut
      ? `${tail(cleanErr, 20)}\n---\n${tail(cleanOut, 40)}`
      : (cleanErr || cleanOut || tail(r.stderr || r.stdout || "", 40)).trim();
  const msg =
    body ||
    `${kind} exited ${r.code} without writing output and without any log lines.`;
  const suffix = logFile ? `\n\nFull log: ${logFile}` : "";
  return `${kind} exited ${r.code}.\n${msg}${suffix}`;
}

function resolveIdatBinary(raw) {
  if (!raw) throw new Error("IDA path is not configured.");
  let p = raw.trim();
  let st;
  try {
    st = fssync.statSync(p);
  } catch (err) {
    throw new Error(`IDA path not found: ${p} (${err.code || err.message}).`);
  }
  if (st.isDirectory()) {
    // Common layouts: <install>/idat64 (Linux), <install>/ida64 (9.x+),
    // <install>/idat64.exe (Windows via wine). Try each, prefer idat64.
    const candidates = ["idat64", "ida64", "idat", "ida", "idat64.exe", "ida64.exe"];
    const hit = candidates
      .map((c) => path.join(p, c))
      .find((q) => fssync.existsSync(q) && fssync.statSync(q).isFile());
    if (!hit) {
      throw new Error(
        `Couldn't find idat64/ida64 inside ${p}. Point the path at the actual binary instead.`,
      );
    }
    p = hit;
  }
  assertExecutable(p, "IDA");
  return p;
}

async function runGhidra({ soPath, symbol, outFile, settings, pkgDir }) {
  const home = settings.ghidra.homePath;
  if (!home) throw new Error("Ghidra home path is not configured.");
  const headless = path.join(home, "support", "analyzeHeadless");
  if (!fssync.existsSync(headless)) {
    throw new Error(
      `analyzeHeadless not found at ${headless} — check the Ghidra home path.`,
    );
  }
  assertExecutable(headless, "analyzeHeadless");
  const projDir = await fs.mkdtemp(path.join(os.tmpdir(), "jnixray-ghidra-"));
  try {
    const args = [
      projDir,
      "jnixray",
      "-import",
      soPath,
      "-scriptPath",
      pyScriptsDir,
      "-postScript",
      // Java, not Python — Ghidra 12 defaults .py to PyGhidra (CPython
      // bridge) which isn't installed everywhere. The .java variant gets
      // compiled by Ghidra itself at script-load time, no extra deps.
      "decomp_ghidra_post.java",
      symbol,
      outFile,
      "-deleteProject",
      "-overwrite",
    ];
    const r = await runCommand(headless, args, { timeoutMs: 600000 });
    const logFile = await writeToolLog(pkgDir, "ghidra", r);
    if (!fssync.existsSync(outFile)) {
      throw new Error(failureMessage("Ghidra analyzeHeadless", r, logFile));
    }
  } finally {
    await fs.rm(projDir, { recursive: true, force: true });
  }
}

async function runIda({ soPath, symbol, outFile, settings, pkgDir }) {
  const idat = resolveIdatBinary(settings.ida.idat64Path);
  const script = path.join(pyScriptsDir, "decomp_ida.py");
  const env = {
    JNIXRAY_SYMBOL: symbol,
    JNIXRAY_OUT: outFile,
    // IDA gets noisy about TVHEADLESS; keep it quiet.
    TVHEADLESS: "1",
  };
  // Work on a copy so IDA's *.i64 side-files don't pollute the cache layout.
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "jnixray-ida-"));
  try {
    const workSo = path.join(workDir, path.basename(soPath));
    await fs.copyFile(soPath, workSo);
    const r = await runCommand(idat, ["-A", `-S${script}`, workSo], {
      timeoutMs: 600000,
      env,
    });
    const logFile = await writeToolLog(pkgDir, "ida", r);
    if (!fssync.existsSync(outFile)) {
      throw new Error(failureMessage("IDA idat64", r, logFile));
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function runBinja({ soPath, symbol, outFile, settings, pkgDir }) {
  const install = settings.binja.installPath;
  if (!install) throw new Error("Binary Ninja install path is not configured.");
  try {
    const st = fssync.statSync(install);
    if (!st.isDirectory()) {
      throw new Error(
        `Binary Ninja install path should be the install directory, got file: ${install}`,
      );
    }
  } catch (err) {
    if (err.code) {
      throw new Error(
        `Binary Ninja install path not found: ${install} (${err.code}).`,
      );
    }
    throw err;
  }
  const py = settings.binja.pythonBin || pythonBin;
  const bnPy = path.join(install, "python");
  const env = {
    PYTHONPATH: fssync.existsSync(bnPy)
      ? bnPy + path.delimiter + (process.env.PYTHONPATH || "")
      : install + path.delimiter + (process.env.PYTHONPATH || ""),
  };
  if (settings.binja.licenseKey) env.BN_LICENSE = settings.binja.licenseKey;
  const script = path.join(pyScriptsDir, "decomp_binja.py");
  const r = await runCommand(py, [script, soPath, symbol, outFile], {
    timeoutMs: 300000,
    env,
  });
  const logFile = await writeToolLog(pkgDir, "binja", r);
  if (!fssync.existsSync(outFile)) {
    throw new Error(failureMessage("Binary Ninja driver", r, logFile));
  }
}

const ENGINES = {
  ghidra: runGhidra,
  ida: runIda,
  binja: runBinja,
};

export async function decompile({ engine, pkg, lib, symbol }) {
  if (!ENGINES[engine]) throw new Error(`Unknown engine: ${engine}`);
  if (!pkg) throw new Error("Missing package name.");
  if (!lib) throw new Error("Missing .so path.");
  if (!symbol) throw new Error("Missing symbol name.");

  const settings = await readSettings();
  const { apkPath, pkgDir } = locateCachedApk(pkg);
  const libsDir = path.join(pkgDir, "libs");
  const soPath = await extractSo(apkPath, lib, libsDir);

  const outFile = path.join(
    pkgDir,
    `decomp-${engine}-${safeSlug(path.basename(lib))}-${safeSlug(symbol)}.c`,
  );
  await fs.rm(outFile, { force: true });

  await ENGINES[engine]({ soPath, symbol, outFile, settings, pkgDir });

  const text = await fs.readFile(outFile, "utf-8");
  return { ok: true, engine, symbol, lib, text };
}
