import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

function start(name, cmd, args, cwd, color) {
  const child = spawn(cmd, args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  const prefix = (chunk) =>
    chunk
      .toString()
      .split("\n")
      .map((l) => (l ? tag + l : ""))
      .join("\n");
  child.stdout.on("data", (d) => process.stdout.write(prefix(d)));
  child.stderr.on("data", (d) => process.stderr.write(prefix(d)));
  child.on("exit", (code) => {
    process.stderr.write(`${tag}exited with ${code}\n`);
    process.exit(code ?? 1);
  });
  return child;
}

const backend = start(
  "backend ",
  "npm",
  ["--prefix", "backend", "run", "dev"],
  webRoot,
  "36",
);
const frontend = start(
  "frontend",
  "npm",
  ["--prefix", "frontend", "run", "dev"],
  webRoot,
  "35",
);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    backend.kill(sig);
    frontend.kill(sig);
  });
}
