#!/bin/sh
# engine.wasm, the shared lighting engine the preview plays with when the switch of the designer is on (see
# docs/lighting-engine.md), built from Rocket-Show/lighting-engine at the revision below. It is not in git and not in
# the library: the engine's repository has no licence yet. Without it the designer plays with its TypeScript engine,
# and the specs which need it are skipped.
#
#   web/engine/build.sh          → web/engine/engine.wasm
#
# Needs Rust with the target wasm32-unknown-unknown and a checkout of Rocket-Show/lighting-engine (LIGHTING_ENGINE,
# default ../lighting-engine next to this repository).
set -e
revision=ed1768c5f5aee97648cab9dc3c2c7b09536ff7d2

here="$(cd "$(dirname "$0")" && pwd)"
engine="${LIGHTING_ENGINE:-$here/../../../lighting-engine}"
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
