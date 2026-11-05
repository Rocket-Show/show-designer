import { Preset } from './preset';
import { Scene } from './scene';
import { ScenePlaybackRegion } from './scene-playback-region';

export class PresetRegionScene {
  preset: Preset;
  region: ScenePlaybackRegion;
  scene: Scene;

  constructor(preset: Preset, region: ScenePlaybackRegion, scene: Scene) {
    this.preset = preset;
    this.region = region;
    this.scene = scene;
  }
}

// from when to when something plays on the timeline
export interface TimeSpan {
  startMillis: number;
  endMillis: number;
}

// When the scene of a clip plays: its fades may reach outside the clip
export function getSceneTimes(scene: Scene, region: ScenePlaybackRegion): TimeSpan {
  return {
    startMillis: scene && scene.fadeInPre ? region.startMillis - scene.fadeInMillis : region.startMillis,
    endMillis: scene && scene.fadeOutPost ? region.endMillis + scene.fadeOutMillis : region.endMillis,
  };
}

// When a preset played in the scene of a clip plays, its own fades outside its times
// included. A preset without times of its own plays as long as the scene does, also
// while the scene fades in or out outside the clip.
export function getPresetTimes(preset: Preset, region: ScenePlaybackRegion, scene: Scene): TimeSpan {
  const sceneTimes = getSceneTimes(scene, region);
  const startMillis =
    preset.startMillis === undefined || preset.startMillis === null ? sceneTimes.startMillis : region.startMillis + preset.startMillis;
  const endMillis =
    preset.endMillis === undefined || preset.endMillis === null ? sceneTimes.endMillis : region.startMillis + preset.endMillis;

  return {
    startMillis: startMillis - (preset.fadeInPre ? preset.fadeInMillis : 0),
    endMillis: endMillis + (preset.fadeOutPost ? preset.fadeOutMillis : 0),
  };
}
