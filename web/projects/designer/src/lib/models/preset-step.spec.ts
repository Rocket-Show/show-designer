import { getTransitionEndMillis, PresetStep } from './preset-step';

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
});
