#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Build a self-contained JNIXray AppImage for Linux.
#
# What it bundles:
#   - python-build-standalone (relocatable CPython)     -> usr/python
#   - portable Node.js                                  -> usr/node
#   - Python deps from requirements.txt                 -> usr/python/lib/...
#   - Backend source + production node_modules          -> usr/app/backend
#   - Built frontend (web/frontend/dist)                -> usr/app/frontend-dist
#
# What it does NOT bundle (same caveats as a manual setup):
#   - adb        -> install `android-tools-adb` or the full platform tools
#   - frida-server running on the device
#
# Usage:
#   packaging/appimage/build.sh            # -> dist/JNIXray-x86_64.AppImage
#   CLEAN=1 packaging/appimage/build.sh    # wipe build/ + .cache/ first
#
# Build host needs: bash, curl, tar, xz, file, sed, python3 (any), and the
# usual coreutils. Node + npm are fetched — we do NOT use the host's Node so
# the bundled node_modules are guaranteed ABI-compatible with the bundled
# runtime.
# ---------------------------------------------------------------------------
set -euo pipefail

# ---------- knobs -----------------------------------------------------------
PYTHON_VERSION="${PYTHON_VERSION:-3.12.7}"
PYTHON_BUILD_TAG="${PYTHON_BUILD_TAG:-20241016}"
NODE_VERSION="${NODE_VERSION:-20.18.0}"
APP_ARCH="${APP_ARCH:-$(uname -m)}"
[ "$APP_ARCH" = "arm64" ] && APP_ARCH="aarch64"
APPIMAGE_NAME="${APPIMAGE_NAME:-JNIXray-${APP_ARCH}.AppImage}"

# ---------- paths -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$REPO_ROOT/packaging/appimage/build"
CACHE_DIR="$REPO_ROOT/packaging/appimage/.cache"
APPDIR="$BUILD_DIR/JNIXray.AppDir"
DIST_DIR="$REPO_ROOT/dist"

if [ "${CLEAN:-0}" = "1" ]; then
  rm -rf "$BUILD_DIR" "$CACHE_DIR"
fi
mkdir -p "$BUILD_DIR" "$CACHE_DIR" "$DIST_DIR"
# Start from a clean AppDir every build, but keep the downloads cache.
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr"

log()  { printf '\033[1;36m[appimage]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[appimage]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------- arch mapping ----------------------------------------------------
case "$APP_ARCH" in
  x86_64)
    PBS_TRIPLE="x86_64-unknown-linux-gnu"
    NODE_ARCH="linux-x64"
    APPTOOL_ARCH="x86_64"
    ;;
  aarch64)
    PBS_TRIPLE="aarch64-unknown-linux-gnu"
    NODE_ARCH="linux-arm64"
    APPTOOL_ARCH="aarch64"
    ;;
  *) fail "unsupported APP_ARCH=$APP_ARCH (expected x86_64 or aarch64)" ;;
esac

# ---------- host sanity check ----------------------------------------------
for tool in curl tar file sed; do
  command -v "$tool" >/dev/null 2>&1 || fail "missing host tool: $tool"
done

fetch() {
  local url="$1" dest="$2"
  if [ -f "$dest" ]; then return 0; fi
  log "download $(basename "$dest")"
  curl -fL --retry 3 --retry-delay 2 -o "$dest.part" "$url"
  mv "$dest.part" "$dest"
}

# ---------- 1. fetch + extract Python --------------------------------------
PBS_FILE="cpython-${PYTHON_VERSION}+${PYTHON_BUILD_TAG}-${PBS_TRIPLE}-install_only.tar.gz"
PBS_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_BUILD_TAG}/${PBS_FILE}"
fetch "$PBS_URL" "$CACHE_DIR/$PBS_FILE"

PY_HOME="$APPDIR/usr/python"
log "extract python -> usr/python"
tar -xzf "$CACHE_DIR/$PBS_FILE" -C "$APPDIR/usr"
# The tarball top-level dir is "python/"; our target dir matches.
[ -x "$PY_HOME/bin/python3" ] || fail "python extraction layout unexpected"
PY_BIN="$PY_HOME/bin/python3"

# ---------- 2. fetch + extract Node ----------------------------------------
NODE_FILE="node-v${NODE_VERSION}-${NODE_ARCH}.tar.xz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_FILE}"
fetch "$NODE_URL" "$CACHE_DIR/$NODE_FILE"

NODE_HOME="$APPDIR/usr/node"
log "extract node -> usr/node"
mkdir -p "$NODE_HOME"
tar -xJf "$CACHE_DIR/$NODE_FILE" -C "$NODE_HOME" --strip-components=1
[ -x "$NODE_HOME/bin/node" ] || fail "node extraction layout unexpected"

# Pin all subsequent subshells to the bundled Python + Node. This guarantees
# the pip-installed deps and the npm-installed node_modules match what ends
# up shipping in the AppImage.
export PATH="$PY_HOME/bin:$NODE_HOME/bin:$PATH"

# ---------- 3. pip install python deps -------------------------------------
log "pip install -r requirements.txt"
"$PY_BIN" -m pip install --upgrade --no-warn-script-location \
  --disable-pip-version-check pip wheel setuptools >/dev/null
"$PY_BIN" -m pip install --no-warn-script-location \
  --disable-pip-version-check \
  -r "$REPO_ROOT/requirements.txt"

