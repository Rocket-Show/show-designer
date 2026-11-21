import { FakeEngine } from './fake-engine.spec';
import { CompileCode, loadLightingEngine, micros } from './lighting-engine';

describe('LightingEngine', () => {
  let fake: FakeEngine;

  beforeEach(() => {
    fake = new FakeEngine();
  });

  it('hands the JSON of a project to the compiler and reads the show and the index it made of it', () => {
    fake.index.fixtures = ['a'];
    fake.message = 'a warning';

    const compiled = fake.engine.compile('{"name":"Ünïcode"}');

    expect(fake.compiled).toEqual(['{"name":"Ünïcode"}']);
    expect(compiled.code).toBe(CompileCode.show);
    expect(Array.from(compiled.show)).toEqual([1, 2, 3, 4]);
    expect(compiled.index.fixtures).toEqual(['a']);
    expect(compiled.message).toBe('a warning');
  });

  it('says why there is no show', () => {
    fake.compileCode = CompileCode.unreadable;
    fake.message = 'no fixtures';

    const compiled = fake.engine.compile('{}');

    expect(compiled.code).toBe(CompileCode.unreadable);
    expect(compiled.show).toBeUndefined();
    expect(compiled.index).toBeUndefined();
    expect(compiled.message).toBe('no fixtures');
  });

  it('tells its features and the version of its behaviour', () => {
    expect(fake.engine.features).toBe(0xffffffff);
    expect(fake.engine.behaviourVersion).toBe(7);
  });

  it('plays a show, or none it does not take', () => {
    const index = { fixtures: [], parts: [], presets: [], steps: [], scenes: [], compositions: [], universes: [] };

    expect(fake.engine.play(new Uint8Array([1]), index, -5)).toBeDefined();
    fake.refuseShows = true;
    expect(fake.engine.play(new Uint8Array([1]), index, 0)).toBeUndefined();
  });

  it('turns milliseconds into whole microseconds', () => {
    expect(Number(micros(1.0004))).toBe(1000);
    expect(Number(micros(-2.5))).toBe(-2500);
  });

  describe('EngineShow', () => {
    const index = {
      fixtures: ['par', 'bar'],
      parts: [
        { fixture: 0, pixelKey: null, channels: ['Dimmer', 'Red'] },
        { fixture: 1, pixelKey: '1', channels: ['Red'] },
      ],
      presets: [],
      steps: [],
      scenes: [],
      compositions: [],
      universes: ['u'],
    };

    it('knows where the values of each part start', () => {
      const show = fake.engine.play(new Uint8Array([1]), index, 0);

      expect(show.valueBases).toEqual([0, 2]);
    });

    it('passes what plays to the engine', () => {
      const show = fake.engine.play(new Uint8Array([1]), index, 0);

      show.playTimeline(2);
      show.playPreview(true);
      show.playPreview(false);
      show.stop();
      show.selectPreset(1, 0);
      show.selectPreset(1, -1, 250);
      show.selectScenes([0, 3]);
      show.setHolds([{ positionMillis: 1000, heldMillis: 500 }]);
      show.setMasterDimmer(0.5);
      show.markFixture(1, true, false, true);
      show.setOverrides([{ universe: 0, dmxChannel: 3, value: 300.4 }]);
      show.clearAudio();

      expect(fake.callsOf('le_play_timeline')).toEqual([[1, 2, 0]]);
      expect(fake.callsOf('le_play_preview')).toEqual([
        [1, 1],
        [1, 0],
      ]);
      expect(fake.callsOf('le_stop')).toEqual([[1]]);
      expect(fake.callsOf('le_select_preset')).toEqual([
        [1, 1, 0],
        [1, 1, -1],
      ]);
      expect(fake.callsOf('le_set_step_preview')).toEqual([
        [1, 0, 0],
        [1, 1, 250000],
      ]);
      expect(fake.callsOf('le_clear_scenes')).toEqual([[1]]);
      expect(fake.callsOf('le_select_scene')).toEqual([
        [1, 0, 1],
        [1, 3, 1],
      ]);
      expect(fake.callsOf('le_forget_holds')).toEqual([[1, -Math.pow(2, 53)]]);
      expect(fake.callsOf('le_add_hold')).toEqual([[1, 1000000, 500000]]);
      expect(fake.callsOf('le_set_master_dimmer')).toEqual([[1, 0.5]]);
      expect(fake.callsOf('le_identify')).toEqual([[1, 1, 1]]);
      expect(fake.callsOf('le_reset_fixture')).toEqual([[1, 1, 0]]);
      expect(fake.callsOf('le_lamp_on')).toEqual([[1, 1, 1]]);
      expect(fake.callsOf('le_clear_overrides')).toEqual([[1]]);
      expect(fake.callsOf('le_set_override')).toEqual([[1, 0, 3, 255]]);
      expect(fake.callsOf('le_clear_audio')).toEqual([[1]]);
    });

    it('hands over a frame of audio of at most 21 values', () => {
      const show = fake.engine.play(new Uint8Array([1]), index, 0);
      const values = [];

      for (let value = 0; value < 25; value++) {
        values.push(-value);
      }

      show.audioFrame(12, values);

      expect(fake.callsOf('le_audio_frame')).toEqual([[1, 12, values.slice(0, 21)]]);
    });

    it('works out a frame standing at a position, never before the start of the clock', () => {
      const show = fake.engine.play(new Uint8Array([1]), index, 0);

      show.render(1500);
      show.render(-200);

      expect(fake.callsOf('le_set_position')).toEqual([
        [1, 1500000, 1500000, 0],
        [1, 0, -200000, 0],
      ]);
      expect(fake.callsOf('le_render')).toEqual([
        [1, 1500000],
        [1, 0],
      ]);
    });

    it('reads the values and the universes of a frame', () => {
      const show = fake.engine.play(new Uint8Array([1]), index, 0);
      const universe = new Array(512).fill(0);
      universe[3] = 200;
      fake.frameValues = [255, NaN, 0.5];
      fake.universes = [universe];

      const { values, flags } = show.values();

      expect(Array.from(values)).toEqual([255, 0, 0.5]);
      expect(Array.from(flags)).toEqual([1, 0, 1]);
      expect(show.universe(0)[3]).toBe(200);
      expect(show.universe(1)).toBeUndefined();
      expect(show.universe(-1)).toBeUndefined();
    });

    it('is freed once', () => {
      const show = fake.engine.play(new Uint8Array([1]), index, 0);

      expect(show.freed).toBe(false);
      show.free();
      show.free();
      expect(show.freed).toBe(true);
      expect(fake.freed).toEqual([1]);
    });
  });

  describe('loadLightingEngine', () => {
    // the smallest module there is: no imports, no exports
    const emptyModule = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

    it('loads the module from an address', async () => {
      const urls: string[] = [];
      const engine = await loadLightingEngine('assets/engine/engine.wasm', (url) => {
        urls.push(url);
        return Promise.resolve(new Response(emptyModule, { status: 200 }));
      });

      expect(urls).toEqual(['assets/engine/engine.wasm']);
      expect(engine.exports).toBeDefined();
    });

    it('fails without the module', async () => {
      let error: Error;

      try {
        await loadLightingEngine('missing.wasm', () => Promise.resolve(new Response('', { status: 404 })));
      } catch (caught) {
        error = caught;
      }

      expect(error.message).toContain('missing.wasm (404)');
    });

    it('fetches the module by default', async () => {
      spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(emptyModule, { status: 200 })));

      await loadLightingEngine('engine.wasm');

      expect(window.fetch).toHaveBeenCalledWith('engine.wasm');
    });
  });
});
