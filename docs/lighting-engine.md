# The shared lighting engine in the designer

The preview of the designer computes every channel of every fixture with an engine of its own, in TypeScript
(`web/projects/designer`), which is kept equal to the Java engine of Rocket Show by hand. Both are to be replaced by one
engine written once, in Rust, in the repository `Rocket-Show/lighting-engine`. This document says how the designer uses
it. How the engine itself works (its core, its compiler, the compiled show, the boundary of `engine.wasm`) is in that
repository: `concept.md`, `docs/format.md` and `README.md`.

Status: plan, 11 November 2026. The engine exists and passes the conformance cases of this repository within ±1 (see
"What changes in the preview"). Nothing of it is in the designer yet.

## 1. Decisions

| Topic            | Decision                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| How it is loaded | **`engine.wasm`**, the same file Rocket Show loads, behind a thin TypeScript wrapper                                    |
| A recompile      | **Has to feel instant**: an edit reaches the preview on the next animation frame                                        |
| The switch       | **Behind a switch**, compared with the TypeScript engine while both exist; then the TypeScript engine is deleted        |
| Old projects     | **Migrated in TypeScript, as today**, before they are handed over: the engine's compiler reads the current version only |
| The cases        | **Move to the engine's repository** once the preview plays with it; until then they are recorded here                   |

## 2. Today

- **The TypeScript engine** is about 80 model files plus the preview, preset, fixture and timeline services of
  `web/projects/designer`. It computes in JavaScript numbers, which are doubles, and takes its time from
  `performance.now()`.
- **The conformance cases** in `web/projects/designer/conformance` (32 files) are recorded from it
  (`npm run conformance:record`) and compared exactly by Rocket Show.
- **The discipline for equal numbers**: `arc-tangent.ts`, `cycle-sine.ts` and `pixel-math.ts` exist in both languages,
  because `Math.atan2` and `Math.sin` round differently in Java and in the browser.

## 3. What goes, and what stays

**Goes:** the engine's arithmetic in `models` (effect curves, pixel patterns, pan and tilt, fans, capability positions,
the maths helpers) and the computing half of `preview.service.ts`, `preset.service.ts` and `timeline.service.ts`.

**Stays:** editing, undo, the project model and its migrations, the 3D drawing in three.js, Web Serial and Web MIDI, the
timeline's clock, the analysis of the audio file of a composition (`pixel-audio-analysis.ts`).

**The loop.** An edit changes the project, the compiler turns it into a compiled show, and on every animation frame the
wrapper asks the engine for a frame and draws the values per fixture. Live output sends the universes of the same frame.

The wrapper, call by call (the functions of `engine.wasm` start with `le_`; `tools/conformance-wasm.mjs` of the engine
is a complete host in JavaScript):

| The designer today                                                                | With the engine                                                                                                               |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A project is opened or edited                                                     | `le_compile` with its JSON; keep the index (which uuid has which number) and make an engine for the show with `le_engine_new` |
| The preview of the selected preset, its step and its scenes                       | `le_play_preview`, `le_select_preset`, `le_set_step_preview`, `le_select_scene`, with the numbers of the index                |
| The timeline of a composition, its position and its holds                         | `le_play_timeline`, `le_set_position`, `le_add_hold` and `le_set_holding`                                                     |
| `getChannelValues` for the 3D preview                                             | `le_render`, then the values of every channel of every part at `le_values_ptr`, in the order of the index                     |
| Live output                                                                       | The universes of the same frame at `le_universes_ptr`                                                                         |
| The fixtures identified, reset or lamped on from the fixture pool, the DMX faders | `le_identify`, `le_reset_fixture`, `le_lamp_on`, `le_set_override`                                                            |
| The frames of the audio analysis                                                  | `le_audio_frame` for each frame of 20 ms                                                                                      |

- **Time.** `performance.now()` is converted to whole microseconds in the wrapper and crosses as a 64-bit integer.
  JavaScript never does engine arithmetic on the numbers of a project.
- **Several engines at once.** An engine is a value: the preview, the simulator of the stick and an export each have
  their own.
- **Offline.** `engine.wasm` (0.8 MB today, not yet built for size) is one more file for the service worker to cache.

## 4. A recompile has to feel instant

An edit reaches the preview on the next animation frame. That gives the compile of a rig of 60 fixtures a budget of 10
ms (_proposed_). A project of 30–60 fixtures is 50–70 KB of JSON.

Measured natively on an Apple M6 (`cargo run --release -p lighting-engine-compiler --example bench` in the engine):
reading the JSON and compiling a rig of 60 moving heads takes 0.6 ms, a rig of 2,048 pixels 4.5 ms; a frame takes 0.04
ms and 0.43 ms. In the browser it is _to measure_. If a full compile can't meet the budget there, the compiler
recompiles only the preset that changed; an edit never waits.

## 5. The simulator of the stick

The simulator of Ember (its concept, section 10) is the same engine with the same compiled show and the feature bits the
stick has. What it shows is what the stick computes, bit for bit, with no second player to keep equal. The designer
compiles for the firmware a stick reports, or for the oldest firmware which can play the show, and names it in the
export.

## 6. What changes in the preview

The engine computes in single precision and on whole nanoseconds, where the TypeScript engine computes in doubles.

- **Values differ by at most 1** (of 255, or of 65,535 for a channel with a fine channel): all 299 `channelValues` cases
  of this repository, 3,811 frames and 209,059 values, are within that.
- **136 of those values differ more**, in five cases, each exactly on an edge where the TypeScript engine itself decides
  by the rounding of a double: a place in a palette on the border of two stepped stops, a pixel on the border of two
  columns of an image, and a leftover of 0 which doubles bring a hair below 0. They are listed in
  `conformance/DIFFERENCES.md` of the engine.

## 7. The conformance cases

Until the preview plays with the engine, the cases are recorded here and copied to Rocket Show and to the engine, as
today. The engine compares them within ±1 and publishes a digest of the bits it comes to
(`conformance/core-digests.json`), which `engine.wasm` in Node already matches.

Once the switch is on by default, the engine's repository owns the cases: the expected values are recorded from the
engine and compared exactly, and this repository's CI runs `engine.wasm` in Node against the digests.
`conformance.spec.ts`, `services/parity.spec.ts` and the cases of `PreviewService like Rocket Show plays it` go with the
TypeScript engine.

## 8. Plan

| Step          | What is built                                                                                             | Gate                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Spike      | `engine.wasm` loaded in the designer, the compile of the 60-fixture rig timed in the browser              | A compile under 10 ms, or only the changed preset is compiled |
| 2. The switch | The preview and the live output on `engine.wasm` behind a switch, compared with the TypeScript engine     | No difference beyond 1 on real projects                       |
| 3. Default    | A release with the switch on by default                                                                   | A release without differences reported                        |
| 4. Clean-up   | The TypeScript engine, its specs and the recording of the cases are deleted; the cases move to the engine |                                                               |

The designer switches before Rocket Show: the recorded values come from it, and it updates itself, so a fault is fixed
for everyone within the hour. Because it updates itself, it always carries the newest engine and compiler, and its
projects stay JSON: nothing stored in the browser or the account depends on the compiled show. From step 2 on, new
engine features land in the shared engine only.

Sources: the lighting engine (`Rocket-Show/lighting-engine`: `concept.md`, `docs/format.md`, `README.md`,
`conformance/DIFFERENCES.md`). Read on 11 November 2026.
