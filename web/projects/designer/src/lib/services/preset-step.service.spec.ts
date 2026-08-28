import { TestBed } from '@angular/core/testing';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { FixtureChannelValue } from '../models/fixture-channel-value';
import { Preset } from '../models/preset';
import { PresetStep } from '../models/preset-step';
import { PresetStepEffectAmount } from '../models/preset-step-effect-amount';
import { PresetStepService } from './preset-step.service';

describe('PresetStepService', () => {
  let service: PresetStepService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PresetStepService);
  });

  // a step driving one channel to the passed value, starting at startMillis. Without a
  // transition of its own a step travels over the whole time it lasts, so the cases
  // which want a jump ask for one.
  function step(startMillis: number, value: number, transitionMillis: number = 0): PresetStep {
    const presetStep = new PresetStep();
    presetStep.uuid = 'step-' + startMillis;
    presetStep.startMillis = startMillis;
    presetStep.transitionMillis = transitionMillis;

    const channelValue = new FixtureChannelValue();
    channelValue.channelName = 'dimmer';
    channelValue.profileUuid = 'profile';
    channelValue.value = value;
    presetStep.fixtureChannelValues.push(channelValue);

    return presetStep;
  }

  function preset(...steps: PresetStep[]): Preset {
    const presetWithSteps = new Preset();
    presetWithSteps.steps = steps;

    return presetWithSteps;
  }

  function dimmerAt(presetWithSteps: Preset, timeMillis: number): number {
    const state = service.getStateAtMillis(presetWithSteps, timeMillis);

    return state.fixtureChannelValues.find((value) => value.channelName === 'dimmer').value;
  }

  it('should apply the only step of a preset at any time', () => {
    const single = preset(step(0, 100));

    expect(dimmerAt(single, -500)).toBe(100);
    expect(dimmerAt(single, 0)).toBe(100);
    expect(dimmerAt(single, 10000)).toBe(100);
  });

  it('should fall back to the values of a preset which has no steps yet', () => {
    const old = new Preset();
    const channelValue = new FixtureChannelValue();
    channelValue.channelName = 'dimmer';
    channelValue.profileUuid = 'profile';
    channelValue.value = 42;
    old.fixtureChannelValues.push(channelValue);

    expect(dimmerAt(old, 0)).toBe(42);
  });

  it('should hold the first step before it starts', () => {
    const sequence = preset(step(1000, 100), step(2000, 200));

    expect(dimmerAt(sequence, 0)).toBe(100);
    expect(dimmerAt(sequence, 999)).toBe(100);
  });

  it('should jump to a step which is not travelled to', () => {
    const sequence = preset(step(0, 100), step(1000, 200));

    expect(dimmerAt(sequence, 999)).toBe(100);
    expect(dimmerAt(sequence, 1000)).toBe(200);
  });

  it('should travel into a step over the time that step starts with', () => {
    const sequence = preset(step(0, 100), step(1000, 200, 400));

    // the transition runs over the 400 ms the second step opens with
    expect(dimmerAt(sequence, 999)).toBe(100);
    expect(dimmerAt(sequence, 1000)).toBe(100);
    expect(dimmerAt(sequence, 1200)).toBe(150);
    expect(dimmerAt(sequence, 1400)).toBe(200);
    expect(dimmerAt(sequence, 1800)).toBe(200);
  });

  it('should let a step which changes nothing stand still', () => {
    // three steps of black, black and white: the white belongs to the third step, so
    // nothing may move while the second one plays
    const sequence = preset(step(0, 0), step(1000, 0), step(2000, 255));
    sequence.steps[2].transitionMillis = undefined;

    expect(dimmerAt(sequence, 1000)).toBe(0);
    expect(dimmerAt(sequence, 1999)).toBe(0);
    expect(dimmerAt(sequence, 2500)).toBe(127.5);
    expect(dimmerAt(sequence, 3000)).toBe(255);
  });

  it('should not let a transition run past the step which follows it', () => {
    const sequence = preset(step(0, 100), step(500, 200, 5000), step(1000, 300));

    // the second step would travel into the third one, which it cannot
    expect(dimmerAt(sequence, 500)).toBe(100);
    expect(dimmerAt(sequence, 750)).toBe(150);
    expect(dimmerAt(sequence, 1000)).toBe(300);
  });

  it('should hold the last step of a sequence which does not loop', () => {
    const sequence = preset(step(0, 100), step(1000, 200));

    expect(dimmerAt(sequence, 100000)).toBe(200);
  });

  it('should let the last step of a loop last as long as the one before it', () => {
    const sequence = preset(step(0, 100), step(500, 200), step(1000, 300));

    expect(service.getStepsLoopMillis(sequence)).toBe(1500);
  });

  it('should start a looping sequence over', () => {
    const sequence = preset(step(0, 100), step(500, 200), step(1000, 300));
    sequence.stepsLoop = true;

    expect(dimmerAt(sequence, 1499)).toBe(300);
    expect(dimmerAt(sequence, 1500)).toBe(100);
    expect(dimmerAt(sequence, 2000)).toBe(200);
  });

  it('should travel from the last step back into the first one when looping', () => {
    const sequence = preset(step(0, 100), step(1000, 300));
    sequence.stepsLoop = true;
    sequence.stepsLoopMillis = 2000;
    sequence.steps[0].transitionMillis = 500;

    // the wrap runs over the 500 ms the first step of the next pass opens with
    expect(dimmerAt(sequence, 2000)).toBe(300);
    expect(dimmerAt(sequence, 2250)).toBe(200);
    expect(dimmerAt(sequence, 2500)).toBe(100);
  });

  it('should travel over its whole length for a step without a transition of its own', () => {
    const sequence = preset(step(0, 100), step(1000, 200));
    sequence.steps[1].transitionMillis = undefined;

    // the last step is held for the 1000 ms a pass would have given it and travels
    // into its value over all of them
    expect(dimmerAt(sequence, 1000)).toBe(100);
    expect(dimmerAt(sequence, 1500)).toBe(150);
    expect(dimmerAt(sequence, 2000)).toBe(200);
  });

  it('should jump for a step whose transition was set to nothing', () => {
    const sequence = preset(step(0, 100), step(1000, 200, 0));

    expect(dimmerAt(sequence, 999)).toBe(100);
    expect(dimmerAt(sequence, 1000)).toBe(200);
  });

  it('should name the step it is on', () => {
    const sequence = preset(step(0, 100), step(1000, 200, 400));

    expect(service.getStateAtMillis(sequence, 500).currentStep).toBe(sequence.steps[0]);
    // it is on the second step from the moment that one starts, transition and all
    expect(service.getStateAtMillis(sequence, 1000).currentStep).toBe(sequence.steps[1]);
    expect(service.getStateAtMillis(sequence, 1200).currentStep).toBe(sequence.steps[1]);
  });

  it('should hold a value only one of the two steps carries', () => {
    const from = step(0, 100);
    const to = step(1000, 200, 1000);

    const onlyInFrom = new FixtureChannelValue();
    onlyInFrom.channelName = 'strobe';
    onlyInFrom.profileUuid = 'profile';
    onlyInFrom.value = 50;
    from.fixtureChannelValues.push(onlyInFrom);

    const onlyInTo = new FixtureChannelValue();
    onlyInTo.channelName = 'zoom';
    onlyInTo.profileUuid = 'profile';
    onlyInTo.value = 70;
    to.fixtureChannelValues.push(onlyInTo);

    const state = service.getStateAtMillis(preset(from, to), 1500);

    expect(state.fixtureChannelValues.find((value) => value.channelName === 'strobe').value).toBe(50);
    expect(state.fixtureChannelValues.find((value) => value.channelName === 'zoom').value).toBe(70);
  });

  it('should interpolate a capability value over the transition', () => {
    const from = step(0, 0);
    const to = step(1000, 0, 1000);

    for (const [target, percentage] of [
      [from, 0.2],
      [to, 1],
    ] as [PresetStep, number][]) {
      const capabilityValue = new FixtureCapabilityValue();
      capabilityValue.type = FixtureCapabilityType.ColorIntensity;
      capabilityValue.color = FixtureCapabilityColor.Red;
      capabilityValue.valuePercentage = percentage;
      target.fixtureCapabilityValues.push(capabilityValue);
    }

    const state = service.getStateAtMillis(preset(from, to), 1500);

    expect(state.fixtureCapabilityValues[0].valuePercentage).toBeCloseTo(0.6, 10);
  });

  it('should turn a wheel as soon as the transition to its slot starts', () => {
    const from = step(0, 0);
    const to = step(1000, 0, 1000);

    for (const [target, slotNumber] of [
      [from, 1],
      [to, 4],
    ] as [PresetStep, number][]) {
      const capabilityValue = new FixtureCapabilityValue();
      capabilityValue.type = FixtureCapabilityType.WheelSlot;
      capabilityValue.wheel = 'Color Wheel';
      capabilityValue.slotNumber = slotNumber;
      target.fixtureCapabilityValues.push(capabilityValue);
    }

    const sequence = preset(from, to);

    expect(service.getStateAtMillis(sequence, 1000).fixtureCapabilityValues[0].slotNumber).toBe(1);
    expect(service.getStateAtMillis(sequence, 1500).fixtureCapabilityValues[0].slotNumber).toBe(4);
  });

  it('should hold a wheel until the end of a snapping transition', () => {
    const from = step(0, 0);
    const to = step(1000, 0, 1000);
    to.transitionCurve = 'snap';

    for (const [target, slotNumber] of [
      [from, 1],
      [to, 4],
    ] as [PresetStep, number][]) {
      const capabilityValue = new FixtureCapabilityValue();
      capabilityValue.type = FixtureCapabilityType.WheelSlot;
      capabilityValue.wheel = 'Color Wheel';
      capabilityValue.slotNumber = slotNumber;
      target.fixtureCapabilityValues.push(capabilityValue);
    }

    const sequence = preset(from, to);

    expect(service.getStateAtMillis(sequence, 1500).fixtureCapabilityValues[0].slotNumber).toBe(1);
    expect(service.getStateAtMillis(sequence, 2000).fixtureCapabilityValues[0].slotNumber).toBe(4);
  });

  it('should shape a transition with its curve', () => {
    const sequence = preset(step(0, 0), step(1000, 100, 1000));
    sequence.steps[1].transitionCurve = 'ease-in';

    // half way through an ease-in, a quarter of the distance is covered
    expect(dimmerAt(sequence, 1500)).toBeCloseTo(25, 10);
  });

  it('should say how far it has come through the step it is on', () => {
    const sequence = preset(step(0, 100), step(1000, 200, 400));

    expect(service.getStateAtMillis(sequence, 0).currentStepProgress).toBe(0);
    // the whole time a step lasts counts, not only the transition it opens with
    expect(service.getStateAtMillis(sequence, 250).currentStepProgress).toBe(0.25);
    expect(service.getStateAtMillis(sequence, 800).currentStepProgress).toBe(0.8);
  });

  it('should hold the last step for the share of a pass it would have had', () => {
    const sequence = preset(step(0, 100), step(1000, 200));

    // a pass of these two steps runs 2000 ms, so the last one holds the 1000 ms after it
    expect(service.getStepsLoopMillis(sequence)).toBe(2000);
    expect(service.getStateAtMillis(sequence, 1000).currentStepProgress).toBe(0);
    expect(service.getStateAtMillis(sequence, 1500).currentStepProgress).toBe(0.5);
    expect(service.getStateAtMillis(sequence, 2000).currentStepProgress).toBe(1);
    // and stays on it once the sequence is over
    expect(service.getStateAtMillis(sequence, 50000).currentStepProgress).toBe(1);
    expect(dimmerAt(sequence, 50000)).toBe(200);
  });

  it('should let an effect through fully unless a step says otherwise', () => {
    const sequence = preset(step(0, 0), step(1000, 100));

    expect(service.getStateAtMillis(sequence, 0).getEffectAmount('effect')).toBe(1);
  });

  it('should interpolate how much of an effect the steps let through', () => {
    const from = step(0, 0);
    const to = step(1000, 0, 1000);

    const silenced = new PresetStepEffectAmount();
    silenced.effectUuid = 'effect';
    silenced.amount = 0;
    from.effectAmounts.push(silenced);

    const open = new PresetStepEffectAmount();
    open.effectUuid = 'effect';
    open.amount = 1;
    to.effectAmounts.push(open);

    expect(service.getStateAtMillis(preset(from, to), 1500).getEffectAmount('effect')).toBeCloseTo(0.5, 10);
  });

  describe('chasing the steps over the fixtures', () => {
    it('should not chase a preset which was not asked to', () => {
      const sequence = preset(step(0, 100), step(1000, 200));

      expect(service.stepsArePhased(sequence)).toBe(false);
      expect(service.getStepsPhasingMillis(sequence, 3, 4)).toBe(0);
    });

    it('should shift each fixture by a fixed time', () => {
      const sequence = preset(step(0, 100), step(1000, 200));
      sequence.stepsPhasingMillis = 250;

      expect(service.stepsArePhased(sequence)).toBe(true);
      expect(service.getStepsPhasingMillis(sequence, 0, 4)).toBe(0);
      expect(service.getStepsPhasingMillis(sequence, 2, 4)).toBe(500);
    });

    it('should spread whole passes over all fixtures of the preset', () => {
      const sequence = preset(step(0, 100), step(500, 200), step(1000, 300));
      sequence.stepsPhasingMode = 'spread';
      sequence.stepsPhasingCycles = 1;

      // one pass is 1500 ms long and is spread over the four fixtures
      expect(service.getStepsPhasingMillis(sequence, 0, 4)).toBe(0);
      expect(service.getStepsPhasingMillis(sequence, 1, 4)).toBe(375);
      expect(service.getStepsPhasingMillis(sequence, 3, 4)).toBe(1125);
    });

    it('should chase groups of fixtures together', () => {
      const sequence = preset(step(0, 100), step(1000, 200));
      sequence.stepsPhasingMillis = 250;
      sequence.stepsPhasingGroupSize = 2;

      expect(service.getStepsPhasingMillis(sequence, 0, 4)).toBe(0);
      expect(service.getStepsPhasingMillis(sequence, 1, 4)).toBe(0);
      expect(service.getStepsPhasingMillis(sequence, 2, 4)).toBe(250);
    });
  });
});
