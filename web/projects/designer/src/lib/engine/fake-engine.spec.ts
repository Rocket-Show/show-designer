import { EngineExports, LightingEngine, ShowIndex } from './lighting-engine';

// A stand-in for engine.wasm, for the specs which don't need the real one (CI can't build it): it records the calls
// made to it, compiles any project to the show and the index it is given, and plays frames of the values it is given.
export class FakeEngine {
  calls: any[][] = [];
  buffer = new ArrayBuffer(1 << 20);

  // what le_compile comes to: its code, the show and the index (JSON), or the message
  compileCode = 0;
  show = new Uint8Array([1, 2, 3, 4]);
  index: ShowIndex = { fixtures: [], parts: [], presets: [], steps: [], scenes: [], compositions: [], universes: [] };
  message = '';
  compiled: string[] = [];

  // no engine for a show (le_engine_new returns null)
  refuseShows = false;

  // the values of a frame (NaN: no value) and its universes
  frameValues: number[] = [];
  universes: number[][] = [];

  freed: number[] = [];
  private next = 1024;
  private nextHandle = 1;
  private results: { pointer: number; length: number }[] = [];

  readonly exports: EngineExports;

  constructor() {
    const fake = this;
    const implemented: { [name: string]: (...args: any[]) => any } = {
      le_alloc: (length: number) => {
        const pointer = fake.next;
        fake.next += Math.max(8, Math.ceil(length / 8) * 8);
        return pointer;
      },
      le_free: () => undefined,
      le_features: () => 0xffffffff,
      le_behaviour_version: () => 7,
      le_compile: (pointer: number, length: number) => {
        fake.compiled.push(new TextDecoder().decode(new Uint8Array(fake.buffer, pointer, length)));
        const encoder = new TextEncoder();
        fake.results = [fake.show, encoder.encode(JSON.stringify(fake.index)), encoder.encode(fake.message)].map((bytes) => {
          const at = implemented.le_alloc(bytes.length);
          new Uint8Array(fake.buffer, at, bytes.length).set(bytes);
          return { pointer: at, length: bytes.length };
        });
        return fake.compileCode;
      },
      le_result_ptr: (kind: number) => fake.results[kind].pointer,
      le_result_len: (kind: number) => fake.results[kind].length,
      le_result_features: () => 0,
      le_engine_new: () => (fake.refuseShows ? 0 : fake.nextHandle++),
      le_engine_free: (handle: number) => fake.freed.push(handle),
      le_values_len: () => fake.frameValues.length,
      le_values_ptr: () => {
        const pointer = implemented.le_alloc(fake.frameValues.length * 4);
        new Float32Array(fake.buffer, pointer, fake.frameValues.length).set(fake.frameValues.map((value) => (isNaN(value) ? 0 : value)));
        return pointer;
      },
      le_flags_ptr: () => {
        const pointer = implemented.le_alloc(fake.frameValues.length * 4);
        new Uint32Array(fake.buffer, pointer, fake.frameValues.length).set(fake.frameValues.map((value) => (isNaN(value) ? 0 : 1)));
        return pointer;
      },
      le_universes_len: () => fake.universes.length * 512,
      le_universes_ptr: () => {
        const pointer = implemented.le_alloc(fake.universes.length * 512);
        fake.universes.forEach((universe, index) => new Uint8Array(fake.buffer, pointer + index * 512, 512).set(universe));
        return pointer;
      },
      le_audio_frame: (handle: number, index: bigint, pointer: number, count: number) =>
        fake.calls.push(['le_audio_frame', handle, Number(index), Array.from(new Float32Array(fake.buffer, pointer, count))]),
    };

    this.exports = new Proxy(
      {},
      {
        get: (target, name: string) => {
          if (name === 'memory') {
            return { buffer: fake.buffer };
          }

          if (implemented[name]) {
            return implemented[name];
          }

          return (...args: any[]) => {
            fake.calls.push([name, ...args.map((arg) => (typeof arg === 'bigint' ? Number(arg) : arg))]);
          };
        },
      }
    ) as EngineExports;
  }

  get engine(): LightingEngine {
    return new LightingEngine(this.exports);
  }

  // the calls of a name, without the name
  callsOf(name: string): any[][] {
    return this.calls.filter((call) => call[0] === name).map((call) => call.slice(1));
  }
}
