import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { EffectCurve } from '../../models/effect-curve';
import { EffectCurveComponent } from './effect-curve.component';

describe('EffectCurveComponent', () => {
  let component: EffectCurveComponent;
  let fixture: ComponentFixture<EffectCurveComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [EffectCurveComponent],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(EffectCurveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

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
  const unused: any = undefined;

  const component = new EffectCurveComponent(
    presetService,
    animationService,
    unused,
    translate,
    effectService,
    unused,
    unused,
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
