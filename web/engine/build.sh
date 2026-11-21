#!/bin/sh
# engine.wasm, the shared lighting engine the preview plays with when the switch of the designer is on (see
# docs/lighting-engine.md), built from Rocket-Show/lighting-engine (open source, GPL-3.0-or-later) at the revision
# below. It is not in git and not in the library; the production build of the app serves it. Without it the designer
# plays with its TypeScript engine, and the specs which need it are skipped.
#
#   web/engine/build.sh          → web/engine/engine.wasm
#
# Needs Rust with the target wasm32-unknown-unknown, and a checkout of Rocket-Show/lighting-engine (LIGHTING_ENGINE,
# default ../lighting-engine next to this repository) or else the internet to clone it from GitHub.
set -e
revision=5f84480e22ff7088d12d24c86dc044e8eaf1abab

here="$(cd "$(dirname "$0")" && pwd)"
engine="${LIGHTING_ENGINE:-$here/../../../lighting-engine}"

if [ ! -d "$engine/.git" ] && [ ! -f "$engine/.git" ]; then
  engine="${TMPDIR:-/tmp}/lighting-engine-clone"
  [ -d "$engine/.git" ] || git clone -q https://github.com/Rocket-Show/lighting-engine.git "$engine"
fi
build="${TMPDIR:-/tmp}/lighting-engine-$revision"
export PATH="$HOME/.cargo/bin:$PATH"

# the engine at the pinned revision, whatever its checkout is at
if [ ! -d "$build" ]; then
  git -C "$engine" cat-file -e "$revision^{commit}" 2>/dev/null || git -C "$engine" fetch -q origin
  mkdir -p "$build.partial"
  git -C "$engine" archive "$revision" | tar -x -C "$build.partial"
  mv "$build.partial" "$build"
fi

(cd "$build" && cargo build -q -p lighting-engine-wasm --target wasm32-unknown-unknown --release)
cp "$build/target/wasm32-unknown-unknown/release/engine.wasm" "$here/engine.wasm"
echo "web/engine/engine.wasm from the lighting engine $revision"
