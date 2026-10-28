import { Composition } from './composition';
import { Preset } from './preset';
import { getPresetTimes, getSceneTimes } from './preset-region-scene';
import { Scene } from './scene';

// Where the lights of a composition have gone out: the end of its last clip, or of a fade
// running past the end of a clip (of its scene, or of one of the presets played in it).
// Without an audio file, the composition lasts that long. Rocket Show works it out the
// same way, to play a composition at least as long as the designer does.
export function getClipsEndMillis(
  composition: Composition,
  getScene: (uuid: string) => Scene,
  getScenePresets: (scene: Scene) => Preset[]
): number {
  let endMillis = 0;

  for (const region of composition.scenePlaybackRegions) {
    const scene = getScene(region.sceneUuid);

    // a clip without its scene is not played (and not drawn either)
    if (!scene) {
      continue;
    }

    // the scene ends with its clip, or later when it fades out past it
    endMillis = Math.max(endMillis, getSceneTimes(scene, region).endMillis);

    for (const preset of getScenePresets(scene)) {
      endMillis = Math.max(endMillis, getPresetTimes(preset, region, scene).endMillis);
    }
  }

  return endMillis;
}

// Without an audio file, the timeline reaches past the end of the composition: a scene
// dropped there makes the composition longer. It shows a minute at least.
export function getOpenTimelineMillis(endMillis: number): number {
  return Math.max(60000, endMillis + Math.max(30000, endMillis / 4));
}
