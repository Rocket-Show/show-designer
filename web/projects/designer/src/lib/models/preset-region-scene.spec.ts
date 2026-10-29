import { Preset } from './preset';
import { getPresetTimes } from './preset-region-scene';
import { Scene } from './scene';
import { ScenePlaybackRegion } from './scene-playback-region';

describe('getPresetTimes', () => {
  // a clip from 10 s to 20 s of a scene fading in and out for 2 s outside of it
  const region = new ScenePlaybackRegion({ startMillis: 10000, endMillis: 20000 });
  const scene = new Scene({ fadeInMillis: 2000, fadeInPre: true, fadeOutMillis: 2000, fadeOutPost: true });

  it('should play a preset with times of its own at those times inside the clip', () => {
    const preset = new Preset({ startMillis: 1000, endMillis: 5000 });

    expect(getPresetTimes(preset, region, scene)).toEqual({ startMillis: 11000, endMillis: 15000 });
  });

  it('should play a preset without times of its own as long as its scene, its fades outside the clip included', () => {
    expect(getPresetTimes(new Preset({}), region, scene)).toEqual({ startMillis: 8000, endMillis: 22000 });
  });

  it('should play a preset whose times were cleared as long as its scene', () => {
    // a number field which has been emptied gives null
    const preset = new Preset({});
    preset.startMillis = null;
    preset.endMillis = null;

    expect(getPresetTimes(preset, region, scene)).toEqual({ startMillis: 8000, endMillis: 22000 });
  });
});
