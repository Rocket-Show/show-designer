import { EffectCurve } from './effect-curve';

// a curve on a fixed period, so the tempo must not reach it
function timedCurve(): EffectCurve {
  const curve = new EffectCurve();
  curve.lengthMillis = 2000;
  curve.phaseMillis = 500;

  return curve;
}

// the same curve, measured in beats instead
function beatCurve(): EffectCurve {
  const curve = new EffectCurve();
  curve.lengthMode = 'beats';
  curve.lengthBeats = 4;

  return curve;
}

describe('EffectCurve', () => {
  it('should measure a beat by the tempo', () => {
    expect(EffectCurve.getBeatMillis(120)).toBe(500);
    expect(EffectCurve.getBeatMillis(60)).toBe(1000);
  });

  it('should fall back to the default tempo without a composition to take one from', () => {
    const fallback = EffectCurve.getBeatMillis(EffectCurve.defaultBeatsPerMinute);

    expect(EffectCurve.getBeatMillis(undefined)).toBe(fallback);
    expect(EffectCurve.getBeatMillis(0)).toBe(fallback);
  });

  it('should hold the period of a curve that does not follow the tempo', () => {
    const curve = timedCurve();

    expect(curve.isBeatSynced()).toBe(false);
    expect(curve.getLengthMillis(120)).toBe(2000);
    expect(curve.getLengthMillis(60)).toBe(2000);
    expect(curve.getPhaseMillis(60)).toBe(500);
  });

  it('should take the period of a synced curve from the tempo', () => {
    const curve = beatCurve();

    expect(curve.isBeatSynced()).toBe(true);
    // a bar of 4 beats
    expect(curve.getLengthMillis(120)).toBe(2000);
    expect(curve.getLengthMillis(60)).toBe(4000);
    expect(curve.getLengthMillis(240)).toBe(1000);
  });

  it('should keep a synced curve at the same place in its period when the tempo changes', () => {
    const curve = beatCurve();
    curve.phaseBeats = 1;

    // half the tempo runs the curve half as fast, so it stands at the same place in its
    // period at twice the time
    for (let cyclePosition = 0; cyclePosition < 1; cyclePosition += 0.05) {
      const fast = curve.getValueAtMillis(cyclePosition * 2000, 0, 1, 120);
      const slow = curve.getValueAtMillis(cyclePosition * 4000, 0, 1, 60);

      expect(slow).toBeCloseTo(fast, 10);
    }
  });

  it('should run a synced curve for the cycles it is given, however fast they are', () => {
    const curve = beatCurve();
    curve.runMode = 'cycles';
    curve.runCycles = 2;

    expect(curve.getRunEndMillis(120)).toBe(4000);
    expect(curve.getRunEndMillis(60)).toBe(8000);
  });

  it('should chase a synced curve by the beat', () => {
    const curve = beatCurve();
    curve.phasingMode = 'beats';
    curve.phasingBeats = 1;

    expect(curve.getPhasingMillis(0, 4, 120)).toBe(0);
    expect(curve.getPhasingMillis(1, 4, 120)).toBe(500);
    expect(curve.getPhasingMillis(2, 4, 120)).toBe(1000);
    // half the tempo makes every beat twice as long
    expect(curve.getPhasingMillis(2, 4, 60)).toBe(2000);
  });

  it('should chase against the direction on a negative beat', () => {
    const curve = beatCurve();
    curve.phasingMode = 'beats';
    curve.phasingBeats = -0.5;

    expect(curve.getPhasingMillis(1, 4, 120)).toBe(-250);
  });

  it('should spread a chase over the period the tempo gives it', () => {
    const curve = beatCurve();
    curve.phasingMode = 'spread';
    curve.phasingCycles = 1;

    // one full cycle distributed over four fixtures
    expect(curve.getPhasingMillis(1, 4, 120)).toBe(500);
    expect(curve.getPhasingMillis(1, 4, 60)).toBe(1000);
  });

  it('should leave a curve on a fixed period untouched by the tempo', () => {
    const curve = timedCurve();
    curve.phasingMode = 'millis';
    curve.phasingMillis = 100;

    expect(curve.getPhasingMillis(1, 4, 60)).toBe(100);
    expect(curve.getValueAtMillis(700, 1, 4, 60)).toBe(curve.getValueAtMillis(700, 1, 4, 240));
  });

  it('should hold the fixtures of a group on the same step of the chase', () => {
    const curve = timedCurve();
    curve.phasingMode = 'millis';
    curve.phasingMillis = 100;
    curve.phasingGroupSize = 2;

    // two fixtures per group leaves four fixtures with two steps
    expect(curve.getPhasingMillis(0, 4, 120)).toBe(0);
    expect(curve.getPhasingMillis(1, 4, 120)).toBe(0);
    expect(curve.getPhasingMillis(2, 4, 120)).toBe(100);
    expect(curve.getPhasingMillis(3, 4, 120)).toBe(100);
  });

  it('should divide the fixtures of a preset into chase steps', () => {
    const curve = timedCurve();

    curve.phasingGroupSize = 1;
    expect(curve.getPhasingStepCount(4)).toBe(4);

    curve.phasingGroupSize = 2;
    expect(curve.getPhasingStepCount(4)).toBe(2);

    // a group the fixtures do not fill completely still runs as a step of its own
    expect(curve.getPhasingStepCount(5)).toBe(3);

    // a group holding all fixtures leaves a single step, which is not a chase anymore
    curve.phasingGroupSize = 8;
    expect(curve.getPhasingStepCount(4)).toBe(1);
  });

  it('should shift the steps of a grouped chase against each other', () => {
    const curve = timedCurve();
    curve.phasingMode = 'millis';
    curve.phasingMillis = 100;
    curve.phasingGroupSize = 2;

    // the second group runs a step later, however many fixtures it holds
    expect(curve.getPhasingStepMillis(0, 4, 120)).toBe(0);
    expect(curve.getPhasingStepMillis(1, 4, 120)).toBe(100);
  });

  it('should spread a chase over the groups instead of the fixtures', () => {
    const curve = timedCurve();
    curve.phasingMode = 'spread';
    curve.phasingCycles = 1;
    curve.phasingGroupSize = 2;

    // one full cycle distributed over the two groups of four fixtures
    expect(curve.getPhasingMillis(2, 4, 120)).toBe(1000);
    expect(curve.getPhasingStepMillis(1, 4, 120)).toBe(1000);
  });

  it('should read a project written before the curves could follow a tempo', () => {
    const curve = new EffectCurve({
      lengthMillis: 1000,
      phaseMillis: 0,
      amplitude: 1,
      position: 0.5,
      phasingMillis: 0,
      curveType: 'sine',
    });

    expect(curve.lengthMode).toBe('millis');
    expect(curve.isBeatSynced()).toBe(false);
    expect(curve.phaseBeats).toBe(0);
    expect(curve.phasingBeats).toBe(0);
    expect(curve.getLengthMillis(60)).toBe(1000);
  });
});
