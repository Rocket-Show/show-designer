import { TestBed } from '@angular/core/testing';
import { ConfigService } from './config.service';
import { EmberCompileCode, EmberEngineService } from './ember-engine.service';

// The compiler of the lighting engine as WebAssembly, with a stand-in for engine.wasm (a private repository, not in
// the tests): it answers le_compile as the engine does, through the same memory
describe('EmberEngineService', () => {
  let service: EmberEngineService;
  let memory: WebAssembly.Memory;
  let next: number;
  let results: Uint8Array[];
  let code: number;
  let compiledJson: string;

  function engine() {
    const put = (bytes: Uint8Array) => {
      const at = next;
      new Uint8Array(memory.buffer, at, bytes.length).set(bytes);
      next += bytes.length + 8;
      return at;
    };
    const stored: { at: number; length: number }[] = [];

    return {
      memory,
      le_alloc: (length: number) => {
        const at = next;
        next += length + 8;
        return at;
      },
      le_free: () => undefined,
      le_features: () => 0x7ff,
      le_format_version: () => 1,
      le_behaviour_version: () => 1,
      le_compile: (json: number, length: number, features: number, keepProject: number) => {
        compiledJson = new TextDecoder().decode(new Uint8Array(memory.buffer, json, length));
        expect(features).toBe(0x7ff);
        expect(keepProject).toBe(1);
        stored.length = 0;
        results.forEach((bytes) => stored.push({ at: put(bytes), length: bytes.length }));
        return code;
      },
      le_result_ptr: (kind: number) => stored[kind].at,
      le_result_len: (kind: number) => stored[kind].length,
      le_result_features: () => 0x200,
    };
  }

  beforeEach(() => {
    memory = new WebAssembly.Memory({ initial: 1 });
    next = 16;
    code = EmberCompileCode.show;
    results = [
      new Uint8Array([1, 2, 3]),
      new TextEncoder().encode('{"scenes":["red"],"compositions":[],"universes":["front"]}'),
      new TextEncoder().encode(''),
    ];

    TestBed.configureTestingModule({});
    TestBed.inject(ConfigService).emberEngineUrl = 'assets/ember/engine.wasm';
    service = TestBed.inject(EmberEngineService);
  });

  function serveEngine() {
    spyOn(window, 'fetch').and.callFake(() => Promise.resolve(new Response(new Uint8Array([0, 97, 115, 109]))));
    spyOn(WebAssembly, 'instantiate').and.callFake(() => Promise.resolve({ instance: { exports: engine() } } as any));
  }

  it('compiles a project into a show, with its index', async () => {
    serveEngine();

    const compiled = await service.compile('{"version":11}', await service.features());

    expect(compiledJson).toBe('{"version":11}');
    expect(compiled.code).toBe(EmberCompileCode.show);
    expect(Array.from(compiled.show)).toEqual([1, 2, 3]);
    expect(compiled.index.universes).toEqual(['front']);
    expect(compiled.features).toBe(0x200);
    expect(window.fetch).toHaveBeenCalledTimes(1);
  });

  it('says why there is no show', async () => {
    serveEngine();
    code = EmberCompileCode.unsupported;
    results[2] = new TextEncoder().encode('the show needs feature 11');

    const compiled = await service.compile('{"version":11}', 0x7ff);

    expect(compiled.code).toBe(EmberCompileCode.unsupported);
    expect(compiled.show).toBeUndefined();
    expect(compiled.message).toBe('the show needs feature 11');
  });

  it('tries to load the engine again after a failed load', async () => {
    spyOn(window, 'fetch').and.callFake(() => Promise.resolve(new Response('not found', { status: 404 })));

    const failed = () =>
      service.features().then(
        () => false,
        () => true
      );

    expect(await failed()).toBe(true);
    expect(await failed()).toBe(true);

    expect(window.fetch).toHaveBeenCalledTimes(2);
  });
});
