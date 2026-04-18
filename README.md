<p align="center">
  <img src="docs/assets/logo.svg" width="128" alt="JNIXray">
</p>

<h1 align="center">JNIXray</h1>

<p align="center">
  A browser UI for <a href="https://github.com/chame1eon/jnitrace"><code>jnitrace</code></a>,
  plus a static JNI helper for Android apps.
</p>

<p align="center">
  <a href="LICENSE"><img alt="license"  src="https://img.shields.io/badge/license-MIT-3366ff?style=flat-square"></a>
  <img alt="android"  src="https://img.shields.io/badge/platform-Android-3ddc84?style=flat-square&logo=android&logoColor=white">
  <img alt="python"   src="https://img.shields.io/badge/python-3.10%2B-3776ab?style=flat-square&logo=python&logoColor=white">
  <img alt="node"     src="https://img.shields.io/badge/node-20%2B-339933?style=flat-square&logo=node.js&logoColor=white">
  <img alt="frida"    src="https://img.shields.io/badge/frida-16.x-e8392f?style=flat-square">
  <img alt="jnitrace" src="https://img.shields.io/badge/jnitrace-3.3.1-5c86ff?style=flat-square">
  <img alt="status"   src="https://img.shields.io/badge/status-alpha-f59e0b?style=flat-square">
</p>

<p align="center">
  <img src="https://cdn.simpleicons.org/react/61DAFB"        height="28" alt="React">     &nbsp;
  <img src="https://cdn.simpleicons.org/vite/646CFF"         height="28" alt="Vite">      &nbsp;
  <img src="https://cdn.simpleicons.org/typescript/3178C6"   height="28" alt="TypeScript">&nbsp;
  <img src="https://cdn.simpleicons.org/tailwindcss/06B6D4"  height="28" alt="Tailwind">  &nbsp;
  <img src="https://cdn.simpleicons.org/express/cccccc"      height="28" alt="Express">   &nbsp;
  <img src="https://cdn.simpleicons.org/python/3776AB"       height="28" alt="Python">    &nbsp;
  <img src="https://cdn.simpleicons.org/android/3DDC84"      height="28" alt="Android">
</p>

---

## Screenshots

<p align="center">
  <img src="https://raw.githubusercontent.com/nyxFault/Images/main/JNIXray_01.png" width="900" alt="Live JNI trace"><br>
  <sub><i>Live trace — color-coded args, thread chips, backtrace, equivalent CLI command preview.</i></sub>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nyxFault/Images/main/JNIXray_02.png" width="900" alt="JNI Helper — native methods"><br>
  <sub><i>JNI Helper pairs every <code>native</code> Java method with the C symbol that exports it from the .so.</i></sub>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nyxFault/Images/main/JNIXray_03.png" width="900" alt="Pseudo-C from Binary Ninja"><br>
  <sub><i>One-click pseudo-C from Ghidra / IDA / Binary Ninja, re-typed with JNI signatures from the DEX.</i></sub>
</p>

---

Pick a device, pick an app, hit *Start trace*. JNI calls stream in live over
a WebSocket. Every flag `jnitrace` takes on the command line is also exposed
in the config tab (libraries, method/export include-exclude filters, backtrace
mode, `--aux`, and so on).

There's also a **JNI Helper** panel that pulls the APK off the device, parses
the DEX to find every `native` Java method, and pairs each one with the C
symbol that exports it from whichever `.so` ships in the APK. If you have
Ghidra, IDA Pro or Binary Ninja installed you can decompile any of those
symbols to pseudo-C with one click, and the output gets re-typed with the JNI
signature so `jobject`s and friends aren't just `void *` blobs.

### What you get

- Live JNI call stream with color-coded args, thread chips, backtraces.
- Method and export include/exclude filters, spawn or attach, three backtrace
  modes. Same flags as the `jnitrace` CLI.
- Static APK analysis: `native` Java method ↔ exported C symbol pairing.
- One-click pseudo-C from Ghidra / IDA / Binary Ninja, re-typed with JNI
  signatures pulled from the DEX.
- Download the `.so` or the pseudo-C straight from the UI.
- ANSI-rendered log, substring filter, export to `.log`.

## Why

The `jnitrace` CLI is great but the invocation gets long once you start piling
on filters, and you lose scroll position every time you Ctrl-C. Running it
from a UI makes exploration quicker and streaming the output means you can
attach, detach, pause or filter without tearing the session down.

## Requirements

