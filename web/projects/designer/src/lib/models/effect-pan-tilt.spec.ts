import { EffectPanTilt } from './effect-pan-tilt';

describe('EffectPanTilt', () => {
  it('moves in a circle by default, on the timing of a curve', () => {
    const panTilt = new EffectPanTilt({ uuid: 'circle' });

    expect(panTilt.type).toBe('pan-tilt');
    expect(panTilt.visible).toBe(true);
    expect(panTilt.shape).toBe('circle');
    expect(panTilt.lengthMillis).toBe(2500);

    // a quarter of the way: all the way to one side, in the middle of the tilt
    const quarter = panTilt.getOffsetAtMillis(625);
    expect(quarter.pan).toBeCloseTo(30, 9);
    expect(quarter.tilt).toBeCloseTo(0, 9);

    // at the start: in the middle of the pan, all the way up
    const start = panTilt.getOffsetAtMillis(0);
    expect(start.pan).toBeCloseTo(0, 9);
    expect(start.tilt).toBeCloseTo(15, 9);
  });

  it('draws a figure 8, a line and a wave', () => {
    const figure8 = new EffectPanTilt({ uuid: 'figure8', shape: 'figure8', sizePanDegrees: 40, sizeTiltDegrees: 20 });
    // the tilt swings twice while the pan swings once
    expect(figure8.getShapePosition(0.125).tilt).toBeCloseTo(1, 9);
    expect(figure8.getShapePosition(0.25).pan).toBeCloseTo(1, 9);
    expect(figure8.getShapePosition(0.25).tilt).toBeCloseTo(0, 9);

    const line = new EffectPanTilt({ uuid: 'line', shape: 'line' });
    expect(line.getShapePosition(0.25)).toEqual({ pan: 1, tilt: 1 });

    const wave = new EffectPanTilt({ uuid: 'wave', shape: 'wave' });
    // nods three times on the way
    expect(wave.getShapePosition(1 / 12).tilt).toBeCloseTo(1, 9);
    expect(wave.getShapePosition(0.25).pan).toBeCloseTo(1, 9);
  });

  it('chases over the fixtures and stops after its run like a curve', () => {
    const panTilt = new EffectPanTilt({
      uuid: 'chase',
      sizePanDegrees: 100,
      phasingMode: 'spread',
      phasingCycles: 1,
      runMode: 'cycles',
      runCycles: 1,
      endMode: 'base',
    });

    // the second of four fixtures is a quarter of a cycle behind the first
    expect(panTilt.getOffsetAtMillis(625, 1, 4).pan).toBeCloseTo(0, 9);
    expect(panTilt.getOffsetAtMillis(625, 0, 4).pan).toBeCloseTo(50, 9);

    // over after its cycle, which leaves the fixtures to the rest of the preset
    expect(panTilt.getOffsetAtMillis(2600, 0, 4)).toBeUndefined();
  });

  it('keeps the defaults for a value missing or null', () => {
    const panTilt = new EffectPanTilt({ uuid: 'old', shape: null, sizePanDegrees: null, sizeTiltDegrees: null });

    expect(panTilt.shape).toBe('circle');
    expect(panTilt.sizePanDegrees).toBe(60);
    expect(panTilt.sizeTiltDegrees).toBe(30);
  });
});
