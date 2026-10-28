import { Subject } from 'rxjs';

import { EffectCurve } from '../../models/effect-curve';
import { EffectCurveComponent } from './effect-curve.component';

// a canvas context that only counts what the grid draws on it: every mark of the chase
// is a filled circle
class CountingContext {
  public markCount = 0;

  clearRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fill() {}

  arc() {
    this.markCount++;
  }
}

// the component, built without the injector of the designer around it: the grid only
// reads the fixtures of the preset, the tempo of the composition and the time to draw at
function gridComponent(curve: EffectCurve, fixtureCount: number): { component: EffectCurveComponent; context: CountingContext } {
  const presetService: any = {
    fixtureSelectionChanged: new Subject<void>(),
    selectedPreset: {},
    getPresetFixtureCount: () => fixtureCount,
  };
  const animationService: any = { timeMillis: 0 };
  const translate: any = { onLangChange: new Subject<void>() };
  const effectService: any = { effectsOpenChanged: new Subject<void>(), effectsOpen: false };
  const timelineService: any = { selectedComposition: undefined };
  const livePreviewService: any = { previewLive: () => {} };
  const unused: any = undefined;

  const component = new EffectCurveComponent(
    presetService,
    animationService,
    unused,
    translate,
    effectService,
    unused,
    livePreviewService,
    unused,
    timelineService
  );

  component.curve = curve;

  const context = new CountingContext();
  const internals: any = component;
  internals.ctx = context;
  internals.maxWidth = 200;
  internals.maxHeight = 100;

  return { component, context };
}

// a chase over four fixtures, shifted by a fixed time from one step to the next
function chasingCurve(): EffectCurve {
  const curve = new EffectCurve();
  curve.phasingMode = 'millis';
  curve.phasingMillis = 200;

  return curve;
}

describe('EffectCurveComponent grid', () => {
  it('should mark each fixture of a chase', () => {
    const { component, context } = gridComponent(chasingCurve(), 4);

    component.redraw();

    expect(context.markCount).toBe(4);
  });

  it('should mark each group of a chase once', () => {
    const curve = chasingCurve();
    curve.phasingGroupSize = 2;

    const { component, context } = gridComponent(curve, 4);

    component.redraw();

    // the fixtures of a group run the same step of the chase -> four fixtures grouped in
    // pairs leave two marks, not four
    expect(context.markCount).toBe(2);
  });

  it('should leave a single mark on a preset the chase groups completely', () => {
    const curve = chasingCurve();
    curve.phasingGroupSize = 4;

    const { component, context } = gridComponent(curve, 4);

    component.redraw();

    expect(context.markCount).toBe(1);
  });

  it('should leave a single mark without a chase', () => {
    const curve = chasingCurve();
    curve.phasingMillis = 0;

    const { component, context } = gridComponent(curve, 4);

    component.redraw();

    expect(context.markCount).toBe(1);
  });
});

// the lowest and the highest value the curve puts on its fixtures over a period
function valueRange(curve: EffectCurve): { min: number; max: number } {
  let min = 1;
  let max = 0;

  for (let millis = 0; millis < curve.lengthMillis; millis += 10) {
    const value = curve.getValueAtMillis(millis, 0, 1);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  return { min, max };
}

describe('EffectCurveComponent position', () => {
  it('should move the curve until it rests flat at the bottom or the top', () => {
    const curve = new EffectCurve();
    const { component } = gridComponent(curve, 1);

    component.setPositionReach(0);
    expect(curve.position).toBe(-0.5);
    expect(valueRange(curve).max).toBeCloseTo(0, 9);

    component.setPositionReach(1);
    expect(curve.position).toBe(1.5);
    expect(valueRange(curve).min).toBeCloseTo(1, 9);

    // halfway is the middle, whatever the amplitude
    component.setPositionReach(0.5);
    expect(curve.position).toBe(0.5);
  });

  it('should span the way a curve of any amplitude can be moved', () => {
    const curve = new EffectCurve();
    curve.amplitude = 2;
    const { component } = gridComponent(curve, 1);

    component.setPositionReach(0);
    expect(curve.position).toBe(-1);
    expect(valueRange(curve).max).toBeCloseTo(0, 9);

    // a curve without amplitude is a constant value, which the position sets directly
    curve.amplitude = 0;
    curve.position = 0.3;
    expect(component.positionReach).toBeCloseTo(0.3, 9);
  });

  it('should take a typed position as far as the widest amplitude needs', () => {
    const curve = new EffectCurve();
    const { component } = gridComponent(curve, 1);

    component.setPosition(-2);
    expect(curve.position).toBe(-2);

    component.setPosition(3);
    expect(curve.position).toBe(3);

    // beyond, the curve rests flat in any case
    component.setPosition(3.5);
    expect(curve.position).toBe(3);
  });
});
