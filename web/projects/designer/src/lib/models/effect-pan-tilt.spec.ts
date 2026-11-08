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

  it('fans the movement over the fixtures by their place in the fan', () => {
    const opposite = new EffectPanTilt({ uuid: 'fan', shape: 'line', sizePanDegrees: 90, sizeTiltDegrees: 0, fanMode: 'linear' });

    expect(opposite.isFanned()).toBe(true);
    expect(opposite.getFanFactor(0)).toBe(-1);
    expect(opposite.getFanFactor(0.5)).toBe(0);
    expect(opposite.getFanFactor(1)).toBe(1);

    // a quarter of the way: the first and the last head all the way to opposite sides, the one in the middle still
    expect(opposite.getOffsetAtMillis(625, 0, 3).pan).toBeCloseTo(-45, 9);
    expect(opposite.getOffsetAtMillis(625, 1, 3).pan).toBeCloseTo(0, 9);
    expect(opposite.getOffsetAtMillis(625, 2, 3).pan).toBeCloseTo(45, 9);
    // three quarters: the other way round, which closes the fan of the step and crosses the heads over beyond it
    expect(opposite.getOffsetAtMillis(1875, 0, 3).pan).toBeCloseTo(45, 9);
    expect(opposite.getOffsetAtMillis(1875, 2, 3).pan).toBeCloseTo(-45, 9);

    // from the middle, the ends the same way
    const alike = new EffectPanTilt({ uuid: 'alike', shape: 'line', sizePanDegrees: 90, fanMode: 'center' });
    expect(alike.getOffsetAtMillis(625, 0, 3).pan).toBeCloseTo(45, 9);
    expect(alike.getOffsetAtMillis(625, 1, 3).pan).toBeCloseTo(0, 9);
    expect(alike.getOffsetAtMillis(625, 2, 3).pan).toBeCloseTo(45, 9);

    // from the side: the first head doesn't move, the last one the whole size
    const fromSide = new EffectPanTilt({ uuid: 'side', shape: 'line', sizePanDegrees: 90, sizeTiltDegrees: 40, fanMode: 'side' });
    expect(fromSide.getFanFactor(0)).toBe(0);
    expect(fromSide.getFanFactor(0.25)).toBe(0.25);
    expect(fromSide.getOffsetAtMillis(625, 4, 5).tilt).toBeCloseTo(20, 9);
    expect(fromSide.getOffsetAtMillis(625, 1, 5).pan).toBeCloseTo(11.25, 9);

    // its place on the stage, if the preset fans by it: NaN where the fixtures can't be told apart, which don't move
    expect(fromSide.getOffsetAtMillis(625, 0, 5, undefined, 1).pan).toBeCloseTo(45, 9);
    expect(fromSide.getOffsetAtMillis(625, 4, 5, undefined, NaN).pan).toBe(0);

    // a single head can't be told apart from others: it stays where the step points it
    expect(opposite.getOffsetAtMillis(625, 0, 1).pan).toBe(0);
    expect(fromSide.getFanFactor(undefined)).toBe(0);
  });

  it('moves all the heads the same way unless it is fanned', () => {
    const panTilt = new EffectPanTilt({ uuid: 'old', shape: 'line', fanMode: null });

    expect(panTilt.fanMode).toBe('none');
    expect(panTilt.isFanned()).toBe(false);
    expect(panTilt.getFanFactor(0)).toBe(1);
    expect(panTilt.getOffsetAtMillis(625, 0, 3)).toEqual(panTilt.getOffsetAtMillis(625, 2, 3));
    expect(new EffectPanTilt().fanMode).toBe('none');
  });
});
