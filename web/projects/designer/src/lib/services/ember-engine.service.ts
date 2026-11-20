import { Injectable } from '@angular/core';
import { ConfigService } from './config.service';

// what engine.wasm of the lighting engine exports that the designer uses (the module imports nothing)
interface EngineExports {
  memory: WebAssembly.Memory;
  le_alloc(length: number): number;
  le_free(pointer: number, length: number): void;
  le_features(): number;
  le_format_version(): number;
  le_behaviour_version(): number;
  le_compile(json: number, length: number, features: number, keepProject: number): number;
  le_result_ptr(kind: number): number;
  le_result_len(kind: number): number;
  le_result_features(): number;
}

// What the compiler made of a project: a show, or why there is none
export interface EmberCompiled {
  // 0 a show, 1 a project which can't be read, 2 a show needing features the stick lacks, 3 a show too large
  code: number;
  show?: Uint8Array;
  // which uuid has which number in the show (scenes, compositions, universes)
  index?: { scenes: string[]; compositions: { uuid: string; name: string }[]; universes: string[] };
  // the warnings of a show, or why there is none
  message: string;
  // the feature bits the show needs, or the ones missing (code 2)
  features: number;
}

export const EmberCompileCode = { show: 0, unreadable: 1, unsupported: 2, tooLarge: 3 };

// The compiler of the lighting engine, as WebAssembly: it makes the show a stick plays from a project, the same way as
// the stick's own tools. Loaded once, when it is first needed, from where the host application keeps engine.wasm
// (ConfigService.emberEngineUrl).
@Injectable({
  providedIn: 'root',
})
export class EmberEngineService {
  private engine: Promise<EngineExports>;

  constructor(private configService: ConfigService) {}

  private load(): Promise<EngineExports> {
    if (!this.engine) {
      const url = this.configService.emberEngineUrl;

      this.engine = fetch(url)
        .then((response) => {
          if (!response.ok) {
            throw new Error('The lighting engine could not be loaded from ' + url + ' (' + response.status + ')');
          }

          return response.arrayBuffer();
        })
        .then((bytes) => WebAssembly.instantiate(bytes, {}))
        .then((module) => module.instance.exports as unknown as EngineExports);

      // try again the next time, after a failed load
      this.engine.catch(() => (this.engine = undefined));
    }

    return this.engine;
  }

  // the feature bits the engine knows: what a show file for any stick may use
  async features(): Promise<number> {
    return (await this.load()).le_features() >>> 0;
  }

  // Compile the JSON of a project (of the current version) for a stick which plays the passed feature bits. The show
  // carries the project, so a designer can open it from the stick.
  async compile(projectJson: string, features: number): Promise<EmberCompiled> {
    const engine = await this.load();
    const json = new TextEncoder().encode(projectJson);
    const pointer = engine.le_alloc(json.length);
    new Uint8Array(engine.memory.buffer, pointer, json.length).set(json);

    let code: number;

    try {
      code = engine.le_compile(pointer, json.length, features >>> 0, 1);
    } finally {
      engine.le_free(pointer, json.length);
    }

    // (the memory may have grown while compiling: read it afresh)
    const result = (kind: number) => new Uint8Array(engine.memory.buffer, engine.le_result_ptr(kind), engine.le_result_len(kind)).slice();
    const message = new TextDecoder().decode(result(2));
    const compiled: EmberCompiled = { code, message, features: engine.le_result_features() >>> 0 };

    if (code === EmberCompileCode.show) {
      compiled.show = result(0);
      compiled.index = JSON.parse(new TextDecoder().decode(result(1)));
    }

    return compiled;
  }
}
