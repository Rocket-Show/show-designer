import { TestBed } from '@angular/core/testing';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { FixtureChannelValue } from '../models/fixture-channel-value';
import { Preset } from '../models/preset';
import { adoptStepsLength, PresetStep } from '../models/preset-step';
import { PresetStepEffectAmount } from '../models/preset-step-effect-amount';
import { getStepsTimeMillis } from '../models/preset-steps-order';
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

  // a preset the way a project brings it along: its step length is the one its steps are
  // apart, the steps off its grid starting at times of their own
  function loaded(...steps: PresetStep[]): Preset {
    const presetWithSteps = preset(...steps);
    presetWithSteps.stepsLengthMillis = adoptStepsLength(steps);

    return presetWithSteps;
  }

  function starts(presetWithSteps: Preset): number[] {
    return presetWithSteps.steps.map((presetStep) => presetStep.startMillis);
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

  it('should let each moving head travel on its own from one fan to the next', () => {
    const from = step(0, 0);
    const to = step(1000, 0, 1000);
    from.fixtureCapabilityValues.push(new FixtureCapabilityValue({ type: 'Pan', valueDegrees: 0 }));
    from.fixtureCapabilityValues.push(new FixtureCapabilityValue({ type: 'Tilt', valuePercentage: 0.2 }));
    to.fixtureCapabilityValues.push(new FixtureCapabilityValue({ type: 'Pan', valueDegrees: 20, spreadDegrees: 120 }));
    to.fixtureCapabilityValues.push(new FixtureCapabilityValue({ type: 'Tilt', valuePercentage: 0.6 }));

    const state = service.getStateAtMillis(preset(from, to), 1250);
    const pan = state.fixtureCapabilityValues.find((value) => value.type === FixtureCapabilityType.Pan);
    const tilt = state.fixtureCapabilityValues.find((value) => value.type === FixtureCapabilityType.Tilt);

    // where the heads point is worked out for each of them, from the value they travel from (see pan-tilt)
    expect(pan.valueDegrees).toBe(20);
    expect(pan.spreadDegrees).toBe(120);
    expect(pan.transitionFrom).toBe(from.fixtureCapabilityValues[0]);
    expect(pan.transitionPosition).toBe(0.25);

    // two percentages of the range alone travel like any other percentage
    expect(tilt.valuePercentage).toBeCloseTo(0.3, 10);
    expect(tilt.transitionFrom).toBeUndefined();

    // a step on its own travels from nothing, and the values of a step are never touched
    expect(service.getStateAtMillis(preset(from, to), 2000).fixtureCapabilityValues[0].transitionFrom).toBeUndefined();
    expect(to.fixtureCapabilityValues[0].transitionFrom).toBeUndefined();
  });

  it('should let each blade of a framing shutter travel from the same blade', () => {
    const from = step(0, 0);
    const to = step(1000, 0, 1000);
    from.fixtureCapabilityValues.push(new FixtureCapabilityValue({ type: 'BladeInsertion', blade: 'Top', valuePercentage: 0 }));
    from.fixtureCapabilityValues.push(new FixtureCapabilityValue({ type: 'BladeInsertion', blade: 'Bottom', valuePercentage: 1 }));
    to.fixtureCapabilityValues.push(new FixtureCapabilityValue({ type: 'BladeInsertion', blade: 'Bottom', valuePercentage: 0.5 }));
    to.fixtureCapabilityValues.push(new FixtureCapabilityValue({ type: 'BladeInsertion', blade: 'Top', valuePercentage: 1 }));

    const state = service.getStateAtMillis(preset(from, to), 1500);
    const blade = (name: string) => state.fixtureCapabilityValues.find((value) => value.blade === name);

    expect(state.fixtureCapabilityValues.length).toBe(2);
    expect(blade('Top').valuePercentage).toBeCloseTo(0.5, 10);
    expect(blade('Bottom').valuePercentage).toBeCloseTo(0.75, 10);
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

  it('should not fill the only step of a preset, which is a look standing still', () => {
    expect(service.getStateAtMillis(preset(step(0, 100)), 500).currentStepProgress).toBe(0);
  });

  it('should be all through a step which lasts no time at all', () => {
    // both steps start at once, so a pass and with it the last step lasts nothing
    const sequence = preset(step(0, 100), step(0, 200));

    expect(service.getStateAtMillis(sequence, 0).currentStepProgress).toBe(1);
  });

  it('should fall back to no values for a preset without steps and without values of its own', () => {
    const empty = new Preset();
    empty.fixtureChannelValues = undefined;
    empty.fixtureCapabilityValues = undefined;

    const state = service.getStateAtMillis(empty, 0);

    expect(state.fixtureChannelValues).toEqual([]);
    expect(state.fixtureCapabilityValues).toEqual([]);
  });

  it('should give no step no values', () => {
    const state = service.getStepState(undefined);

    expect(state.currentStep).toBeUndefined();
    expect(state.fixtureChannelValues).toEqual([]);
  });

  describe('the steps of a preset', () => {
    function capability(valuePercentage: number): FixtureCapabilityValue {
      const capabilityValue = new FixtureCapabilityValue();
      capabilityValue.type = FixtureCapabilityType.Intensity;
      capabilityValue.valuePercentage = valuePercentage;

      return capabilityValue;
    }

    it('should give an old preset its values as its first step, which keeps lists of its own', () => {
      const old = new Preset();
      old.fixtureChannelValues = step(0, 42).fixtureChannelValues;
      old.fixtureCapabilityValues = [capability(0.5)];

      const first = service.ensureStep(old);

      expect(old.steps).toEqual([first]);
      expect(first.uuid).toBeTruthy();
      expect(first.fixtureChannelValues).toEqual(old.fixtureChannelValues);
      expect(first.fixtureCapabilityValues).toEqual(old.fixtureCapabilityValues);
      // editing the step leaves what an older Rocket Show reads alone
      expect(first.fixtureChannelValues).not.toBe(old.fixtureChannelValues);
      expect(first.fixtureCapabilityValues).not.toBe(old.fixtureCapabilityValues);
    });

    it('should give a preset without any values an empty first step', () => {
      const empty = new Preset();
      empty.fixtureChannelValues = undefined;
      empty.fixtureCapabilityValues = undefined;

      const first = service.ensureStep(empty);

      expect(first.fixtureChannelValues).toEqual([]);
      expect(first.fixtureCapabilityValues).toEqual([]);
    });

    it('should keep the steps a preset has', () => {
      const sequence = preset(step(0, 100), step(1000, 200));

      expect(service.ensureStep(sequence)).toBe(sequence.steps[0]);
      expect(sequence.steps.length).toBe(2);
    });

    it('should add a copy of the last step on the next place of the grid of the sequence', () => {
      const sequence = loaded(step(0, 100), step(400, 200, 300));

      const added = service.addStep(sequence);

      expect(sequence.steps.length).toBe(3);
      expect(sequence.steps[2]).toBe(added);
      expect(added.startMillis).toBe(800);
      expect(added.ownStart).toBe(false);
      expect(added.uuid).not.toBe('step-400');
      expect(added.transitionMillis).toBe(300);
      expect(added.fixtureChannelValues[0].value).toBe(200);
      expect(added.fixtureChannelValues[0]).not.toBe(sequence.steps[1].fixtureChannelValues[0]);
    });

    it('should add a copy of the step it is asked to copy', () => {
      const sequence = loaded(step(0, 100, 250), step(1000, 200));

      const added = service.addStep(sequence, sequence.steps[0]);

      expect(added.startMillis).toBe(2000);
      expect(added.transitionMillis).toBe(250);
      expect(added.fixtureChannelValues[0].value).toBe(100);
    });

    it('should add a step after the last one, whatever the step it copies starts at', () => {
      const sequence = loaded(step(0, 100), step(1000, 200), step(2500, 300));

      const added = service.addStep(sequence, sequence.steps[2]);

      // the copy of a step with a start of its own takes its place on the grid
      expect(sequence.steps[3]).toBe(added);
      expect(added.ownStart).toBe(false);
      expect(added.startMillis).toBe(3000);
    });

    it('should add a step a step length behind a last one which starts past the next place of the grid', () => {
      const sequence = loaded(step(0, 100), step(1000, 200), step(5000, 300));

      const added = service.addStep(sequence);

      expect(sequence.steps[3]).toBe(added);
      expect(added.startMillis).toBe(6000);
      // it stays behind the last step when the speed changes
      expect(added.ownStart).toBe(true);
    });

    it('should add a step on the grid behind the only one', () => {
      const sequence = loaded(step(500, 100));

      expect(service.addStep(sequence).startMillis).toBe(1000);
    });

    it('should add the first step of a preset at its start, jumping into it', () => {
      const added = service.addStep(new Preset());

      expect(added.startMillis).toBe(0);
      expect(added.ownStart).toBe(false);
      expect(added.transitionMillis).toBe(0);
      expect(added.fixtureChannelValues).toEqual([]);
    });

    it('should lay the steps out on the grid of the sequence, at its speed', () => {
      const sequence = loaded(step(0, 100), step(1000, 200), step(2500, 300), step(3000, 400));
      sequence.stepsLengthMillis = 500;

      service.layoutSteps(sequence);

      // the step with a start of its own is passed by the one behind it
      expect(starts(sequence)).toEqual([0, 500, 1000, 2500]);
      expect(sequence.steps.map((presetStep) => presetStep.uuid)).toEqual(['step-0', 'step-1000', 'step-3000', 'step-2500']);
    });

    it('should say where a step starts while it has no start of its own', () => {
      const sequence = loaded(step(0, 100), step(1000, 200), step(2500, 300));

      expect(service.getAutomaticStartMillis(sequence, sequence.steps[0])).toBe(0);
      expect(service.getAutomaticStartMillis(sequence, sequence.steps[2])).toBe(2000);
      expect(service.getAutomaticStartMillis(sequence, step(0, 100))).toBe(0);
    });

    it('should keep the only step of a preset, which is the preset itself', () => {
      const single = preset(step(0, 100));

      service.deleteStep(single, single.steps[0]);

      expect(single.steps.length).toBe(1);
    });

    it('should delete a step, the steps following it closing up', () => {
      const sequence = loaded(step(0, 100), step(1000, 200), step(2000, 300), step(3500, 400));

      service.deleteStep(sequence, sequence.steps[1]);

      // a step with a start of its own stays where it is
      expect(starts(sequence)).toEqual([0, 1000, 3500]);
      expect(sequence.steps.map((presetStep) => presetStep.uuid)).toEqual(['step-0', 'step-2000', 'step-3500']);
    });

    it('should leave the steps alone when asked to delete one which is not in the preset', () => {
      const sequence = preset(step(0, 100), step(1000, 200));

      service.deleteStep(sequence, step(1000, 200));

      expect(sequence.steps.length).toBe(2);
    });

    it('should say how long the transition into a step runs', () => {
      const sequence = preset(step(1000, 100), step(2000, 200, 300), step(2500, 300, 5000));
      sequence.steps[0].transitionMillis = undefined;

      // the whole time the first step lasts, the time the second one brings, and no longer than
      // the last one lasts (as long as the one before it)
      expect(service.getStepTransitionMillis(sequence, sequence.steps[0])).toBe(1000);
      expect(service.getStepTransitionMillis(sequence, sequence.steps[1])).toBe(300);
      expect(service.getStepTransitionMillis(sequence, sequence.steps[2])).toBe(500);
      expect(service.getStepTransitionMillis(sequence, step(2000, 200, 300))).toBe(0);
    });
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
  describe('the order the steps are played in', () => {
    // three steps a second apart: 10, 20 and 30, each jumping in (no transition)
    function threeSteps(order: string, loop = false): Preset {
      const presetWithSteps = loaded(step(0, 10), step(1000, 20), step(2000, 30));
      presetWithSteps.stepsOrder = order;
      presetWithSteps.stepsLoop = loop;

      return presetWithSteps;
    }

    function played(presetWithSteps: Preset, count: number): number[] {
      const values: number[] = [];

      for (let i = 0; i < count; i++) {
        values.push(dimmerAt(presetWithSteps, i * 1000 + 500));
      }

      return values;
    }

    it('should play the steps the way they are written down, forward', () => {
      expect(played(threeSteps('forward', true), 6)).toEqual([10, 20, 30, 10, 20, 30]);
    });

    it('should play the steps backward, holding the first one at the end', () => {
      expect(played(threeSteps('backward'), 5)).toEqual([30, 20, 10, 10, 10]);
    });

    it('should loop the steps backward', () => {
      expect(played(threeSteps('backward', true), 6)).toEqual([30, 20, 10, 30, 20, 10]);
    });

    it('should play the steps forward and back, without playing the ends twice in a row', () => {
      expect(played(threeSteps('pingpong', true), 9)).toEqual([10, 20, 30, 20, 10, 20, 30, 20, 10]);
    });

    it('should end forward and back on the first step, if the sequence does not loop', () => {
      expect(played(threeSteps('pingpong'), 7)).toEqual([10, 20, 30, 20, 10, 10, 10]);
    });

    it('should play every step once per pass in a random order, never one twice in a row', () => {
      const presetWithSteps = loaded(step(0, 10), step(1000, 20), step(2000, 30), step(3000, 40), step(4000, 50));
      presetWithSteps.stepsOrder = 'random';
      presetWithSteps.stepsLoop = true;
      const values = played(presetWithSteps, 5 * 20);

      for (let pass = 0; pass < 20; pass++) {
        expect(values.slice(pass * 5, pass * 5 + 5).sort((a, b) => a - b)).toEqual([10, 20, 30, 40, 50]);
      }
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).not.toBe(values[i - 1]);
      }

      // not simply forward, and the same again for the same seed
      expect(values.slice(0, 15)).not.toEqual([10, 20, 30, 40, 50, 10, 20, 30, 40, 50, 10, 20, 30, 40, 50]);
      expect(played(presetWithSteps, 5 * 20)).toEqual(values);

      // another seed shuffles differently
      presetWithSteps.stepsSeed = 2;
      expect(played(presetWithSteps, 5 * 20)).not.toEqual(values);
    });

    it('should let each step last as long as it does written down, in any order', () => {
      // 10 lasts 500, 20 lasts 1500, 30 lasts as long as the one before it
      const presetWithSteps = loaded(step(0, 10), step(500, 20), step(2000, 30));
      presetWithSteps.stepsOrder = 'backward';

      expect(service.getStepsPassMillis(presetWithSteps)).toBe(3500);
      expect(dimmerAt(presetWithSteps, 1400)).toBe(30);
      expect(dimmerAt(presetWithSteps, 1600)).toBe(20);
      expect(dimmerAt(presetWithSteps, 2900)).toBe(20);
      expect(dimmerAt(presetWithSteps, 3100)).toBe(10);
    });

    it('should travel into a step from the one played before it', () => {
      const presetWithSteps = loaded(step(0, 10), step(1000, 20, 1000), step(2000, 30, 1000));
      presetWithSteps.stepsOrder = 'backward';
      presetWithSteps.stepsLoop = true;

      // 30 opens the pass, travelling from 10, which ended the pass before
      expect(dimmerAt(presetWithSteps, 3000 + 500)).toBe(20);
      // 20 travels from 30 over its second
      expect(dimmerAt(presetWithSteps, 1000 + 500)).toBe(25);
      // the step written first jumps in (it has no transition of its own)
      expect(dimmerAt(presetWithSteps, 2000 + 1)).toBe(10);
    });

    it('should hold the step it opens with before the sequence starts', () => {
      expect(dimmerAt(threeSteps('backward'), -500)).toBe(30);
    });

    it('should make a pass forward and back last as long as all the steps it plays', () => {
      expect(service.getStepsPassMillis(threeSteps('pingpong', true))).toBe(4000);
      expect(service.getStepsPassMillis(threeSteps('pingpong'))).toBe(5000);
      expect(service.getStepsPassMillis(threeSteps('random', true))).toBe(3000);
    });

    it('should spread the chase over the fixtures over a whole pass in the order', () => {
      const presetWithSteps = threeSteps('pingpong', true);
      presetWithSteps.stepsPhasingMode = 'spread';

      expect(service.getStepsPhasingMillis(presetWithSteps, 1, 4)).toBe(1000);
    });

    it('should leave out the steps which last no time', () => {
      const presetWithSteps = loaded(step(0, 10), step(1000, 20), step(1000, 25), step(2000, 30));
      presetWithSteps.stepsOrder = 'backward';

      expect(played(presetWithSteps, 3)).toEqual([30, 25, 10]);
    });

    it('should play the steps of an order it does not know forward, like Rocket Show', () => {
      expect(played(threeSteps('sideways', true), 4)).toEqual([10, 20, 30, 10]);
    });

    it('should know which step opens a sequence which does not loop', () => {
      const presetWithSteps = threeSteps('backward');

      expect(service.opensSequence(presetWithSteps, presetWithSteps.steps[2])).toBe(true);
      expect(service.opensSequence(presetWithSteps, presetWithSteps.steps[0])).toBe(false);

      presetWithSteps.stepsLoop = true;
      expect(service.opensSequence(presetWithSteps, presetWithSteps.steps[2])).toBe(false);
    });
  });

  describe('the steps following the beat', () => {
    it('run as much faster or slower as the tempo played is than the one they are written at', () => {
      const presetWithSteps = preset(step(0, 10), step(1000, 20));
      presetWithSteps.stepsLengthMode = 'beats';
      presetWithSteps.stepsBeatsPerMinute = 120;

      expect(getStepsTimeMillis(presetWithSteps, 1000, 120)).toBe(1000);
      expect(getStepsTimeMillis(presetWithSteps, 1000, 90)).toBe(750);
      expect(getStepsTimeMillis(presetWithSteps, 1000, 150)).toBe(1250);
    });

    it('leave the steps timed as written down alone', () => {
      expect(getStepsTimeMillis(preset(step(0, 10)), 1000, 90)).toBe(1000);
    });
  });
});
