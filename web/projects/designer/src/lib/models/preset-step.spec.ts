import { adoptStepsLength, getAutomaticStartMillis, getTransitionEndMillis, layoutSteps, PresetStep } from './preset-step';

describe('PresetStep', () => {
  function step(transitionMillis?: number): PresetStep {
    const presetStep = new PresetStep();
    presetStep.transitionMillis = transitionMillis;

    return presetStep;
  }

  it('should start a new step at the start of its preset, travelling into it linearly', () => {
    const fresh = new PresetStep();

    expect(fresh.startMillis).toBe(0);
    expect(fresh.transitionCurve).toBe('linear');
    expect(new PresetStep({ uuid: 'step' }).transitionCurve).toBe('linear');
  });

  it('should let a step take its place in the sequence, unless it starts at a time of its own', () => {
    expect(new PresetStep().ownStart).toBe(false);
    expect(new PresetStep({ uuid: 'step', startMillis: 500 }).ownStart).toBe(false);
    expect(new PresetStep({ uuid: 'step', startMillis: 500, ownStart: true }).ownStart).toBe(true);
  });

  it('should end the transition into a step over the whole time it lasts, or the time it carries', () => {
    expect(getTransitionEndMillis(step(), 1000, 3000)).toBe(3000);
    expect(getTransitionEndMillis(step(500), 1000, 3000)).toBe(1500);
    expect(getTransitionEndMillis(step(5000), 1000, 3000)).toBe(3000);
  });

  it('should end the transition into a step without an end where the step starts', () => {
    expect(getTransitionEndMillis(step(), 1000, undefined)).toBe(1000);
    expect(getTransitionEndMillis(step(500), 1000, undefined)).toBe(1000);
  });

  it('should end the transition into a step which lasts no time where the step starts, whatever time it carries', () => {
    expect(getTransitionEndMillis(step(500), 1000, 1000)).toBe(1000);
    expect(getTransitionEndMillis(step(-500), 1000, 1000)).toBe(1000);
    expect(getTransitionEndMillis(step(500), 1000, 400)).toBe(1000);
  });

  describe('the steps of a sequence', () => {
    // steps at the passed starts, the ones in brackets starting at a time of their own
    function steps(...starts: (number | [number])[]): PresetStep[] {
      return starts.map((start, index) => {
        const own = Array.isArray(start);

        return new PresetStep({ uuid: 'step-' + (index + 1), startMillis: own ? start[0] : start, ownStart: own });
      });
    }

    function starts(sequence: PresetStep[]): number[] {
      return sequence.map((presetStep) => presetStep.startMillis);
    }

    function uuids(sequence: PresetStep[]): string[] {
      return sequence.map((presetStep) => presetStep.uuid);
    }

    it('should start each step as many step lengths after the start of the preset as there are steps before it', () => {
      expect(getAutomaticStartMillis(0, 500)).toBe(0);
      expect(getAutomaticStartMillis(3, 500)).toBe(1500);
    });

    it('should put the steps on the grid of the sequence, which moves them all with its speed', () => {
      const sequence = steps(0, 1000, 2000, 3000);

      layoutSteps(sequence, 250);

      expect(starts(sequence)).toEqual([0, 250, 500, 750]);
    });

    it('should leave a step which starts at a time of its own where it is, and the others on the grid', () => {
      const sequence = steps(0, 1000, [2400], 3000);

      layoutSteps(sequence, 1000);

      expect(starts(sequence)).toEqual([0, 1000, 2400, 3000]);

      // a sequence running faster passes it
      layoutSteps(sequence, 500);

      expect(uuids(sequence)).toEqual(['step-1', 'step-2', 'step-4', 'step-3']);
      expect(starts(sequence)).toEqual([0, 500, 1000, 2400]);
    });

    it('should move a step to its place among the others, the others closing up around it', () => {
      // moved before the steps ahead of it
      const earlier = steps(0, 1000, 2000, [500]);
      layoutSteps(earlier, 1000);

      expect(uuids(earlier)).toEqual(['step-1', 'step-4', 'step-2', 'step-3']);
      expect(starts(earlier)).toEqual([0, 500, 2000, 3000]);

      // moved past the steps behind it
      const later = steps([2500], 1000, 2000, 3000);
      layoutSteps(later, 1000);

      expect(uuids(later)).toEqual(['step-2', 'step-3', 'step-1', 'step-4']);
      expect(starts(later)).toEqual([0, 1000, 2500, 3000]);
    });

    it('should settle a step which passes others that start at times of their own', () => {
      const sequence = steps([9000], [9500], [1900], 3000);

      layoutSteps(sequence, 1000);

      expect(uuids(sequence)).toEqual(['step-4', 'step-3', 'step-1', 'step-2']);
      expect(starts(sequence)).toEqual([0, 1900, 9000, 9500]);
    });

    it('should keep steps starting at the same time in the order they are in', () => {
      const sequence = steps(0, [1000], 2000);

      layoutSteps(sequence, 1000);

      expect(uuids(sequence)).toEqual(['step-1', 'step-2', 'step-3']);
      expect(starts(sequence)).toEqual([0, 1000, 2000]);
    });

    it('should take the time an evenly spaced sequence of an older project is apart as its step length', () => {
      const sequence = steps(0, 500, 1000, 1500);

      expect(adoptStepsLength(sequence)).toBe(500);
      expect(sequence.map((presetStep) => presetStep.ownStart)).toEqual([false, false, false, false]);
      expect(starts(sequence)).toEqual([0, 500, 1000, 1500]);
    });

    it('should take the step length which puts most steps of an older project on its grid, leaving the rest where they are', () => {
      const sequence = steps(0, 1000, 2000, 3500);

      expect(adoptStepsLength(sequence)).toBe(1000);
      expect(sequence.map((presetStep) => presetStep.ownStart)).toEqual([false, false, false, true]);
      expect(starts(sequence)).toEqual([0, 1000, 2000, 3500]);
    });

    it('should leave all steps of an older project where they are, even when none of them is on a grid', () => {
      const sequence = steps(100, 300, 1000);

      // the time reached first, when no time puts more steps on its grid than another
      expect(adoptStepsLength(sequence)).toBe(200);
      expect(sequence.map((presetStep) => presetStep.ownStart)).toEqual([true, true, true]);
      expect(starts(sequence)).toEqual([100, 300, 1000]);
    });

    it('should give an older project whose steps are not apart at all the default step length', () => {
      const single = steps(500);
      expect(adoptStepsLength(single)).toBe(1000);
      expect(single[0].ownStart).toBe(true);

      const together = steps(0, 0);
      expect(adoptStepsLength(together)).toBe(1000);
      expect(together.map((presetStep) => presetStep.ownStart)).toEqual([false, true]);

      expect(adoptStepsLength([])).toBe(1000);
    });
  });
});
