import { Composition } from './composition';
import { Preset } from './preset';
import { Scene } from './scene';
import { ScenePlaybackRegion } from './scene-playback-region';
import { getClipsEndMillis, getOpenTimelineMillis } from './timeline-length';

describe('getClipsEndMillis', () => {
  let scenes: Scene[];
  let presets: Preset[];

  beforeEach(() => {
    scenes = [];
    presets = [];
  });

  function scene(uuid: string, ...scenePresets: Preset[]): Scene {
    const newScene = new Scene();
    newScene.uuid = uuid;
    newScene.presetUuids = scenePresets.map((preset) => preset.uuid);
    scenes.push(newScene);
    presets.push(...scenePresets);

    return newScene;
  }

  function preset(uuid: string): Preset {
    const newPreset = new Preset();
    newPreset.uuid = uuid;

    return newPreset;
  }

  function composition(...regions: [string, number, number][]): Composition {
    const newComposition = new Composition();

    for (const [sceneUuid, startMillis, endMillis] of regions) {
      const region = new ScenePlaybackRegion();
      region.sceneUuid = sceneUuid;
      region.startMillis = startMillis;
      region.endMillis = endMillis;
      newComposition.scenePlaybackRegions.push(region);
    }

    return newComposition;
  }

  const endOf = (played: Composition) =>
    getClipsEndMillis(
      played,
      (uuid) => scenes.find((candidate) => candidate.uuid === uuid),
      (withPresets) => presets.filter((candidate) => withPresets.presetUuids.indexOf(candidate.uuid) >= 0)
    );

  it('is 0 without clips', () => {
    expect(endOf(composition())).toBe(0);
  });

  it('is the end of the last clip, wherever it is in the list', () => {
    scene('a', preset('p'));

    expect(endOf(composition(['a', 20000, 30000], ['a', 0, 10000]))).toBe(30000);
  });

  it('leaves a clip without its scene out', () => {
    scene('a', preset('p'));

    expect(endOf(composition(['a', 0, 10000], ['deleted', 20000, 30000]))).toBe(10000);
  });

  it('waits for the scene to fade out past the end of its clip', () => {
    const fading = scene('a', preset('p'));
    fading.fadeOutMillis = 2000;
    fading.fadeOutPost = true;

    expect(endOf(composition(['a', 0, 10000]))).toBe(12000);
  });

  it('does not wait for a fade inside the clip', () => {
    const fading = scene('a', preset('p'));
    fading.fadeOutMillis = 2000;

    expect(endOf(composition(['a', 0, 10000]))).toBe(10000);
  });

  it('waits for a preset fading out past its end', () => {
    const fading = preset('p');
    fading.fadeOutMillis = 3000;
    fading.fadeOutPost = true;
    scene('a', fading);

    expect(endOf(composition(['a', 0, 10000]))).toBe(13000);
  });

  it('waits for a preset fading out past the end of a scene fading out past its clip', () => {
    const fading = preset('p');
    fading.fadeOutMillis = 3000;
    fading.fadeOutPost = true;
    const fadingScene = scene('a', fading);
    fadingScene.fadeOutMillis = 2000;
    fadingScene.fadeOutPost = true;

    expect(endOf(composition(['a', 0, 10000]))).toBe(15000);
  });

  it('follows a preset playing longer than its clip', () => {
    const longer = preset('p');
    longer.endMillis = 15000;
    scene('a', longer);

    expect(endOf(composition(['a', 5000, 10000]))).toBe(20000);
  });
});

describe('getOpenTimelineMillis', () => {
  it('shows a minute at least', () => {
    expect(getOpenTimelineMillis(0)).toBe(60000);
    expect(getOpenTimelineMillis(20000)).toBe(60000);
  });

  it('leaves room past the end of the composition', () => {
    expect(getOpenTimelineMillis(100000)).toBe(130000);
    expect(getOpenTimelineMillis(400000)).toBe(500000);
  });
});