# ---------- 4. make the Python portable ------------------------------------
# python-build-standalone's interpreter is already relocatable, but pip writes
# absolute-path shebangs into usr/python/bin/* when it generates entry-point
# scripts (jnitrace, frida, frida-ps, ...). Those shebangs point at
# "$PY_BIN" right now — which only exists on the build host. At runtime the
# AppImage mounts at a different path, so we rewrite the shebangs to resolve
# through PATH. AppRun prepends usr/python/bin to PATH, so `env python3`
# always hits our bundled copy.
log "rewrite python script shebangs -> #!/usr/bin/env python3"
for f in "$PY_HOME/bin"/*; do
  [ -f "$f" ] || continue
  # Must be a text file (skip real ELF binaries like python3, python3.12).
  if ! file -b "$f" | grep -qiE '(script|text)'; then continue; fi
  read -r firstline < "$f" || continue
  case "$firstline" in
    '#!'*python*)
      tmp="$(mktemp)"
      { printf '%s\n' '#!/usr/bin/env python3'; tail -n +2 "$f"; } > "$tmp"
      chmod --reference="$f" "$tmp" 2>/dev/null || chmod 0755 "$tmp"
      mv "$tmp" "$f"
      ;;
  esac
done

# Trim obvious fat: __pycache__, tests, the bundled pip (we don't need it at
# runtime). Saves ~30-60MB.
find "$PY_HOME" -depth -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
rm -rf "$PY_HOME"/lib/python*/test 2>/dev/null || true
rm -rf "$PY_HOME"/lib/python*/idlelib 2>/dev/null || true
rm -rf "$PY_HOME"/lib/python*/tkinter 2>/dev/null || true

# ---------- 5. build frontend (using bundled node) -------------------------
log "npm install (frontend, for vite build)"
( cd "$REPO_ROOT/web/frontend" \
    && "$NODE_HOME/bin/npm" install --no-audit --no-fund --loglevel=error )

log "vite build frontend"
( cd "$REPO_ROOT/web/frontend" \
    && "$NODE_HOME/bin/npm" run build --loglevel=error )

[ -f "$REPO_ROOT/web/frontend/dist/index.html" ] || \
  fail "frontend build output missing (web/frontend/dist/index.html)"

# ---------- 6. stage backend with production-only node_modules -------------
APP_HOME="$APPDIR/usr/app"
log "stage backend -> usr/app/backend (prod deps only)"
mkdir -p "$APP_HOME/backend"
cp -a "$REPO_ROOT/web/backend/src"          "$APP_HOME/backend/"
cp -a "$REPO_ROOT/web/backend/py"           "$APP_HOME/backend/"
cp -a "$REPO_ROOT/web/backend/package.json" "$APP_HOME/backend/"
[ -f "$REPO_ROOT/web/backend/package-lock.json" ] && \
  cp -a "$REPO_ROOT/web/backend/package-lock.json" "$APP_HOME/backend/"

( cd "$APP_HOME/backend" \
    && "$NODE_HOME/bin/npm" install --omit=dev --no-audit --no-fund \
       --loglevel=error )

log "stage frontend dist -> usr/app/frontend-dist"
cp -a "$REPO_ROOT/web/frontend/dist" "$APP_HOME/frontend-dist"

# ---------- 7. top-level AppDir metadata ----------------------------------
log "install AppRun, .desktop, icon"
install -m 0755 "$SCRIPT_DIR/AppRun"         "$APPDIR/AppRun"
install -m 0644 "$SCRIPT_DIR/jnixray.desktop" "$APPDIR/jnixray.desktop"

# appimagetool wants a PNG named like the desktop entry. Try to rasterize
# the SVG; if no rasterizer is around, embed a minimal PNG placeholder so
# the tool doesn't complain.
ICON_SVG="$REPO_ROOT/docs/assets/logo.svg"
cp "$ICON_SVG" "$APPDIR/jnixray.svg"
if   command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w 256 -h 256 "$ICON_SVG" -o "$APPDIR/jnixray.png"
elif command -v convert       >/dev/null 2>&1; then
  convert -background none -resize 256x256 "$ICON_SVG" "$APPDIR/jnixray.png"
elif command -v inkscape      >/dev/null 2>&1; then
  inkscape "$ICON_SVG" --export-type=png --export-filename="$APPDIR/jnixray.png" -w 256 -h 256 >/dev/null 2>&1
else
  # 1x1 transparent PNG — appimagetool just needs *a* PNG to reference.
  "$PY_BIN" - "$APPDIR/jnixray.png" <<'PY'
import base64, sys
open(sys.argv[1], "wb").write(base64.b64decode(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="))
PY
  log "warn: no SVG rasterizer; shipping a placeholder PNG icon"
fi
ln -sf jnixray.png "$APPDIR/.DirIcon"

# ---------- 8. fetch appimagetool -----------------------------------------
APPTOOL="$CACHE_DIR/appimagetool-${APPTOOL_ARCH}.AppImage"
APPTOOL_URL="https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${APPTOOL_ARCH}.AppImage"
fetch "$APPTOOL_URL" "$APPTOOL"
chmod +x "$APPTOOL"

# ---------- 9. assemble ---------------------------------------------------
OUT="$DIST_DIR/$APPIMAGE_NAME"
rm -f "$OUT"
log "assembling $APPIMAGE_NAME"
# --appimage-extract-and-run avoids the host-FUSE dependency when running
# appimagetool itself (we're just using it as a static helper at build time).
ARCH="$APPTOOL_ARCH" "$APPTOOL" --appimage-extract-and-run \
  --no-appstream "$APPDIR" "$OUT"

log "done: $OUT"
log "size: $(du -h "$OUT" | awk '{print $1}')"
