import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';
import { BsModalService } from 'ngx-bootstrap/modal';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { ToastrModule } from 'ngx-toastr';
import { Subject } from 'rxjs';

import { profiles } from '../../../../conformance/index';
import { Composition } from '../../models/composition';
import { EffectCurve } from '../../models/effect-curve';
import { EffectCurveProfileChannels } from '../../models/effect-curve-profile-channel';
import { FixtureCapability, FixtureCapabilityColor, FixtureCapabilityType } from '../../models/fixture-capability';
import { PresetFixture } from '../../models/preset-fixture';
import { Project } from '../../models/project';
import { EffectService } from '../../services/effect.service';
import { FixtureService } from '../../services/fixture.service';
import { LivePreviewService } from '../../services/live-preview.service';
import { PresetService } from '../../services/preset.service';
import { ProjectService } from '../../services/project.service';
import { TimelineService } from '../../services/timeline.service';
import { EffectCurveAdvancedComponent } from './effect-curve-advanced/effect-curve-advanced.component';
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

  it('should draw nothing before it has its canvas', () => {
    const { component, context } = gridComponent(chasingCurve(), 4);
    const internals: any = component;
    internals.ctx = undefined;

    component.redraw();

    expect(context.markCount).toBe(0);
  });

  it('should leave no mark once a curve has finished and left the fixtures to the preset', () => {
    const curve = chasingCurve();
    curve.phasingMillis = 0;
    curve.lengthMillis = 1000;
    curve.runMode = 'cycles';
    curve.endMode = 'base';

    const { component, context } = gridComponent(curve, 4);
    const internals: any = component;

    // the grid shows the run and a rest after it
    internals.animationService.timeMillis = 1100;
    component.redraw();
    expect(context.markCount).toBe(0);

    internals.animationService.timeMillis = 900;
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

// The editor of a curve effect, rendered: the shape and the timing of the curve, and the
// capabilities and channels of the fixtures of the preset it drives. The fixtures are a par
// with a dimmer and colors, and a moving head.
describe('EffectCurveComponent', () => {
  let fixture: ComponentFixture<EffectCurveComponent>;
  let component: EffectCurveComponent;
  let element: HTMLElement;
  let curve: EffectCurve;
  let presetService: PresetService;
  let effectService: EffectService;
  let modalService: { show: jasmine.Spy };
  let previewLive: jasmine.Spy;
  let effectsChanged: jasmine.Spy;

  beforeEach(async () => {
    modalService = { show: jasmine.createSpy('show') };

    await TestBed.configureTestingModule({
      declarations: [EffectCurveComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot(), PopoverModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: BsModalService, useValue: modalService },
      ],
    }).compileComponents();

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    const project = new Project({
      fixtureProfiles: ['test/rgb-par', 'test/moving-head'].map((name) => ({ ...JSON.parse(JSON.stringify(profiles[name])), uuid: name })),
      fixtures: [
        { uuid: 'par', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 0 },
        { uuid: 'head', profileUuid: 'test/moving-head', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 10 },
      ],
      presetFixtures: [{ fixtureUuid: 'par' }, { fixtureUuid: 'head' }],
      presets: [{ uuid: 'look', fixtures: [{ fixtureUuid: 'par' }], steps: [{ uuid: 'step' }] }],
    });
    TestBed.inject(ProjectService).project = project;
    TestBed.inject(FixtureService).updateCachedFixtures();

    presetService = TestBed.inject(PresetService);
    presetService.selectedPreset = project.presets[0];

    effectService = TestBed.inject(EffectService);
    effectsChanged = jasmine.createSpy('effectsChanged');
    effectService.effectsChanged.subscribe(effectsChanged);

    curve = new EffectCurve();
    curve.uuid = 'wave';
  });

  afterEach(() => fixture?.destroy());

  async function render() {
    fixture = TestBed.createComponent(EffectCurveComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.componentRef.setInput('curve', curve);
    await update();
  }

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // the moving head joins the par in the preset
  async function addMovingHead() {
    presetService.selectedPreset.fixtures.push(new PresetFixture({ fixtureUuid: 'head' }));
    presetService.fixtureSelectionChanged.next();
    await update();
  }

  // the capabilities (0) and the channels (1)
  function checkboxes(pane: number): HTMLInputElement[] {
    return Array.from(element.querySelectorAll('.tab-pane')[pane].querySelectorAll('input[type="checkbox"]'));
  }

  function labels(pane: number): string[] {
    return Array.from(element.querySelectorAll('.tab-pane')[pane].querySelectorAll('label')).map((label) => label.textContent.trim());
  }

  function capabilityCheckbox(name: string): HTMLInputElement {
    return checkboxes(0)[labels(0).indexOf(name)];
  }

  function channelCheckbox(name: string): HTMLInputElement {
    return checkboxes(1)[labels(1).indexOf(name)];
  }

  // the fields next to the sliders: length, amplitude, position, phase and chase
  function inputs(): HTMLInputElement[] {
    return Array.from(element.querySelectorAll('input.slider-input'));
  }

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  // the curve type, the unit of the length and the one of the chase
  function selects(): HTMLSelectElement[] {
    return Array.from(element.querySelectorAll('select'));
  }

  async function select(selectElement: HTMLSelectElement, value: string) {
    selectElement.value = value;
    selectElement.dispatchEvent(new Event('change'));
    await update();
  }

  const intensity = 'designer.fixtureCapabilityType.Intensity';
  const red = 'designer.fixtureCapabilityType.ColorIntensity, designer.fixtureCapabilityColor.Red';

  it('offers the capabilities of the fixtures of the preset', async () => {
    await render();

    expect(labels(0)).toEqual([
      intensity,
      red,
      'designer.fixtureCapabilityType.ColorIntensity, designer.fixtureCapabilityColor.Green',
      'designer.fixtureCapabilityType.ColorIntensity, designer.fixtureCapabilityColor.Blue',
    ]);

    await addMovingHead();

    expect(labels(0).slice(4)).toEqual(['designer.fixtureCapabilityType.Pan', 'designer.fixtureCapabilityType.Tilt']);
  });

  it('offers nothing to drive while no preset is being edited', async () => {
    presetService.selectedPreset = undefined;
    await render();

    expect(labels(0)).toEqual([]);
    expect(labels(1)).toEqual([]);
  });

  it('checks nothing while it has no curve yet', () => {
    fixture = TestBed.createComponent(EffectCurveComponent);
    component = fixture.componentInstance;

    // the fixtures of the preset change before the curve is handed over
    presetService.fixtureSelectionChanged.next();

    expect(component.capabilityOptions.length).toBe(4);
    expect(component.capabilityOptions.some((option) => option.checked)).toBe(false);
    expect(component.channelOptions.length).toBe(5);
    expect(component.channelOptions.some((option) => option.checked)).toBe(false);
  });

  it('marks the capabilities the curve drives', async () => {
    curve.capabilities = [new FixtureCapability({ type: FixtureCapabilityType.ColorIntensity, color: FixtureCapabilityColor.Red })];
    await render();

    expect(checkboxes(0).map((checkbox) => checkbox.checked)).toEqual([false, true, false, false]);
  });

  it('drives a capability checked, and stops driving it once unchecked', async () => {
    await render();

    capabilityCheckbox(intensity).click();

    expect(curve.capabilities.map((capability) => capability.type)).toEqual([FixtureCapabilityType.Intensity]);
    expect(effectsChanged).toHaveBeenCalled();
    expect(previewLive).toHaveBeenCalled();

    capabilityCheckbox(red).click();
    capabilityCheckbox(intensity).click();

    expect(curve.capabilities.map((capability) => capability.color)).toEqual([FixtureCapabilityColor.Red]);
  });

  it('offers the channels of the fixtures, named after their profile while there are several', async () => {
    await render();

    expect(labels(1)).toEqual(['Dimmer', 'Red', 'Green', 'Blue', 'Strobe']);

    await addMovingHead();

    // the profiles come first, to filter the channels by
    expect(labels(1).slice(0, 2)).toEqual(['RGB par', 'Moving head']);
    expect(labels(1)).toContain('RGB par - Strobe');
    expect(labels(1)).toContain('Moving head - Pan');
  });

  it('leaves out the channels of a profile unchecked', async () => {
    await render();
    await addMovingHead();

    checkboxes(1)[1].click();
    await update();

    expect(labels(1).filter((label) => label.startsWith('Moving head - '))).toEqual([]);
    expect(component.profileChecked(component.availableProfiles[1])).toBe(false);

    checkboxes(1)[1].click();
    await update();

    expect(labels(1)).toContain('Moving head - Pan');
  });

  it('marks the channels the curve drives', async () => {
    curve.channels = [new EffectCurveProfileChannels({ profileUuid: 'test/rgb-par', channels: ['Red'] })];
    await render();

    expect(checkboxes(1).map((checkbox) => checkbox.checked)).toEqual([false, true, false, false, false]);
  });

  it('drives a channel checked, and stops driving it once unchecked', async () => {
    await render();

    channelCheckbox('Strobe').click();
    channelCheckbox('Dimmer').click();

    expect(curve.channels.length).toBe(1);
    expect(curve.channels[0].profileUuid).toBe('test/rgb-par');
    expect(curve.channels[0].channels).toEqual(['Strobe', 'Dimmer']);
    expect(effectsChanged).toHaveBeenCalled();
    expect(previewLive).toHaveBeenCalled();

    channelCheckbox('Strobe').click();

    expect(curve.channels[0].channels).toEqual(['Dimmer']);
  });

  it('names the capabilities and the channels in the language picked', async () => {
    await render();
    await addMovingHead();

    const translateService = TestBed.inject(TranslateService);
    translateService.setTranslation('de', { designer: { fixtureCapabilityType: { Intensity: 'Helligkeit' } } });
    translateService.use('de');
    await update();

    expect(labels(0)[0]).toBe('Helligkeit');
    expect(labels(1)).toContain('RGB par - Strobe');
  });

  it('shapes the curve with the type picked', async () => {
    await render();

    await select(selects()[0], 'triangle');

    expect(curve.curveType).toBe('triangle');
    expect(previewLive).toHaveBeenCalled();
  });

  it('runs over the period typed in, keeping the phase inside it', async () => {
    curve.phaseMillis = 1500;
    await render();

    type(inputs()[0], '1000');

    expect(curve.lengthMillis).toBe(1000);
    expect(curve.phaseMillis).toBe(500);
    expect(previewLive).toHaveBeenCalled();

    for (const typed of ['abc', '19', '600001']) {
      type(inputs()[0], typed);
    }
    expect(curve.lengthMillis).toBe(1000);

    component.setLengthMillisFromSlider(1234.6);
    expect(curve.lengthMillis).toBe(1235);

    component.setLengthMillisFromSlider('abc');
    expect(curve.lengthMillis).toBe(1235);
  });

  it('follows the tempo with a period in beats, keeping its speed and its phase', async () => {
    curve.phaseMillis = 500;
    await render();

    // a beat lasts half a second without a composition to take the tempo from
    expect(component.beatsPerMinute).toBe(EffectCurve.defaultBeatsPerMinute);

    await select(selects()[1], 'beats');

    expect(curve.lengthMode).toBe('beats');
    expect(curve.lengthBeats).toBe(5);
    expect(curve.phaseBeats).toBe(1);
    expect(inputs()[0].value).toBe('5');

    type(inputs()[0], '2');
    expect(curve.lengthBeats).toBe(2);

    for (const typed of ['abc', '0.2', '257']) {
      type(inputs()[0], typed);
    }
    expect(curve.lengthBeats).toBe(2);

    component.setLengthBeatsFromSlider(0.5);
    expect(curve.lengthBeats).toBe(0.5);

    // the phase is kept inside the shorter period
    expect(curve.phaseBeats).toBe(0);

    component.setLengthBeatsFromSlider('abc');
    expect(curve.lengthBeats).toBe(0.5);
  });

  it('goes back to a fixed period at the tempo of the composition', async () => {
    TestBed.inject(TimelineService).selectedComposition = new Composition({ beatsPerMinute: 60 });
    curve.lengthMode = 'beats';
    curve.lengthBeats = 3;
    curve.phaseBeats = 1.5;
    await render();

    expect(component.beatsPerMinute).toBe(60);

    await select(selects()[1], 'millis');

    expect(curve.lengthMillis).toBe(3000);
    expect(curve.phaseMillis).toBe(1500);

    // picking the unit it already has changes nothing
    component.setLengthMode('millis');
    expect(curve.lengthMillis).toBe(3000);
  });

  it('keeps a period switched to beats inside what the beats can take', async () => {
    curve.lengthMillis = 600000;
    await render();

    component.setLengthMode('beats');

    expect(curve.lengthBeats).toBe(256);
  });

  it('sets the phase as the part of the period it shifts the curve by', async () => {
    await render();

    component.setPhaseCycles(0.5);
    expect(curve.phaseMillis).toBe(1250);
    expect(component.phaseCycles).toBe(0.5);

    component.setPhaseCycles('abc');
    expect(curve.phaseMillis).toBe(1250);

    curve.lengthMode = 'beats';
    component.setPhaseCycles(-0.25);
    expect(curve.phaseBeats).toBe(-1);
    expect(component.phaseCycles).toBe(-0.25);

    // a period of nothing has no phase
    curve.lengthBeats = 0;
    expect(component.phaseCycles).toBe(0);
    curve.lengthMode = 'millis';
    curve.lengthMillis = 0;
    expect(component.phaseCycles).toBe(0);
  });

  it('takes a phase typed in as long as it stays inside the period', async () => {
    await render();

    type(inputs()[3], '-2500');
    expect(curve.phaseMillis).toBe(-2500);

    type(inputs()[3], '2501');
    expect(curve.phaseMillis).toBe(-2500);

    curve.lengthMode = 'beats';
    await update();

    type(inputs()[3], '3');
    expect(curve.phaseBeats).toBe(3);

    type(inputs()[3], '4.5');
    expect(curve.phaseBeats).toBe(3);
  });

  it('takes an amplitude and a position typed in as long as the sliders could reach them', async () => {
    await render();

    type(inputs()[1], '2');
    type(inputs()[2], '-1.5');

    expect(curve.amplitude).toBe(2);
    expect(curve.position).toBe(-1.5);
    expect(previewLive).toHaveBeenCalled();

    for (const typed of ['abc', '-0.1', '4.1']) {
      type(inputs()[1], typed);
    }
    for (const typed of ['abc', '-2.1', '3.1']) {
      type(inputs()[2], typed);
    }

    expect(curve.amplitude).toBe(2);
    expect(curve.position).toBe(-1.5);

    component.setPositionReach('abc');
    expect(curve.position).toBe(-1.5);
  });

  it('chases by a time, by beats, or by cycles spread over the fixtures', async () => {
    await render();

    type(inputs()[4], '-300');
    expect(curve.phasingMillis).toBe(-300);
    type(inputs()[4], '60001');
    expect(curve.phasingMillis).toBe(-300);

    await select(selects()[2], 'beats');
    expect(curve.phasingMode).toBe('beats');

    type(inputs()[4], '2');
    expect(curve.phasingBeats).toBe(2);
    type(inputs()[4], '65');
    expect(curve.phasingBeats).toBe(2);

    await select(selects()[2], 'spread');
    expect(curve.phasingMode).toBe('spread');

    type(inputs()[4], '-2');
    expect(curve.phasingCycles).toBe(-2);
    type(inputs()[4], '4.5');
    expect(curve.phasingCycles).toBe(-2);

    expect(previewLive).toHaveBeenCalled();
  });

  it('marks the advanced settings while they hold anything else than their defaults', async () => {
    await render();
    const button = () => element.querySelector('a.btn') as HTMLElement;

    expect(component.advancedActive()).toBe(false);
    expect(button().classList).toContain('btn-secondary');

    for (const change of [() => (curve.runMode = 'cycles'), () => (curve.dutyCycle = 0.3), () => (curve.phasingGroupSize = 2)]) {
      const defaults = new EffectCurve();
      curve.runMode = defaults.runMode;
      curve.dutyCycle = defaults.dutyCycle;
      curve.phasingGroupSize = defaults.phasingGroupSize;

      change();
      expect(component.advancedActive()).toBe(true);
    }

    await update();
    expect(button().classList).toContain('btn-primary');
  });

  it('opens the advanced settings of the curve', async () => {
    await render();

    (element.querySelector('a.btn') as HTMLElement).click();

    expect(modalService.show).toHaveBeenCalledWith(EffectCurveAdvancedComponent, jasmine.objectContaining({ initialState: { curve } }));
  });

  it('only redraws the grid on every frame while the effect is open in the opened effects tab', async () => {
    await render();
    const redraw = spyOn(component, 'redraw').and.callThrough();

    const isSelected = (selected: boolean) => {
      fixture.componentRef.setInput('isSelected', selected);
      fixture.detectChanges();
    };

    const effectsOpen = (open: boolean) => {
      effectService.effectsOpen = open;
      effectService.effectsOpenChanged.next();
    };

    // whether the grid is redrawn over the next frames
    const redrawn = async () => {
      redraw.calls.reset();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return redraw.calls.count() > 0;
    };

    isSelected(true);
    expect(await redrawn()).toBe(false);

    effectsOpen(true);
    expect(await redrawn()).toBe(true);

    effectsOpen(false);
    expect(await redrawn()).toBe(false);

    // opening it twice still runs a single animation, which closing the effect stops
    effectsOpen(true);
    effectsOpen(true);
    isSelected(false);
    expect(await redrawn()).toBe(false);

    isSelected(true);
    fixture.destroy();
    expect(await redrawn()).toBe(false);
  });

  it('stops following the preset once it is gone', async () => {
    await render();
    fixture.destroy();

    presetService.selectedPreset.fixtures.push(new PresetFixture({ fixtureUuid: 'head' }));
    presetService.fixtureSelectionChanged.next();

    expect(component.capabilityOptions.length).toBe(4);
  });
});
