// The shared lighting engine (engine.wasm of the repository Rocket-Show/lighting-engine) behind a thin wrapper: its
// compiler turns the JSON of a project into a compiled show, its core plays a show and works out a frame. Only
// integers, single floats and byte ranges cross into the module; times are whole microseconds, 64-bit integers, which
// are BigInt on this side (see docs/lighting-engine.md).

// the module of the browser takes a 64-bit integer as a BigInt, which the library's old target doesn't name
declare const BigInt: (value: number) => bigint;

// What engine.wasm exports that the designer uses (the module imports nothing)
export interface EngineExports {
  memory: { buffer: ArrayBuffer };
  le_alloc(length: number): number;
  le_free(pointer: number, length: number): void;
  le_features(): number;
  le_behaviour_version(): number;
  le_compile(json: number, length: number, features: number, keepProject: number): number;
  le_result_ptr(kind: number): number;
  le_result_len(kind: number): number;
  le_result_features(): number;
  le_engine_new(show: number, length: number, nowMicros: bigint): number;
  le_engine_free(engine: number): void;
  le_play_timeline(engine: number, composition: number, flags: number): void;
  le_play_preview(engine: number, solo: number): void;
  le_stop(engine: number): void;
  le_select_preset(engine: number, preset: number, step: number): void;
  le_set_step_preview(engine: number, running: number, startMicros: bigint): void;
  le_select_scene(engine: number, scene: number, selected: number): void;
  le_clear_scenes(engine: number): void;
  le_set_position(engine: number, nowMicros: bigint, positionMicros: bigint, running: number): void;
  le_forget_holds(engine: number, fromPositionMicros: bigint): void;
  le_add_hold(engine: number, positionMicros: bigint, heldMicros: bigint): void;
  le_set_master_dimmer(engine: number, dimmer: number): void;
  le_identify(engine: number, fixture: number, on: number): void;
  le_reset_fixture(engine: number, fixture: number, on: number): void;
  le_lamp_on(engine: number, fixture: number, on: number): void;
  le_set_override(engine: number, universe: number, channel: number, value: number): void;
  le_clear_overrides(engine: number): void;
  le_audio_frame(engine: number, index: bigint, values: number, count: number): void;
  le_clear_audio(engine: number): void;
  le_render(engine: number, nowMicros: bigint): void;
  le_universes_ptr(engine: number): number;
  le_universes_len(engine: number): number;
  le_values_ptr(engine: number): number;
  le_flags_ptr(engine: number): number;
  le_values_len(engine: number): number;
}

// a part of a fixture in a compiled show: the fixture (its number in ShowIndex.fixtures), the pixel it is, if it is
// one, and the names of its channels, in the order of its values
export interface ShowPart {
  fixture: number;
  pixelKey: string;
  channels: string[];
}

// which uuid of a project has which number in its compiled show
export interface ShowIndex {
  fixtures: string[];
  parts: ShowPart[];
  presets: string[];
  // the steps of each preset
  steps: string[][];
  scenes: string[];
  compositions: { uuid: string; name: string }[];
  universes: string[];
}

export const CompileCode = { show: 0, unreadable: 1, unsupported: 2, tooLarge: 3 };

// What the compiler made of a project: a show, or why there is none
export interface Compiled {
  // see CompileCode
  code: number;
  show?: Uint8Array;
  index?: ShowIndex;
  // the warnings of a show, or why there is none
  message: string;
}

// the number of values of a frame of an audio analysis (see AudioFrames)
export const AUDIO_FRAME_VALUES = 21;

export function micros(millis: number): bigint {
  return BigInt(Math.round(millis * 1000));
}

// the earliest position there is: forgetting the holds from there on forgets all of them
const allPositions = BigInt(-Math.pow(2, 53));

// A compiled show playing in the engine, with what it plays set from outside. Free it when it is done with.
export class EngineShow {
  // where the values of each part start among the values of a frame
  readonly valueBases: number[] = [];

  constructor(private engine: EngineExports, private handle: number, public readonly index: ShowIndex) {
    let base = 0;

    for (const part of index.parts) {
      this.valueBases.push(base);
      base += part.channels.length;
    }
  }

  get freed(): boolean {
    return !this.handle;
  }

  // play the timeline of a composition (its number in the index), as the designer previews it
  playTimeline(composition: number) {
    this.engine.le_play_timeline(this.handle, composition, 0);
  }

  // preview the selected preset alone (solo, or while no scene is selected), or else the selected scenes
  playPreview(solo: boolean) {
    this.engine.le_play_preview(this.handle, solo ? 1 : 0);
  }

  stop() {
    this.engine.le_stop(this.handle);
  }

  // the preset being edited and its step being edited (-1: none), with its steps running from a moment on, or not
  selectPreset(preset: number, step: number, stepsRunningFromMillis?: number) {
    this.engine.le_select_preset(this.handle, preset, step);
    const running = stepsRunningFromMillis !== undefined;
    this.engine.le_set_step_preview(this.handle, running ? 1 : 0, micros(running ? stepsRunningFromMillis : 0));
  }

  selectScenes(scenes: number[]) {
    this.engine.le_clear_scenes(this.handle);

    for (const scene of scenes) {
      this.engine.le_select_scene(this.handle, scene, 1);
    }
  }

  // the hold points the timeline went through, with the time held at each
  setHolds(holds: { positionMillis: number; heldMillis: number }[]) {
    this.engine.le_forget_holds(this.handle, allPositions);

    for (const hold of holds) {
      this.engine.le_add_hold(this.handle, micros(hold.positionMillis), micros(hold.heldMillis));
    }
  }

