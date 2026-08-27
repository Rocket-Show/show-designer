import { Preset } from './preset';
import { PresetStep } from './preset-step';
import { Scene } from './scene';
import { ScenePlaybackRegion } from './scene-playback-region';
import { getStepMarkers } from './timeline-step-marker';

describe('getStepMarkers', () => {
  function step(startMillis: number, transitionMillis: number = 0): PresetStep {
    const presetStep = new PresetStep();
    presetStep.uuid = 'step-' + startMillis;
    presetStep.startMillis = startMillis;
    presetStep.transitionMillis = transitionMillis;

    return presetStep;
  }

  function preset(...steps: PresetStep[]): Preset {
    const presetWithSteps = new Preset();
    presetWithSteps.uuid = 'preset';
    presetWithSteps.steps = steps;

    return presetWithSteps;
  }

  function scene(...presetUuids: string[]): Scene {
    const sceneWithPresets = new Scene();
    sceneWithPresets.presetUuids = presetUuids;

    return sceneWithPresets;
  }

  function region(startMillis: number, endMillis: number): ScenePlaybackRegion {
    const playbackRegion = new ScenePlaybackRegion();
    playbackRegion.startMillis = startMillis;
    playbackRegion.endMillis = endMillis;

    return playbackRegion;
  }

  it('should place a step where it is reached inside the region', () => {
    const markers = getStepMarkers(preset(step(0), step(2500)), scene('preset'), region(1000, 11000));

    expect(markers.length).toBe(2);
    expect(markers[0].leftPercentage).toBe(0);
    expect(markers[1].leftPercentage).toBe(25);
  });

  it('should place the steps against the start of the preset inside the region', () => {
    const sequence = preset(step(0), step(2500));
    sequence.startMillis = 2000;

    const markers = getStepMarkers(sequence, scene('preset'), region(1000, 11000));

    expect(markers[0].leftPercentage).toBe(20);
    expect(markers[1].leftPercentage).toBe(45);
  });

  it('should draw the transition over the time it travels', () => {
    const markers = getStepMarkers(preset(step(0), step(5000, 2000)), scene('preset'), region(0, 10000));

    expect(markers[1].transitionLeftPercentage).toBe(30);
    expect(markers[1].transitionWidthPercentage).toBe(20);
  });

  it('should not let a transition reach back past the step it starts from', () => {
    const markers = getStepMarkers(preset(step(0), step(2000), step(4000, 9000)), scene('preset'), region(0, 10000));

    expect(markers[2].transitionLeftPercentage).toBe(20);
    expect(markers[2].transitionWidthPercentage).toBe(20);
  });

  it('should give the first step nothing to travel over', () => {
    const markers = getStepMarkers(preset(step(0, 1000), step(5000)), scene('preset'), region(0, 10000));

    expect(markers[0].transitionWidthPercentage).toBe(0);
  });

  it('should mark nothing for a preset the scene does not layer', () => {
    expect(getStepMarkers(preset(step(0), step(1000)), scene('another-preset'), region(0, 10000)).length).toBe(0);
  });

  it('should mark nothing for a preset which is a single static look', () => {
    expect(getStepMarkers(preset(step(0)), scene('preset'), region(0, 10000)).length).toBe(0);
  });

  it('should mark nothing for a region without a length', () => {
    expect(getStepMarkers(preset(step(0), step(1000)), scene('preset'), region(5000, 5000)).length).toBe(0);
  });

  it('should mark nothing without a preset or a region', () => {
    expect(getStepMarkers(undefined, scene('preset'), region(0, 10000)).length).toBe(0);
    expect(getStepMarkers(preset(step(0), step(1000)), scene('preset'), undefined).length).toBe(0);
  });
});
