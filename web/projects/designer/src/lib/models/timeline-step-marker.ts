import { Preset } from './preset';
import { getTransitionStartMillis, PresetStep } from './preset-step';
import { Scene } from './scene';
import { ScenePlaybackRegion } from './scene-playback-region';

// one step of a preset, placed inside a region the preset plays in
export interface TimelineStepMarker {
  step: PresetStep;

  // where the step is reached, and where the transition leading to it starts and how
  // far it runs, as percentages of the region's own length
  leftPercentage: number;
  transitionLeftPercentage: number;
  transitionWidthPercentage: number;
}

// Where the steps of a preset sit inside a region. The timeline draws the markers into
// the region's own element, which already follows the zooming and the scrolling, so
// they are placed in percentages of the region rather than in pixels.
export function getStepMarkers(preset: Preset, scene: Scene, scenePlaybackRegion: ScenePlaybackRegion): TimelineStepMarker[] {
  const markers: TimelineStepMarker[] = [];

  if (!preset || !scene || !scenePlaybackRegion || preset.steps.length < 2) {
    return markers;
  }

  // only the regions of the scenes this preset is layered in run its steps
  if (!scene.presetUuids || scene.presetUuids.indexOf(preset.uuid) < 0) {
    return markers;
  }

  const regionLengthMillis = scenePlaybackRegion.endMillis - scenePlaybackRegion.startMillis;

  if (regionLengthMillis <= 0) {
    return markers;
  }

  // the steps are timed against the start of the preset, which may sit inside the region
  const presetStartMillis = preset.startMillis === undefined ? 0 : preset.startMillis;
  let previousReachedMillis: number;

  for (const step of preset.steps) {
    const reachedMillis = presetStartMillis + step.startMillis;

    // the transition is placed the same way the preset itself plays it
    const transitionStartMillis = getTransitionStartMillis(step, reachedMillis, previousReachedMillis);

    markers.push({
      step,
      leftPercentage: (reachedMillis / regionLengthMillis) * 100,
      transitionLeftPercentage: (transitionStartMillis / regionLengthMillis) * 100,
      transitionWidthPercentage: ((reachedMillis - transitionStartMillis) / regionLengthMillis) * 100,
    });

    previousReachedMillis = reachedMillis;
  }

  return markers;
}
