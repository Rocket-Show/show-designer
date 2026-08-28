import { inject, TestBed } from '@angular/core/testing';

import { Preset } from '../models/preset';
import { PresetRegionScene } from '../models/preset-region-scene';
import { Scene } from '../models/scene';
import { ScenePlaybackRegion } from '../models/scene-playback-region';
import { PreviewService } from './preview.service';

describe('PreviewService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PreviewService],
    });
  });

  it('should be created', inject([PreviewService], (service: PreviewService) => {
    expect(service).toBeTruthy();
  }));
});

// how much of what a preset puts out reaches the stage. These mirror the cases of
// DesignerSceneDimmerTest in Rocket Show: a show has to look the same on stage as it
// did while it was written, so both sides run the same ones.
describe('PreviewService preset intensity', () => {
  let service: PreviewService;

  beforeEach(() => {
    // the intensity is worked out from the passed preset alone, so the service is built
    // without its dependencies rather than dragging the whole designer into the spec
    service = new PreviewService(undefined, undefined, undefined, undefined, undefined, undefined);
  });

  function scene(dimmer: number): Scene {
    const sceneWithDimmer = new Scene();
    sceneWithDimmer.dimmer = dimmer;

    return sceneWithDimmer;
  }

  function region(startMillis: number, endMillis: number): ScenePlaybackRegion {
    const playbackRegion = new ScenePlaybackRegion();
    playbackRegion.startMillis = startMillis;
    playbackRegion.endMillis = endMillis;

    return playbackRegion;
  }

  function intensity(preset: PresetRegionScene, timeMillis: number): number {
    return service['getPresetIntensity'](preset, timeMillis);
  }

  it('should let a scene at full through', () => {
    const playing = new PresetRegionScene(new Preset(), region(0, 10000), scene(1));

    expect(intensity(playing, 5000)).toBe(1);
  });

  it('should scale a scene on the timeline by its dimmer', () => {
    const playing = new PresetRegionScene(new Preset(), region(0, 10000), scene(0.25));

    expect(intensity(playing, 5000)).toBe(0.25);
  });

  it('should scale a scene by its dimmer while it is only being watched', () => {
    // a selected scene is previewed without a region: the dimmer still holds it down
    const previewed = new PresetRegionScene(new Preset(), undefined, scene(0.5));

    expect(intensity(previewed, 5000)).toBe(0.5);
  });

  it('should leave a preset played on its own alone', () => {
    const solo = new PresetRegionScene(new Preset(), undefined, undefined);

    expect(intensity(solo, 5000)).toBe(1);
  });

  it('should take the scene fade out of what the dimmer leaves', () => {
    const dimmed = scene(0.5);
    dimmed.fadeInMillis = 1000;
    const playing = new PresetRegionScene(new Preset(), region(0, 10000), dimmed);

    // half way into the fade, half of the half the dimmer leaves is through
    expect(intensity(playing, 500)).toBeCloseTo(0.25, 10);
    // and the dimmer alone holds it once the fade is over
    expect(intensity(playing, 5000)).toBe(0.5);
  });

  it('should take the scene fade out over the whole fade, not only its end', () => {
    const dimmed = scene(0.5);
    dimmed.fadeOutMillis = 1000;
    const playing = new PresetRegionScene(new Preset(), region(0, 10000), dimmed);

    expect(intensity(playing, 9500)).toBeCloseTo(0.25, 10);
  });

  it('should combine the scene dimmer with a preset fade', () => {
    const preset = new Preset();
    preset.fadeInMillis = 1000;
    const playing = new PresetRegionScene(preset, region(0, 10000), scene(0.5));

    expect(intensity(playing, 500)).toBeCloseTo(0.25, 10);
  });

  it('should shut a scene off at a dimmer of zero', () => {
    const playing = new PresetRegionScene(new Preset(), region(0, 10000), scene(0));

    expect(intensity(playing, 5000)).toBe(0);
  });
});
