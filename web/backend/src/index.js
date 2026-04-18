import express from "express";
import cors from "cors";
import fs from "node:fs";
import http from "node:http";
import { WebSocketServer } from "ws";
import { URL } from "node:url";

if (!process.env.PYTHONWARNINGS) {
  process.env.PYTHONWARNINGS = "ignore::UserWarning,ignore::DeprecationWarning";
}

import { host, port, jnitraceBin } from "./config.js";
import { runCommand } from "./exec.js";
import {
  listDevices,
  getDeviceAbi,
  listApplications,
  listAppLibraries,
  fridaVersion,
} from "./adb.js";
import { registry } from "./tracer.js";
import { runJniHelper } from "./jni-helper.js";
import { readSettings, writeSettings, redactSettings } from "./settings.js";
import { decompile, extractSo, locateCachedApk } from "./decomp.js";
import path from "node:path";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  let jnitraceVer = null;
  try {
    const r = await runCommand(jnitraceBin, ["-v"], { timeoutMs: 5000 });
    jnitraceVer = (r.stdout || r.stderr).trim().split("\n").pop();
  } catch {}
  const frida = await fridaVersion();
  res.json({
    ok: true,
    jnitrace: jnitraceVer,
    frida,
    time: new Date().toISOString(),
  });
});

app.get("/api/devices", async (_req, res) => {
  const devices = await listDevices();
  const enriched = await Promise.all(
    devices.map(async (d) => {
      if (d.state !== "device") return { ...d, abi: null };
      try {
        const abi = await getDeviceAbi(d.id);
        return { ...d, abi };
      } catch {
        return { ...d, abi: null };
      }
    }),
  );
  res.json({ devices: enriched });
});

app.get("/api/apps", async (req, res) => {
  const serial = req.query.serial ? String(req.query.serial) : undefined;
  const system = String(req.query.system || "") === "1";
  const result = await listApplications(serial, { system });
  res.json(result);
});

app.get("/api/apps/:pkg/libraries", async (req, res) => {
  const serial = req.query.serial ? String(req.query.serial) : undefined;
  const pkg = req.params.pkg;
  const result = await listAppLibraries(serial, pkg);
  res.json(result);
});

app.post("/api/apps/:pkg/jni-helper", async (req, res) => {
  const serial = req.query.serial ? String(req.query.serial) : undefined;
  const pkg = req.params.pkg;
  try {
    const result = await runJniHelper({ serial, pkg });
    res.json(result);
  } catch (err) {
    res
      .status(500)
      .json({ ok: false, error: String(err.message || err), package: pkg });
  }
});

app.get("/api/decomp/settings", async (_req, res) => {
  try {
    const s = await readSettings();
    res.json({ ok: true, settings: redactSettings(s) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.put("/api/decomp/settings", async (req, res) => {
  try {
    const merged = await writeSettings(req.body || {});
    res.json({ ok: true, settings: redactSettings(merged) });
  } catch (err) {
    res.status(400).json({ ok: false, error: String(err.message || err) });
  }
});

// Pull a single .so out of the cached APK and stream it back as an
// attachment so users can drop it straight into their own tools. The
// same APK cache the JNI helper + decompilers use is reused, so this
// is effectively free once those have run.
app.get("/api/apps/:pkg/so", async (req, res) => {
  const pkg = req.params.pkg;
  const rel = req.query.path ? String(req.query.path) : "";
  if (!rel || !rel.endsWith(".so")) {
    return res.status(400).json({ ok: false, error: "path must be a .so" });
  }
  try {
    const { apkPath, pkgDir } = locateCachedApk(pkg);
    const libsDir = path.join(pkgDir, "libs");
    const soPath = await extractSo(apkPath, rel, libsDir);
    res.download(soPath, path.basename(rel));
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.post("/api/decomp", async (req, res) => {
  try {
    const { engine, pkg, lib, symbol } = req.body || {};
    const result = await decompile({ engine, pkg, lib, symbol });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get("/api/sessions", (_req, res) => {
  res.json({ sessions: registry.list() });
});

app.post("/api/sessions", (req, res) => {
  try {
    const opts = req.body || {};
    const s = registry.create(opts);
    s.start();
    res.json({ id: s.id, snapshot: s.snapshot() });
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

app.delete("/api/sessions/:id", (req, res) => {
  const s = registry.get(req.params.id);
  if (!s) return res.status(404).json({ error: "not found" });
  s.stop();
  res.json({ ok: true, snapshot: s.snapshot() });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, "http://localhost");
  if (!url.pathname.startsWith("/ws/sessions/")) {
    socket.destroy();
    return;
  }
  const id = url.pathname.split("/").pop();
  const session = registry.get(id);
  if (!session) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request, session);
  });
});

wss.on("connection", (ws, _req, session) => {
  ws.send(JSON.stringify({ type: "snapshot", payload: session.snapshot() }));
  for (const entry of session.buffer) {
    ws.send(JSON.stringify({ type: "log", payload: entry }));
  }
  const onLog = (entry) => {
    try {
      ws.send(JSON.stringify({ type: "log", payload: entry }));
    } catch {}
  };
  const onStatus = (status) => {
    try {
      ws.send(JSON.stringify({ type: "status", payload: { status } }));
    } catch {}
  };
  session.on("log", onLog);
  session.on("status", onStatus);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "stop") session.stop();
    } catch {}
  });

  ws.on("close", () => {
    session.off("log", onLog);
    session.off("status", onStatus);
  });
});

// When FRONTEND_DIST points at a built Vite bundle (see `npm run build`),
// serve it from the same origin as the API so the whole app works on a
// single port. This is what the AppImage / standalone packaging uses —
// in dev you still just run `vite` and proxy /api + /ws from there.
const frontendDist = process.env.FRONTEND_DIST;
if (frontendDist && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { index: false, fallthrough: true }));
  app.get(/^(?!\/(api|ws)\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

server.listen(port, host, () => {
  console.log(`[jnixray] backend listening on http://${host}:${port}`);
  console.log(`[jnixray] jnitrace=${jnitraceBin}`);
  if (frontendDist && fs.existsSync(frontendDist)) {
    console.log(`[jnixray] serving ui from ${frontendDist}`);
  }
});