  setMasterDimmer(dimmer: number) {
    this.engine.le_set_master_dimmer(this.handle, dimmer);
  }

  // whether a fixture (its number) is identified, asked to reset itself or to switch its lamp on
  markFixture(fixture: number, identify: boolean, reset: boolean, lampOn: boolean) {
    this.engine.le_identify(this.handle, fixture, identify ? 1 : 0);
    this.engine.le_reset_fixture(this.handle, fixture, reset ? 1 : 0);
    this.engine.le_lamp_on(this.handle, fixture, lampOn ? 1 : 0);
  }

  // the DMX channels (of a universe by its number, from 0) held at a value by a fader
  setOverrides(overrides: { universe: number; dmxChannel: number; value: number }[]) {
    this.engine.le_clear_overrides(this.handle);

    for (const dmxOverride of overrides) {
      this.engine.le_set_override(
        this.handle,
        dmxOverride.universe,
        dmxOverride.dmxChannel,
        Math.max(0, Math.min(255, Math.round(dmxOverride.value)))
      );
    }
  }

  clearAudio() {
    this.engine.le_clear_audio(this.handle);
  }

  // a frame of an audio analysis by its number (each covers 20 ms of the position)
  audioFrame(index: number, values: number[]) {
    const count = Math.min(values.length, AUDIO_FRAME_VALUES);
    const pointer = this.engine.le_alloc(count * 4);

    try {
      new Float32Array(this.engine.memory.buffer, pointer, count).set(values.slice(0, count));
      this.engine.le_audio_frame(this.handle, BigInt(index), pointer, count);
    } finally {
      this.engine.le_free(pointer, count * 4);
    }
  }

  // Work out the frame at a position of the timeline (or of the clock of the preview), standing there
  render(positionMillis: number) {
    const position = micros(positionMillis);
    const now = micros(Math.max(positionMillis, 0));
    this.engine.le_set_position(this.handle, now, position, 0);
    this.engine.le_render(this.handle, now);
  }

  // the values of the last frame: a single float for each channel of each part (see valueBases), and whether each has
  // a value at all (bit 0 of its flags). Views into the memory of the engine, valid until the next call.
  values(): { values: Float32Array; flags: Uint32Array } {
    const count = this.engine.le_values_len(this.handle);

    return {
      values: new Float32Array(this.engine.memory.buffer, this.engine.le_values_ptr(this.handle), count),
      flags: new Uint32Array(this.engine.memory.buffer, this.engine.le_flags_ptr(this.handle), count),
    };
  }

  // the 512 values of a universe (its number) of the last frame, a copy; undefined for a universe the show hasn't
  universe(universe: number): Uint8Array {
    const length = this.engine.le_universes_len(this.handle);

    if (universe < 0 || universe * 512 + 512 > length) {
      return undefined;
    }

    return new Uint8Array(this.engine.memory.buffer, this.engine.le_universes_ptr(this.handle) + universe * 512, 512).slice();
  }

  free() {
    if (this.handle) {
      this.engine.le_engine_free(this.handle);
      this.handle = 0;
    }
  }
}

// The engine loaded: its compiler and a show played by it
export class LightingEngine {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  constructor(public readonly exports: EngineExports) {}

  // the feature bits this engine plays
  get features(): number {
    return this.exports.le_features() >>> 0;
  }

  // counts up with every change of the engine which changes the values it comes to
  get behaviourVersion(): number {
    return this.exports.le_behaviour_version() >>> 0;
  }

  private put(bytes: Uint8Array): number {
    const pointer = this.exports.le_alloc(bytes.length);
    new Uint8Array(this.exports.memory.buffer, pointer, bytes.length).set(bytes);
    return pointer;
  }

  // Compile the JSON of a project of the current version for this engine
  compile(projectJson: string): Compiled {
    const json = this.encoder.encode(projectJson);
    const pointer = this.put(json);
    let code: number;

    try {
      code = this.exports.le_compile(pointer, json.length, this.features, 0);
    } finally {
      this.exports.le_free(pointer, json.length);
    }

    // (the memory may have grown while compiling: read it afresh)
    const result = (kind: number) =>
      new Uint8Array(this.exports.memory.buffer, this.exports.le_result_ptr(kind), this.exports.le_result_len(kind)).slice();
    const compiled: Compiled = { code, message: this.decoder.decode(result(2)) };

    if (code === CompileCode.show) {
      compiled.show = result(0);
      compiled.index = JSON.parse(this.decoder.decode(result(1)));
    }

    return compiled;
  }

  // Play a compiled show. Undefined for a show the engine doesn't take.
  play(show: Uint8Array, index: ShowIndex, nowMillis: number): EngineShow {
    const pointer = this.put(show);
    let handle: number;

    try {
      handle = this.exports.le_engine_new(pointer, show.length, micros(Math.max(nowMillis, 0)));
    } finally {
      this.exports.le_free(pointer, show.length);
    }

    return handle ? new EngineShow(this.exports, handle, index) : undefined;
  }
}

// Load engine.wasm from an address. Rejects if it is not there (it is not part of the library, see web/engine).
export function loadLightingEngine(
  url: string,
  fetcher: (url: string) => Promise<Response> = (address) => fetch(address)
): Promise<LightingEngine> {
  return fetcher(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error('engine.wasm could not be loaded from ' + url + ' (' + response.status + ')');
      }

      return response.arrayBuffer();
    })
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((module) => new LightingEngine(module.instance.exports as unknown as EngineExports));
}
