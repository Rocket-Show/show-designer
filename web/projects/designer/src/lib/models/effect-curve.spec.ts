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

// a curve of a second around the middle, at the default amplitude
function curve(curveType: string): EffectCurve {
  const curve = new EffectCurve();
  curve.curveType = curveType;
  curve.lengthMillis = 1000;

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

  it('should swing every curve over its whole amplitude, like the square', () => {
    const sine = curve('sine');
    expect(sine.getValueAtMillis(0, 0, 1)).toBeCloseTo(0.5, 9);
    expect(sine.getValueAtMillis(250, 0, 1)).toBeCloseTo(1, 9);
    expect(sine.getValueAtMillis(500, 0, 1)).toBeCloseTo(0.5, 9);
    expect(sine.getValueAtMillis(750, 0, 1)).toBeCloseTo(0, 9);

    const square = curve('square');
    expect(square.getValueAtMillis(100, 0, 1)).toBeCloseTo(1, 9);
    expect(square.getValueAtMillis(600, 0, 1)).toBeCloseTo(0, 9);

    const triangle = curve('triangle');
    expect(triangle.getValueAtMillis(250, 0, 1)).toBeCloseTo(1, 9);
    expect(triangle.getValueAtMillis(750, 0, 1)).toBeCloseTo(0, 9);

    const sawtooth = curve('sawtooth');
    expect(sawtooth.getValueAtMillis(0, 0, 1)).toBeCloseTo(0, 9);
    expect(sawtooth.getValueAtMillis(500, 0, 1)).toBeCloseTo(0.5, 9);

    const reverseSawtooth = curve('reverse-sawtooth');
    expect(reverseSawtooth.getValueAtMillis(0, 0, 1)).toBeCloseTo(1, 9);
    expect(reverseSawtooth.getValueAtMillis(500, 0, 1)).toBeCloseTo(0.5, 9);
  });

  it('should keep a sine and a triangle symmetric around their peak at any width', () => {
    for (const curveType of ['sine', 'triangle']) {
      for (const dutyCycle of [0.1, 0.3, 0.7, 0.9]) {
        const shaped = curve(curveType);
        shaped.dutyCycle = dutyCycle;

        // the peak stays where it is
        expect(shaped.getValueAtMillis(250, 0, 1)).toBeCloseTo(1, 9);

        for (let fromPeak = 10; fromPeak <= 500; fromPeak += 10) {
          expect(shaped.getValueAtMillis(250 - fromPeak, 0, 1)).toBeCloseTo(shaped.getValueAtMillis(250 + fromPeak, 0, 1), 9);
        }
      }
    }
  });

  it('should run the square in phase with the sine', () => {
    for (const dutyCycle of [0.1, 0.5, 0.9]) {
      const sine = curve('sine');
      const square = curve('square');
      sine.dutyCycle = dutyCycle;
      square.dutyCycle = dutyCycle;

      // on while the sine is above its position
      for (let millis = 0.5; millis < 1000; millis++) {
        expect(square.getValueAtMillis(millis, 0, 1)).toBe(sine.getValueAtMillis(millis, 0, 1) > 0.5 ? 1 : 0);
      }
    }
  });

  it('should narrow and widen a square around its middle', () => {
    const square = curve('square');

    // on from 200 to 300
    square.dutyCycle = 0.1;
    expect(square.getValueAtMillis(199, 0, 1)).toBe(0);
    expect(square.getValueAtMillis(201, 0, 1)).toBe(1);
    expect(square.getValueAtMillis(299, 0, 1)).toBe(1);
    expect(square.getValueAtMillis(301, 0, 1)).toBe(0);

    // off from 700 to 800
    square.dutyCycle = 0.9;
    expect(square.getValueAtMillis(0, 0, 1)).toBe(1);
    expect(square.getValueAtMillis(699, 0, 1)).toBe(1);
    expect(square.getValueAtMillis(701, 0, 1)).toBe(0);
    expect(square.getValueAtMillis(799, 0, 1)).toBe(0);
    expect(square.getValueAtMillis(801, 0, 1)).toBe(1);
  });

  it('should ramp a narrow sawtooth up right before its jump', () => {
    const sawtooth = curve('sawtooth');
    sawtooth.dutyCycle = 0.2;

    // at the bottom until the ramp, which takes twice the width
    expect(sawtooth.getValueAtMillis(300, 0, 1)).toBeCloseTo(0, 9);
    expect(sawtooth.getValueAtMillis(600, 0, 1)).toBeCloseTo(0, 9);
    expect(sawtooth.getValueAtMillis(800, 0, 1)).toBeCloseTo(0.5, 9);
    expect(sawtooth.getValueAtMillis(900, 0, 1)).toBeCloseTo(0.75, 9);
  });

  it('should rest a wide sawtooth at its top before its jump', () => {
    const sawtooth = curve('sawtooth');
    sawtooth.dutyCycle = 0.8;

    expect(sawtooth.getValueAtMillis(0, 0, 1)).toBeCloseTo(0, 9);
    expect(sawtooth.getValueAtMillis(200, 0, 1)).toBeCloseTo(0.5, 9);
    expect(sawtooth.getValueAtMillis(400, 0, 1)).toBeCloseTo(1, 9);
    expect(sawtooth.getValueAtMillis(900, 0, 1)).toBeCloseTo(1, 9);
  });

  it('should run a reverse sawtooth as the sawtooth backwards at any width', () => {
    const reverseSawtooth = curve('reverse-sawtooth');

    reverseSawtooth.dutyCycle = 0.2;
    expect(reverseSawtooth.getValueAtMillis(0, 0, 1)).toBeCloseTo(1, 9);
    expect(reverseSawtooth.getValueAtMillis(200, 0, 1)).toBeCloseTo(0.5, 9);
    expect(reverseSawtooth.getValueAtMillis(500, 0, 1)).toBeCloseTo(0, 9);

    reverseSawtooth.dutyCycle = 0.8;
    expect(reverseSawtooth.getValueAtMillis(300, 0, 1)).toBeCloseTo(1, 9);
    expect(reverseSawtooth.getValueAtMillis(800, 0, 1)).toBeCloseTo(0.5, 9);
  });

  it('should keep every curve on over its width', () => {
    for (const curveType of ['sine', 'triangle', 'square', 'sawtooth', 'reverse-sawtooth']) {
      for (const dutyCycle of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const shaped = curve(curveType);
        shaped.dutyCycle = dutyCycle;

        let onCount = 0;

        for (let millis = 0.5; millis < 1000; millis++) {
          if (shaped.getValueAtMillis(millis, 0, 1) > 0.5) {
            onCount++;
          }
        }

        expect(onCount).toBe(Math.round(dutyCycle * 1000));
      }
    }
  });

  it('should rest a narrow sine at its bottom', () => {
    const sine = curve('sine');
    sine.dutyCycle = 0.2;

    // a full swing over twice the width around the peak, crossing the middle at the
    // borders of the width
    expect(sine.getValueAtMillis(150, 0, 1)).toBeCloseTo(0.5, 9);
    expect(sine.getValueAtMillis(350, 0, 1)).toBeCloseTo(0.5, 9);
    expect(sine.getValueAtMillis(50, 0, 1)).toBeCloseTo(0, 9);

    // and at the bottom over the rest of the period
    expect(sine.getValueAtMillis(0, 0, 1)).toBeCloseTo(0, 9);
    expect(sine.getValueAtMillis(500, 0, 1)).toBeCloseTo(0, 9);
    expect(sine.getValueAtMillis(750, 0, 1)).toBeCloseTo(0, 9);
  });

  it('should rest a wide sine at its top', () => {
    const sine = curve('sine');
    sine.dutyCycle = 0.8;

    expect(sine.getValueAtMillis(0, 0, 1)).toBeCloseTo(1, 9);
    expect(sine.getValueAtMillis(500, 0, 1)).toBeCloseTo(1, 9);
    expect(sine.getValueAtMillis(650, 0, 1)).toBeCloseTo(0.5, 9);
    expect(sine.getValueAtMillis(750, 0, 1)).toBeCloseTo(0, 9);
    expect(sine.getValueAtMillis(850, 0, 1)).toBeCloseTo(0.5, 9);
  });

  it('should hold every curve flat at the ends of the width', () => {
    for (const curveType of ['sine', 'triangle', 'square', 'sawtooth', 'reverse-sawtooth']) {
      const shaped = curve(curveType);

      for (let millis = 0; millis < 1000; millis += 50) {
        shaped.dutyCycle = 0;
        expect(shaped.getValueAtMillis(millis, 0, 1)).toBeCloseTo(0, 9);

        shaped.dutyCycle = 1;
        expect(shaped.getValueAtMillis(millis, 0, 1)).toBeCloseTo(1, 9);
      }
    }
  });

  it('should rest a curve flat at the bottom or the top beyond the middle', () => {
    const sine = curve('sine');

    sine.position = -0.5;
    for (let millis = 0; millis < 1000; millis += 50) {
      expect(sine.getValueAtMillis(millis, 0, 1)).toBeCloseTo(0, 9);
    }

    sine.position = 1.5;
    for (let millis = 0; millis < 1000; millis += 50) {
      expect(sine.getValueAtMillis(millis, 0, 1)).toBeCloseTo(1, 9);
    }
  });
});
