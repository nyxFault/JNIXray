import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { jnitraceBin } from "./config.js";

export class TraceSession extends EventEmitter {
  constructor(options) {
    super();
    this.id = randomUUID();
    this.options = options;
    this.child = null;
    this.status = "idle";
    this.startedAt = null;
    this.stoppedAt = null;
    this.exitCode = null;
    this.buffer = [];
    this.maxBuffer = 5000;
  }

  buildArgs() {
    const o = this.options;
    const args = [];

    for (const lib of o.libraries || []) {
      if (lib) args.push("-l", lib);
    }
    for (const inc of o.include || []) {
      if (inc) args.push("-i", inc);
    }
    for (const exc of o.exclude || []) {
      if (exc) args.push("-e", exc);
    }
    for (const inc of o.includeExport || []) {
      if (inc) args.push("-I", inc);
    }
    for (const exc of o.excludeExport || []) {
      if (exc) args.push("-E", exc);
    }

    if (o.injectMethod && ["spawn", "attach"].includes(o.injectMethod)) {
      args.push("-m", o.injectMethod);
    }
    if (o.backtrace && ["fuzzy", "accurate", "none"].includes(o.backtrace)) {
      args.push("-b", o.backtrace);
    }
    if (o.remote) {
      args.push("-R", o.remote);
    }
    if (o.hideData) args.push("--hide-data");
    if (o.ignoreEnv) args.push("--ignore-env");
    if (o.ignoreVm) args.push("--ignore-vm");
    if (o.output) args.push("-o", o.output);
    if (o.prepend) args.push("-p", o.prepend);
    if (o.append) args.push("-a", o.append);

    for (const aux of o.aux || []) {
      if (aux) args.push("--aux", aux);
    }

    if (!o.target) throw new Error("target (package name) is required");
    args.push(o.target);
    return args;
  }

  start() {
    if (this.child) throw new Error("Already running");
    const args = this.buildArgs();
    this.emit("log", {
      stream: "meta",
      data: `$ jnitrace ${args.map((a) => (a.includes(" ") ? `'${a}'` : a)).join(" ")}\n`,
    });

    const child = spawn(jnitraceBin, args, {
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        FORCE_COLOR: "1",
        CLICOLOR_FORCE: "1",
        PYTHONWARNINGS: "ignore::UserWarning,ignore::DeprecationWarning",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (child.stdin) {
      child.stdin.on("error", () => {});
    }
    this.child = child;
    this.status = "running";
    this.startedAt = Date.now();
    this.emit("status", this.status);

    const push = (stream, data) => {
      const payload = { stream, data, ts: Date.now() };
      this.buffer.push(payload);
      if (this.buffer.length > this.maxBuffer) this.buffer.shift();
      this.emit("log", payload);
    };

    child.stdout.on("data", (d) => push("stdout", d.toString("utf8")));
    child.stderr.on("data", (d) => push("stderr", d.toString("utf8")));
    child.on("error", (err) => {
      push("meta", `\n[jnixray] process error: ${err.message}\n`);
    });
    child.on("close", (code, signal) => {
      this.status = "stopped";
      this.stoppedAt = Date.now();
      this.exitCode = code;
      this.child = null;
      push(
        "meta",
        `\n[jnixray] jnitrace exited (code=${code ?? "null"}${signal ? `, signal=${signal}` : ""})\n`,
      );
      this.emit("status", this.status);
      this.emit("closed", { code, signal });
    });
  }

  stop() {
    if (!this.child) return;
    const child = this.child;
    try {
      if (child.stdin && !child.stdin.destroyed) {
        try {
          child.stdin.write("\n");
        } catch {}
        try {
          child.stdin.end();
        } catch {}
      }
    } catch {}
    setTimeout(() => {
      if (this.child === child) {
        try {
          child.kill("SIGINT");
        } catch {}
      }
    }, 500);
    setTimeout(() => {
      if (this.child === child) {
        try {
          child.kill("SIGKILL");
        } catch {}
      }
    }, 2500);
  }

  snapshot() {
    return {
      id: this.id,
      status: this.status,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      exitCode: this.exitCode,
      options: this.options,
    };
  }
}

class TraceRegistry {
  constructor() {
    this.sessions = new Map();
  }
  create(options) {
    const s = new TraceSession(options);
    this.sessions.set(s.id, s);
    s.on("closed", () => {
      setTimeout(() => this.sessions.delete(s.id), 30 * 60 * 1000);
    });
    return s;
  }
  get(id) {
    return this.sessions.get(id);
  }
  list() {
    return [...this.sessions.values()].map((s) => s.snapshot());
  }
}

export const registry = new TraceRegistry();
