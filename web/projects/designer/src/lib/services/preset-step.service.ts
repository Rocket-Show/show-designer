import { Injectable } from '@angular/core';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { FixtureChannelValue } from '../models/fixture-channel-value';
import { Preset } from '../models/preset';
import { getStepsLoopMillis, getTransitionEndMillis, PresetStep } from '../models/preset-step';
import { PresetStepState } from '../models/preset-step-state';
import { applyTransitionCurve } from '../models/transition-curve';
import { UuidService } from './uuid.service';

@Injectable({
  providedIn: 'root',
})
export class PresetStepService {
  constructor(private uuidService: UuidService) {}

  // a preset always runs at least one step: an old project (or one whose last step has
  // just been deleted) gets the static look it already had as its first one
  public ensureStep(preset: Preset): PresetStep {
    if (preset.steps.length === 0) {
      const step = new PresetStep();
      step.uuid = this.uuidService.getUuid();
      step.fixtureChannelValues = (preset.fixtureChannelValues || []).slice();
      step.fixtureCapabilityValues = (preset.fixtureCapabilityValues || []).slice();
      preset.steps.push(step);
    }

    return preset.steps[0];
  }

  // the steps are always processed and shown in the order they are reached
  public sortSteps(preset: Preset) {
    preset.steps.sort((step1, step2) => step1.startMillis - step2.startMillis);
  }

  // a new step starts out as a copy of the passed one, so that a look can be built up,
  // captured and then changed instead of being entered again from nothing
  public addStep(preset: Preset, copyOf?: PresetStep): PresetStep {
    const template = copyOf || preset.steps[preset.steps.length - 1];
    const step = new PresetStep(template ? JSON.parse(JSON.stringify(template)) : undefined);

    step.uuid = this.uuidService.getUuid();

    // place it after the last step, as far behind it as the step before that one was
    const steps = preset.steps;
    const last = steps[steps.length - 1];
    const previous = steps[steps.length - 2];
    const gapMillis = last && previous ? last.startMillis - previous.startMillis : 1000;

    step.startMillis = last ? last.startMillis + Math.max(gapMillis, 1) : 0;
    step.transitionMillis = template ? template.transitionMillis : 0;

    preset.steps.push(step);
    this.sortSteps(preset);

    return step;
  }

  public deleteStep(preset: Preset, step: PresetStep) {
    if (preset.steps.length < 2) {
      // a preset always keeps a step: its values are the preset itself
      return;
    }

    const index = preset.steps.indexOf(step);

    if (index >= 0) {
      preset.steps.splice(index, 1);
    }
  }

  // the length of one pass through the steps
  public getStepsLoopMillis(preset: Preset): number {
    return getStepsLoopMillis(preset.steps, preset.stepsLoopMillis);
  }

  // When the step at the passed index gives way to the next one. The last step holds
  // for as long as a pass of the sequence would have given it, which is what a looping
  // preset starts over after and what one which does not loop stands still on.
  public getStepEndMillis(preset: Preset, index: number): number {
    const steps = preset.steps;

    if (index < steps.length - 1) {
      return steps[index + 1].startMillis;
    }

    return steps[0].startMillis + this.getStepsLoopMillis(preset);
  }

  // how long the transition into the passed step actually runs, which is the whole
  // time the step lasts unless it carries a shorter one of its own
  public getStepTransitionMillis(preset: Preset, step: PresetStep): number {
    const index = preset.steps.indexOf(step);

    if (index < 0) {
      return 0;
    }

    return getTransitionEndMillis(step, step.startMillis, this.getStepEndMillis(preset, index)) - step.startMillis;
  }

  // whether the sequence starts at a different point for every fixture of the preset,
  // which makes the steps chase over them
  public stepsArePhased(preset: Preset): boolean {
    if (preset.steps.length < 2) {
      return false;
    }

    return preset.stepsPhasingMode === 'spread' ? preset.stepsPhasingCycles !== 0 : preset.stepsPhasingMillis !== 0;
  }

  // the time the sequence is shifted by for the passed fixture of the preset. This
  // follows the same rules the effect curves chase by.
  public getStepsPhasingMillis(preset: Preset, fixtureIndex?: number, fixtureCount?: number): number {
    const groupSize = Math.max(Math.round(preset.stepsPhasingGroupSize), 1);
    const step = Math.floor((fixtureIndex || 0) / groupSize);

    if (preset.stepsPhasingMode === 'spread') {
      // distribute the passes over all chase steps of the preset
      const steps = Math.max(Math.ceil((fixtureCount || 1) / groupSize), 1);
      return (step / steps) * preset.stepsPhasingCycles * this.getStepsLoopMillis(preset);
    }

    return step * preset.stepsPhasingMillis;
  }

  // the values of a single step, without copying them: the state is only read from
  public getStepState(step: PresetStep): PresetStepState {
    const state = new PresetStepState();

    if (!step) {
      return state;
    }

    state.currentStep = step;
    state.fixtureChannelValues = step.fixtureChannelValues;
    state.fixtureCapabilityValues = step.fixtureCapabilityValues;

    for (const effectAmount of step.effectAmounts) {
      state.effectAmounts.set(effectAmount.effectUuid, effectAmount.amount);
    }

    return state;
  }

