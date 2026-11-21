# The shared lighting engine in the designer

The preview of the designer computes every channel of every fixture with an engine of its own, in TypeScript
(`web/projects/designer`), which is kept equal to the Java engine of Rocket Show by hand. Both are to be replaced by one
engine written once, in Rust, in the repository `Rocket-Show/lighting-engine`. This document says how the designer uses
it. How the engine itself works (its core, its compiler, the compiled show, the boundary of `engine.wasm`) is in that
repository: `concept.md`, `docs/format.md` and `README.md`.

Status: steps 1 and 2 built and online, 21 November 2026: the preview and the DMX channels play with `engine.wasm`
behind a switch which is off by default (`?engine=shared` in the online app). Steps 3 and 4 are decisions of a release.
The engine is the revision `9801adf` of `Rocket-Show/lighting-engine` (its `main`), unchanged.

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

## 3a. What is built

| Part                                               | What it does                                                                                                                                                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/lighting-engine.ts`                        | The wrapper: loads `engine.wasm`, compiles a project, makes an engine for a show and passes it what plays, the holds, the identified fixtures, the faders, the master dimmer and the audio; reads the values and the universes of a frame |
| `services/engine-preview.service.ts`               | Keeps the compiled show equal to the project and plays the frames of the preview with it; compares it with the TypeScript engine                                                                                                          |
| `PreviewService.getChannelValues`                  | Asks the engine first while the switch is on, the TypeScript engine (`getTypeScriptChannelValues`) otherwise                                                                                                                              |
| `DmxService.getUniverseValues`                     | Sends the universes the engine worked out in the same frame                                                                                                                                                                               |
| The switch                                         | The input `sharedEngine` of `lib-designer` (`ConfigService.sharedEngine`, off), with `engineUrl` (default `assets/engine/engine.wasm`); the online app turns it on with `?engine=shared`                                                  |
| The comparison                                     | While the engine plays, a button of the preview compares it with the TypeScript engine over the next 50 frames (2 s): every value of every part and every DMX channel; the differences beyond 1 go to the console                         |
| `web/engine/build.sh`                              | Builds `engine.wasm` from the engine at the pinned revision into `web/engine/`, which git ignores. The dev server and the production build of the app serve it, the library leaves it out                                                 |
| `engine-conformance.spec.ts`, `e2e/engine.spec.ts` | Play the cases and the app with the real `engine.wasm`; skipped without it, so on CI, which can't build it                                                                                                                                |

The project is compiled again on the frame after it changed: each frame compares its JSON without the profiles and
without what only says what is previewed (the selection, the identified fixtures, the faders, the holds, the master
dimmer) with the one it was compiled from, and the list of profiles by its identity and length. That costs a
serialization of the project per frame, which for the rigs below is a fraction of the frame. What is previewed is
passed to the engine with every frame; the master dimmer is the engine's dimmer of the host, so moving it compiles
nothing. Old projects are migrated in TypeScript when they are opened, as before.

Where the engine can't play, the TypeScript engine does, frame by frame: a project the compiler refuses (the reason goes
to the console once), a composition the show doesn't have, and a scene of the AI looks, which isn't in the project. The
step list of the preset being edited still learns from the TypeScript engine which step runs (`updateActiveStep`, a
few lines of step arithmetic per frame).

What the implementation decided differently from the table above:

- **Time.** Each frame sets the position and renders at the same moment (`le_set_position(t, t, stand)`,
  `le_render(t)`), as the cases are played: the designer keeps its clock and the engine follows it, like the TypeScript
  engine did.
- **Audio.** The engine takes one stream of audio frames: the designer hands it the audio of all buses of the
  composition playing (and the beat it shows while none plays). An effect following some buses only follows all of
  them with the engine. The README of the engine names adding the buses as the host's part; the boundary has no way
  for it yet.
- **Holds.** The holds are passed again with every frame (`le_forget_holds`, `le_add_hold`); `le_set_holding` is not
  needed, the time held grows in the designer.

## 4. A recompile has to feel instant

An edit reaches the preview on the next animation frame. That gives the compile of a rig of 60 fixtures a budget of 10
ms (_proposed_). A project of 30–60 fixtures is 50–70 KB of JSON.

Measured natively on an Apple M6 (`cargo run --release -p lighting-engine-compiler --example bench` in the engine):
reading the JSON and compiling a rig of 60 moving heads takes 0.6 ms, a rig of 2,048 pixels 4.5 ms; a frame takes 0.04
ms and 0.43 ms.

Measured in the browser on the same Mac, Chrome 157, headless and with a window, by `engine-conformance.spec.ts` (the
rigs of the engine's benchmark; a compile is the mean of 50, an edit the mean of 30):

| Rig              | Project | Compile      | An edit to the preview | A frame      | A frame of the TypeScript engine |
| ---------------- | ------: | ------------ | ---------------------- | ------------ | -------------------------------- |
| 30 moving heads  |   18 KB | 0.42–0.58 ms | 0.63–0.71 ms           | 0.05–0.07 ms | 0.24–0.30 ms                     |
| 60 moving heads  |   24 KB | 0.76–0.87 ms | 1.0–1.8 ms             | 0.10–0.13 ms | 0.66–0.80 ms                     |
| 2,048 RGB pixels |  194 KB | 7.4–9.8 ms   | 9.8–15 ms              | 1.0–1.4 ms   | 1.9–4.3 ms                       |

"An edit to the preview" is what the designer pays on the frame after an edit: the project serialized, compiled, an
engine made for the show and the frame played. Loading `engine.wasm` takes 7.5 ms; the first compile on a module
loaded afresh takes 1.6 ms (in Node, before the module is optimized, 7.9 ms).

**The gate is met:** the rig of 60 fixtures compiles in under 1 ms, a tenth of the budget, so the whole project is
compiled again and nothing compiles a preset on its own. The rig of 2,048 pixels is at the budget; a project that size
is a reason to look at it again, not yet one to compile in parts. The engine works a frame out in a sixth (heads) to a
half (pixels) of the time of the TypeScript engine. Safari and Firefox are not measured.

## 5. The simulator of the stick

The simulator of Ember (its concept, section 10) is the same engine with the same compiled show and the feature bits the
stick has. What it shows is what the stick computes, bit for bit, with no second player to keep equal. The designer
compiles for the firmware a stick reports, or for the oldest firmware which can play the show, and names it in the
export.

## 6. What changes in the preview

The engine computes in single precision and on whole nanoseconds, where the TypeScript engine computes in doubles.

- **Values differ by at most 1** (of 255, or of 65,535 for a channel with a fine channel): all 299 `channelValues` cases
  of this repository, 3,811 frames and 209,059 values, are within that. Played the way the designer plays its preview
  (through `PreviewService.getChannelValues` with the switch on, `engine-conformance.spec.ts`), they are within that as
  well, and so are the universes sent, compared with the TypeScript engine as it plays the same frames (about 4.7
  million values and DMX channels; the five cases of `DIFFERENCES.md` are left out of that comparison). The largest
  difference outside the pixel effects is 0.005.
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

| Step          | What is built                                                                                             | Gate                                                          | Where it stands                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Spike      | `engine.wasm` loaded in the designer, the compile of the 60-fixture rig timed in the browser              | A compile under 10 ms, or only the changed preset is compiled | Done: 0.8 ms (section 4)                                                                                                                              |
| 2. The switch | The preview and the live output on `engine.wasm` behind a switch, compared with the TypeScript engine     | No difference beyond 1 on real projects                       | Built, off by default. No difference beyond 1 in the cases but the 136 known ones, nor on the template of Rocket Show; few real projects compared yet |
| 3. Default    | A release with the switch on by default                                                                   | A release without differences reported                        | Open: needs `engine.wasm` shipped with the designer, which waits for the licence of the engine                                                        |
| 4. Clean-up   | The TypeScript engine, its specs and the recording of the cases are deleted; the cases move to the engine |                                                               | Open                                                                                                                                                  |

The designer switches before Rocket Show: the recorded values come from it, and it updates itself, so a fault is fixed
for everyone within the hour. Because it updates itself, it always carries the newest engine and compiler, and its
projects stay JSON: nothing stored in the browser or the account depends on the compiled show. From step 2 on, new
engine features land in the shared engine only.

**Shipping `engine.wasm`.** The engine is open source since 21 November 2026
([Rocket-Show/lighting-engine](https://github.com/Rocket-Show/lighting-engine), GPL-3.0-or-later, like the designer).
The binary isn't committed: `web/engine/build.sh` builds it (from a checkout of the engine next to this repository, or
else cloned from GitHub), and the production build of the app serves it at `assets/engine/engine.wasm`, which is only
fetched with the switch on. The library leaves it out: a host serves one and passes `engineUrl`.

Sources: the lighting engine (`Rocket-Show/lighting-engine`: `concept.md`, `docs/format.md`, `README.md`,
`conformance/DIFFERENCES.md`). Read on 11 November 2026, the revisions `ed1768c`, `5f84480` and `9801adf` again on 21 November 2026.
