import { Preset } from './preset';
import { getStepsLoopMillis, getTransitionEndMillis, PresetStep } from './preset-step';
import { getStepLengths, getStepsOrderIndices, isStepsOrdered } from './preset-steps-order';
import { Scene } from './scene';
import { ScenePlaybackRegion } from './scene-playback-region';

// one step of a preset, placed inside a region the preset plays in
export interface TimelineStepMarker {
  step: PresetStep;

  // where the step starts and how far the transition it opens with runs from there, as
  // percentages of the region's own length
  leftPercentage: number;
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
  const steps = preset.steps;

  if (isStepsOrdered(preset)) {
    return getOrderedStepMarkers(preset, presetStartMillis, regionLengthMillis);
  }

  // the last step holds for as long as a pass of the sequence would have given it
  const lastEndMillis = steps[0].startMillis + getStepsLoopMillis(steps, preset.stepsLoopMillis);

  steps.forEach((step, index) => {
    const startMillis = presetStartMillis + step.startMillis;
    const endMillis = presetStartMillis + (index < steps.length - 1 ? steps[index + 1].startMillis : lastEndMillis);

    // The transition is placed the same way the preset itself plays it: at the start of
    // the step it travels into. Only a looping preset travels into its first step.
    const transitionEndMillis = index > 0 || preset.stepsLoop ? getTransitionEndMillis(step, startMillis, endMillis) : startMillis;

    markers.push({
      step,
      leftPercentage: (startMillis / regionLengthMillis) * 100,
      transitionWidthPercentage: ((transitionEndMillis - startMillis) / regionLengthMillis) * 100,
    });
  });

  return markers;
}

// The markers of the first pass of a preset playing its steps in another order than they are written down in: each
// step as long as it lasts written down, one after the other in the order they are played in (see preset-steps-order).
function getOrderedStepMarkers(preset: Preset, presetStartMillis: number, regionLengthMillis: number): TimelineStepMarker[] {
  const lengths = getStepLengths(preset);
  let startMillis = presetStartMillis + preset.steps[0].startMillis;

  return getStepsOrderIndices(preset).map((index, position) => {
    const step = preset.steps[index];
    const endMillis = startMillis + lengths[index];

    // only a looping preset travels into the step it opens with
    const transitionEndMillis = position > 0 || preset.stepsLoop ? getTransitionEndMillis(step, startMillis, endMillis) : startMillis;

    const marker = {
      step,
      leftPercentage: (startMillis / regionLengthMillis) * 100,
      transitionWidthPercentage: ((transitionEndMillis - startMillis) / regionLengthMillis) * 100,
    };

    startMillis = endMillis;

    return marker;
  });
}