  // the values the preset applies at the passed time, relative to its own start
  public getStateAtMillis(preset: Preset, presetTimeMillis: number): PresetStepState {
    const steps = preset.steps;

    if (!steps || steps.length === 0) {
      // an old project keeps its values on the preset itself
      const state = new PresetStepState();
      state.fixtureChannelValues = preset.fixtureChannelValues || [];
      state.fixtureCapabilityValues = preset.fixtureCapabilityValues || [];

      return state;
    }

    if (steps.length === 1) {
      return this.getStepState(steps[0]);
    }

    const first = steps[0];
    let timeMillis = presetTimeMillis;
    let loopMillis = 0;

    if (preset.stepsLoop) {
      loopMillis = this.getStepsLoopMillis(preset);

      if (loopMillis > 0) {
        // fold the time into a single pass, starting over at the first step
        timeMillis = first.startMillis + ((((timeMillis - first.startMillis) % loopMillis) + loopMillis) % loopMillis);
      }
    }

    // the step started last
    let index = -1;

    for (let i = 0; i < steps.length; i++) {
      if (steps[i].startMillis > timeMillis) {
        break;
      }

      index = i;
    }

    if (index < 0) {
      // before the first step: it is what the preset starts out with
      return this.getStepState(first);
    }

    const current = steps[index];
    const endMillis = this.getStepEndMillis(preset, index);

    // The step travelled from, which is the last one again once the sequence starts
    // over. The first step of a preset which does not loop has nothing to travel from,
    // so it is simply what the preset opens with.
    const previous = index > 0 ? steps[index - 1] : loopMillis > 0 ? steps[steps.length - 1] : undefined;

    const transitionEndMillis = getTransitionEndMillis(current, current.startMillis, endMillis);
    let state: PresetStepState;

    if (!previous || timeMillis >= transitionEndMillis) {
      state = this.getStepState(current);
    } else {
      const position = applyTransitionCurve(
        current.transitionCurve,
        (timeMillis - current.startMillis) / (transitionEndMillis - current.startMillis)
      );

      state = this.interpolate(previous, current, position);
    }

    // how far the sequence has come through this step, over the whole time it lasts
    // rather than only over the transition it starts with
    const stepLengthMillis = endMillis - current.startMillis;
    state.currentStepProgress = stepLengthMillis > 0 ? Math.min((timeMillis - current.startMillis) / stepLengthMillis, 1) : 1;

    return state;
  }

  private capabilityValuesMatch(value1: FixtureCapabilityValue, value2: FixtureCapabilityValue): boolean {
    // a capability value is identified by what it drives, not by the value it holds
    return (
      value1.type === value2.type &&
      (value1.color ?? undefined) === (value2.color ?? undefined) &&
      (value1.wheel ?? undefined) === (value2.wheel ?? undefined) &&
      (value1.profileUuid ?? undefined) === (value2.profileUuid ?? undefined)
    );
  }

  private getMatchingCapabilityValue(values: FixtureCapabilityValue[], value: FixtureCapabilityValue): FixtureCapabilityValue {
    for (const candidate of values) {
      if (this.capabilityValuesMatch(candidate, value)) {
        return candidate;
      }
    }

    return undefined;
  }

  private getMatchingChannelValue(values: FixtureChannelValue[], value: FixtureChannelValue): FixtureChannelValue {
    for (const candidate of values) {
      if (candidate.channelName === value.channelName && candidate.profileUuid === value.profileUuid) {
        return candidate;
      }
    }

    return undefined;
  }

  private interpolate(from: PresetStep, to: PresetStep, position: number): PresetStepState {
    const state = new PresetStepState();

    // the preset is on the step it is travelling into from the moment that step starts
    state.currentStep = to;

    // A value only one of the two steps carries is held as it is: a step not naming a
    // channel means it does not drive that channel, not that it drives it to zero.
    for (const toValue of to.fixtureChannelValues) {
      const fromValue = this.getMatchingChannelValue(from.fixtureChannelValues, toValue);
      const value = new FixtureChannelValue(toValue);

      if (fromValue) {
        value.value = fromValue.value + (toValue.value - fromValue.value) * position;
      }

      state.fixtureChannelValues.push(value);
    }

    for (const fromValue of from.fixtureChannelValues) {
      if (!this.getMatchingChannelValue(to.fixtureChannelValues, fromValue)) {
        state.fixtureChannelValues.push(fromValue);
      }
    }

    for (const toValue of to.fixtureCapabilityValues) {
      const fromValue = this.getMatchingCapabilityValue(from.fixtureCapabilityValues, toValue);

      if (!fromValue) {
        state.fixtureCapabilityValues.push(toValue);
        continue;
      }

      if (
        toValue.slotNumber !== undefined ||
        fromValue.slotNumber !== undefined ||
        toValue.valuePercentage === undefined ||
        fromValue.valuePercentage === undefined
      ) {
        // a wheel cannot stand between two of its slots: it turns as soon as the
        // transition starts, which a snap curve holds back to the end of it
        state.fixtureCapabilityValues.push(position > 0 ? toValue : fromValue);
        continue;
      }

      const value = new FixtureCapabilityValue(toValue);
      value.valuePercentage = fromValue.valuePercentage + (toValue.valuePercentage - fromValue.valuePercentage) * position;
      state.fixtureCapabilityValues.push(value);
    }

    for (const fromValue of from.fixtureCapabilityValues) {
      if (!this.getMatchingCapabilityValue(to.fixtureCapabilityValues, fromValue)) {
        state.fixtureCapabilityValues.push(fromValue);
      }
    }

    for (const effectAmount of to.effectAmounts) {
      const fromAmount = from.getEffectAmount(effectAmount.effectUuid);
      state.effectAmounts.set(effectAmount.effectUuid, fromAmount + (effectAmount.amount - fromAmount) * position);
    }

    for (const effectAmount of from.effectAmounts) {
      if (!state.effectAmounts.has(effectAmount.effectUuid)) {
        // the step travelled to says nothing about this effect, so it opens fully
        state.effectAmounts.set(effectAmount.effectUuid, effectAmount.amount + (1 - effectAmount.amount) * position);
      }
    }

    return state;
  }
}
