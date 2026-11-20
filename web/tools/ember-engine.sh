#!/bin/sh
# Build engine.wasm of the lighting engine and copy it to where the online designer loads it from
# (src/assets/ember/engine.wasm, not in git: the engine is a private repository). It has to be the engine revision
# the Ember stick's firmware is built with, or the stick refuses the shows (its behaviour version differs).
#
#   tools/ember-engine.sh [path of the lighting-engine checkout, default ../../lighting-engine]
set -e
cd "$(dirname "$0")/.."
engine="${1:-../../lighting-engine}"
export PATH="$HOME/.cargo/bin:$PATH"
(cd "$engine" && cargo build -p lighting-engine-wasm --target wasm32-unknown-unknown --release)
mkdir -p src/assets/ember
cp "$engine/target/wasm32-unknown-unknown/release/engine.wasm" src/assets/ember/engine.wasm
echo "src/assets/ember/engine.wasm from $(cd "$engine" && git rev-parse --short HEAD)"