- Python 3.10+
- Node.js 20+, npm 9+
- `adb` on `PATH` (or set `ADB_BIN`).
- A Frida 16.x `frida-server` running on the device. Same setup as any other
  Frida workflow. 17 broke APIs `jnitrace` depends on so the stack is pinned
  to 16 for now.

Python deps are in `requirements.txt`.

## Setup

```bash
git clone https://github.com/nyxFault/JNIXray.git
cd JNIXray

# python side (tracer + static analysis helpers)
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# node side (API + UI)
cd web
npm run install:all
```

## Run it

```bash
cd web
npm run dev
```

- UI: http://127.0.0.1:5173
- API / WS: http://127.0.0.1:4455

Vite proxies `/api` and `/ws` to the backend, so you only ever open the
frontend URL. That's it.

For a static build:

```bash
npm run build
# output: web/frontend/dist/
# backend is a plain Node ESM app; host it however you like
```

## Try it with the demo APK

If you don't have a target app handy, there's a tiny sample APK in
[`examples/HelloJNI/`](examples/HelloJNI/) — a throwaway Android app I built
specifically to give JNIXray something predictable to trace.

```bash
adb install examples/HelloJNI/app-debug.apk
```

Then in the UI: **Device → App** (`com.example.hellojni`) → **Start trace**.
Tap the buttons in the app and the JNI calls will roll in.

The matching source is at <https://github.com/nyxFault/HelloJNI>, and the
prebuilt APK lives on its [releases page](https://github.com/nyxFault/HelloJNI/releases/download/v1.0.0/app-debug.apk)
too if you'd rather grab it from there.

## Decompilers (optional)

The JNI Helper can shell out to external decompilers. Install whichever you
already own and point JNIXray at them from the gear icons in the top-right of
the JNI Helper panel. Paths are saved in `~/.jnixray/settings.json`, never in
the repo.

| | Tool | How to hook it up |
| :--: | --- | --- |
| <img src="web/frontend/public/engines/ghidra.svg" width="28" alt="Ghidra"> | **Ghidra** | Set *Ghidra home* to the folder containing `support/analyzeHeadless`. |
| <img src="web/frontend/public/engines/ida.png" width="28" alt="IDA Pro">   | **IDA Pro** | Path to `idat64`, or to the install dir (it'll find `idat64` inside). |
| <img src="web/frontend/public/engines/binja.png" width="28" alt="Binary Ninja"> | **Binary Ninja** | Install folder. License key optional if `~/.binaryninja/license.dat` is already set up. |

None of these are required to use the live tracer.

## Layout

```
.
├── requirements.txt          # python: jnitrace, frida, androguard, ...
├── web/
│   ├── package.json          # dev orchestration
│   ├── scripts/dev.js        # runs backend + frontend together
│   ├── backend/
│   │   ├── src/              # express + ws server (index.js, tracer.js, ...)
│   │   └── py/               # python helpers (jni_helper.py, decomp_*.py)
│   └── frontend/             # vite + react + tailwind
├── examples/HelloJNI/        # tiny sample APK to play with
└── docs/assets/              # logos
```

## API

```
GET    /api/health                   jnitrace + frida versions
GET    /api/devices                  adb devices -l, enriched with ABI
GET    /api/apps?serial=ID           frida-ps -Uai on that device
POST   /api/sessions                 body = TraceOptions; starts a trace
DELETE /api/sessions/:id             stops it
WS     /ws/sessions/:id              { type: "log" | "status", payload }

POST   /api/jni-helper                static APK analysis
POST   /api/decompile                 { engine, pkg, lib, symbol }
GET    /api/decomp/settings
POST   /api/decomp/settings
```

## Env vars

| Var       | Default     | What                              |
| --------- | ----------- | --------------------------------- |
| `HOST`    | `127.0.0.1` | Backend bind host                 |
| `PORT`    | `4455`      | Backend bind port                 |
| `ADB_BIN` | `adb`       | Override the `adb` executable     |

## Heads up

There is **no authentication** on the backend. Keep it bound to loopback. If
you're exposing it on a LAN, put a reverse proxy with some kind of auth in
front of it.

Same goes for the decompiler integrations: JNIXray runs whatever binary you
point it at, so don't point it at stuff you don't trust.

## Credits

- [`jnitrace`](https://github.com/chame1eon/jnitrace) by chame1eon does all
  the real work on the tracing side.
- [`frida`](https://frida.re/) for instrumentation.
- [`jni_helper`](https://github.com/evilpan/jni_helper) by evilpan inspired
  the static APK analyzer.
- [`androguard`](https://github.com/androguard/androguard) for DEX parsing.


