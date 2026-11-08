import { FixtureCapabilityValue } from '../../models/fixture-capability-value';
import { pixelPatternsForBars, pixelPatternsForMatrices } from '../../models/pixel-pattern';
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
import { EffectPanTilt } from '../../models/effect-pan-tilt';
import { EffectPixel } from '../../models/effect-pixel';
import { PixelContext } from '../../models/pixel-pattern';
import { By } from '@angular/platform-browser';
import { GradientEditorComponent } from '../../gradient-editor/gradient-editor.component';
import { ColorPickerComponent } from '../../color-picker/color-picker.component';
import { PixelPaletteStop } from '../../models/pixel-palette';

// a canvas context that only counts what the grid draws on it: every mark of the chase
// is a filled circle
class CountingContext {
  public markCount = 0;

  // the dashed lines of the grid behind the curve
  public gridLines = 0;
  private dashed = false;

  clearRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  fill() {}
  save() {}

  restore() {
    this.dashed = false;
  }

  setLineDash(dash: number[]) {
    this.dashed = dash.length > 0;
  }

  stroke() {
    if (this.dashed) {
      this.gridLines++;
    }
  }

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
    timelineService,
    unused
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
  it('should draw the middle of the curve and the borders of its cycles behind it', () => {
    // a period of 2.5 s, shown twice: the middle and the border between the two cycles
    const { component, context } = gridComponent(new EffectCurve(), 1);

    component.redraw();

    expect(context.gridLines).toBe(2);

    // a short period running for seconds, hundreds of cycles on the grid: the middle alone
    const short = new EffectCurve();
    short.lengthMillis = 20;
    short.runMode = 'duration';
    short.runDurationMillis = 5000;
    const shortGrid = gridComponent(short, 1);
    shortGrid.component.redraw();
    expect(shortGrid.context.gridLines).toBe(1);
  });

  it('should draw a movement of the moving heads on the middle of both axes, each step of its chase marked', () => {
    const movement = new EffectPanTilt({ uuid: 'move', shape: 'figure8', phasingMode: 'spread', phasingCycles: 1 });
    const { component, context } = gridComponent(movement, 4);

    component.redraw();

    expect(context.gridLines).toBe(2);
    expect(context.markCount).toBe(4);

    // moving all heads together: one mark
    movement.phasingCycles = 0;
    context.markCount = 0;
    component.redraw();
    expect(context.markCount).toBe(1);

    // a movement which has run its cycle, leaving the heads to the preset
    movement.runMode = 'cycles';
    movement.endMode = 'base';
    (component as any).animationService.timeMillis = 2600;
    context.markCount = 0;
    component.redraw();
    expect(context.markCount).toBe(0);
  });

  it('should mark each head of a fanned movement, all of them moving together', () => {
    const movement = new EffectPanTilt({ uuid: 'fan', shape: 'line', phasingCycles: 0, fanMode: 'linear' });
    const { component, context } = gridComponent(movement, 5);

    component.redraw();

    expect(context.markCount).toBe(5);
  });

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

// a canvas context which keeps the color of each cell the preview of a pixel effect fills, from the left
// (the cells are filled in rgb(), the housing around them in hex), and how often the glow of the lit ones is drawn over them
class PixelContextRecorder {
  public fillStyle = '';
  public strokeStyle = '';
  public lineWidth = 1;
  public filter = 'none';
  public globalAlpha = 1;
  public globalCompositeOperation = 'source-over';
  public imageSmoothingEnabled = true;
  public cells: { x: number; color: string }[] = [];
  public glows: HTMLCanvasElement[] = [];
  private pathX: number;

  clearRect() {}
  save() {}
  restore() {}
  setTransform() {}
  arcTo() {}
  closePath() {}
  stroke() {}

  beginPath() {
    this.pathX = undefined;
  }

  moveTo(x: number) {
    this.pathX = this.pathX ?? x;
  }

  fill() {
    if (this.fillStyle.startsWith('rgb(')) {
      this.cells.push({ x: this.pathX, color: this.fillStyle });
    }
  }

  drawImage(image: HTMLCanvasElement) {
    this.glows.push(image);
  }
}

// an unlit pixel, which is drawn dark grey
const PIXEL_OFF = 'rgb(20, 23, 28)';

describe('EffectCurveComponent pixel preview', () => {
  // the component with a bar of three pixels in its preset, which lights in colors
  function pixelPreview(effect: EffectPixel, withBar = true) {
    const parts = [0, 1, 2].map((column) => ({
      fixture: { uuid: 'bar' },
      pixel: { key: String(column + 1) },
      channels: [{ capabilities: [{ capability: { type: FixtureCapabilityType.ColorIntensity } }] }],
      place: Object.assign(new PixelContext(), { x: (column + 0.5) / 3, column, columns: 3, aspectY: 1 / 3 }),
    }));
    const presetService: any = {
      fixtureSelectionChanged: new Subject<void>(),
      selectedPreset: {},
      getPresetWholeFixtureChase: () => ({ indices: new Map([['bar', 0]]), count: 1 }),
      getPresetFixture: () => (withBar ? {} : undefined),
    };
    const fixtureService: any = { cachedFixtures: parts, getPixelPlace: (part: any) => part.place };
    const animationService: any = { timeMillis: 1500 };
    const unused: any = undefined;

    const component = new EffectCurveComponent(
      presetService,
      animationService,
      fixtureService,
      { onLangChange: new Subject<void>() } as any,
      { effectsOpenChanged: new Subject<void>(), effectsOpen: false } as any,
      unused,
      { previewLive: () => {} } as any,
      unused,
      { selectedComposition: undefined } as any,
      { getPresetLightColor: () => '#0000ff' } as any
    );
    component.curve = effect;

    const context = new PixelContextRecorder();
    const internals: any = component;
    internals.ctx = context;
    internals.maxWidth = 200;
    internals.maxHeight = 100;

    return { component, context, presetService };
  }

  it('shows an image on the pixels of the fixtures of the preset, none while it lights none', () => {
    expect(
      pixelPreview(chase())
        .component.pixelImagePictures()
        .map((picture) => [picture.columns, picture.rows])
    ).toEqual([[3, 1]]);
    expect(pixelPreview(chase(), false).component.pixelImagePictures()).toEqual([]);
    // across the stage of a project without fixtures
    expect(pixelPreview(chase({ spread: 'stage' })).component.pixelImagePictures()).toEqual([]);
  });

  // a block of a third of the bar, in red: halfway through its period it is on the middle pixel
  function chase(settings: any = {}): EffectPixel {
    return new EffectPixel({
      pattern: 'chase',
      size: 0.34,
      softness: 0,
      lengthMillis: 3000,
      palette: { stops: [{ position: 0, color: '#ff0000' }] },
      ...settings,
    });
  }

  it('draws the pixels of the fixtures of the preset as the effect lights them', () => {
    const { component, context } = pixelPreview(chase());

    component.redraw();

    expect(context.cells.map((cell) => cell.color)).toEqual([PIXEL_OFF, 'rgb(255, 23, 28)', PIXEL_OFF]);
    expect(context.cells[0].x).toBeLessThan(context.cells[1].x);
  });

  it('lets the lit pixels glow: their colors, a pixel each, are drawn blurred over the fixture', () => {
    const { component, context } = pixelPreview(chase());

    component.redraw();

    expect(context.glows.length).toBe(1);
    const glow = context.glows[0].getContext('2d');
    expect([context.glows[0].width, context.glows[0].height]).toEqual([3, 1]);
    expect(Array.from(glow.getImageData(0, 0, 3, 1).data)).toEqual([0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 255]);
  });

  it('blends the effect with the color of the preset, and follows that color where its palette does', () => {
    const masked = pixelPreview(chase({ blend: 'mask' }));
    masked.component.redraw();
    expect(masked.context.cells.map((cell) => cell.color)).toEqual([PIXEL_OFF, 'rgb(20, 23, 255)', PIXEL_OFF]);

    const shades = pixelPreview(chase({ palette: { ref: 'preset' } }));
    shades.component.redraw();
    const [red, green, blue] = shades.context.cells[1].color.match(/\d+/g).map(Number);
    expect(red).toBe(20);
    expect(green).toBe(23);
    expect(blue).toBeGreaterThan(28);
  });

  it('adds the effect to the color of the preset, or takes the brighter of both', () => {
    const added = pixelPreview(chase({ blend: 'add' }));
    added.component.redraw();
    expect(added.context.cells.map((cell) => cell.color)).toEqual(['rgb(20, 23, 255)', 'rgb(255, 23, 255)', 'rgb(20, 23, 255)']);

    const brighter = pixelPreview(chase({ blend: 'max' }));
    brighter.component.redraw();
    expect(brighter.context.cells.map((cell) => cell.color)).toEqual(['rgb(20, 23, 255)', 'rgb(255, 23, 255)', 'rgb(20, 23, 255)']);
  });

  it('lets the pixels glow less smoothly in a browser which does not blur on a canvas', () => {
    const { component, context } = pixelPreview(chase());
    (component as any).canvasBlurs = false;
    const drawn: number[] = [];
    context.drawImage = (image: HTMLCanvasElement) => {
      context.glows.push(image);
      drawn.push(context.globalAlpha);
    };

    component.redraw();

    expect(context.glows.length).toBe(1);
    expect(drawn[0]).toBeCloseTo(0.32, 5);
    expect(context.filter).toBe('none');
  });

  it('shows the color of the preset once the effect has stopped and leaves the pixels to it', () => {
    // it runs for 1.25 s: played on its own, the preview repeats its run of 1.5625 s, 1.5 s into it the effect has stopped
    const { component, context } = pixelPreview(chase({ runMode: 'duration', runDurationMillis: 1250, endMode: 'base' }));

    component.redraw();

    expect(context.cells.map((cell) => cell.color)).toEqual(['rgb(20, 23, 255)', 'rgb(20, 23, 255)', 'rgb(20, 23, 255)']);
  });

  it('draws one picture of the stage for an effect spread across it, three bars side by side while there is none', () => {
    const { component, context } = pixelPreview(chase({ spread: 'stage', size: 0.2 }), false);

    component.redraw();

    expect(context.cells.length).toBe(36);
    // the block runs across all of them: halfway through, in the middle of the second bar
    const lit = context.cells.map((cell, i) => (cell.color === 'rgb(255, 40, 48)' ? i : -1)).filter((i) => i >= 0);
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.every((i) => i >= 12 && i < 24)).toBe(true);
  });

  it('shows the pattern on a bar and a matrix while the preset has no fixture with pixels yet', () => {
    const { component, context } = pixelPreview(chase({ mirror: true }), false);

    component.redraw();

    // a bar of 12 pixels and a matrix of 8 x 8
    expect(context.cells.length).toBe(12 + 64);
  });

  it('works out the fixtures again once the selection of the preset changes', () => {
    const { component, context, presetService } = pixelPreview(chase());
    component.redraw();

    presetService.getPresetFixture = () => undefined;
    // (the capabilities and channels to offer are worked out as well, which these services leave out)
    spyOn<any>(component, 'updateCapabilitiesAndChannels');
    presetService.fixtureSelectionChanged.next();
    context.cells = [];
    component.redraw();

    expect(context.cells.length).toBe(12 + 64);
  });
});

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
      declarations: [EffectCurveComponent, GradientEditorComponent, ColorPickerComponent],
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

  // the pattern of a pixel effect, picked from the tiles the pattern picked opens
  async function pickPattern(pattern: string) {
    (element.querySelector('.pixel-picker-toggle') as HTMLElement).click();
    await update();
    (element.querySelector(`canvas[data-pattern="${pattern}"]`).closest('.pixel-picker-tile') as HTMLElement).click();
    await update();
  }

  const intensity = 'designer.fixtureCapabilityType.Intensity';
  const red = 'designer.fixtureCapabilityType.ColorIntensity, designer.fixtureCapabilityColor.Red';

  it('draws its grid on as many pixels as the screen shows it with', async () => {
    spyOnProperty(window, 'devicePixelRatio').and.returnValue(2);

    await render();

    const canvas = element.querySelector('canvas.curve-grid') as HTMLCanvasElement;
    expect([canvas.width, canvas.height, canvas.style.width, canvas.style.height]).toEqual([400, 200, '200px', '100px']);
  });

  it('edits a movement of the moving heads like a curve, with its shape and its size', async () => {
    const movement = new EffectPanTilt({ uuid: 'move' });
    curve = movement;
    await render();

    // the shape in place of the curve, nothing to pick to drive
    const shape: HTMLSelectElement = element.querySelector('select[name="shape"]');
    expect(shape.value).toBe('circle');
    expect(element.querySelectorAll('.tab-pane').length).toBe(0);
    expect(element.querySelector('.applying-to')).toBeNull();

    await select(shape, 'wave');
    expect(movement.shape).toBe('wave');

    // the period, the size on the pan and on the tilt, the phase and the chase
    const [, sizePan, sizeTilt] = inputs();
    type(sizePan, '120');
    type(sizeTilt, '45');
    expect(movement.sizePanDegrees).toBe(120);
    expect(movement.sizeTiltDegrees).toBe(45);
    expect(component.getSize('Pan')).toBe(120);

    type(sizePan, '-5');
    type(sizeTilt, 'wide');
    expect(movement.sizePanDegrees).toBe(120);
    expect(movement.sizeTiltDegrees).toBe(45);
    expect(previewLive).toHaveBeenCalled();

    // fanned over the heads by their place in the fan of the preset
    const fan: HTMLSelectElement = element.querySelector('select[name="fanMode"]');
    expect(fan.value).toBe('none');
    expect(Array.from(fan.options).map((option) => option.value)).toEqual(['none', 'linear', 'center', 'side']);
    await select(fan, 'linear');
    expect(movement.fanMode).toBe('linear');
  });

  it('fans a curve out over the fixtures, but not a pixel effect', async () => {
    curve = new EffectCurve();
    await render();

    const fan: HTMLSelectElement = element.querySelector('select[name="fanMode"]');
    await select(fan, 'center');
    expect(curve.fanMode).toBe('center');
    expect(previewLive).toHaveBeenCalled();

    curve = new EffectPixel({ uuid: 'pixels' });
    await render();
    expect(element.querySelector('select[name="fanMode"]')).toBeNull();
  });

  it('stands a pattern of a pixel effect still', async () => {
    const pixels = new EffectPixel({ uuid: 'pixels' });
    curve = pixels;
    await render();

    const still: HTMLInputElement = element.querySelector('input[name="still"]');
    expect(still.checked).toBe(false);
    still.click();
    await fixture.whenStable();
    expect(pixels.still).toBe(true);
  });

  it('edits a pixel effect like a curve, with its pattern and what the pattern lets be set', async () => {
    const pixels = new EffectPixel({ uuid: 'pixels' });
    curve = pixels;
    await render();

    // the pattern in place of the curve, nothing to pick to drive
    const pattern = element.querySelector('.pixel-picker-toggle') as HTMLElement;
    expect(pattern.getAttribute('data-pattern')).toBe('chase');
    expect(pattern.textContent).toContain('designer.effect.pixel-pattern-chase');
    expect(pattern.querySelector('.icon-pixel-bar')).not.toBeNull();
    expect(element.querySelector('select[name="pattern"]')).toBeNull();
    expect(element.querySelectorAll('.tab-pane').length).toBe(0);
    expect(element.querySelector('select[name="direction"]')).not.toBeNull();
    expect(element.textContent).toContain('designer.effect.pixel-size-chase');

    // the size and the softness, between 0 and 1
    type(element.querySelector('input[name="pixelSize"]'), '0.6');
    type(element.querySelector('input[name="pixelSoftness"]'), '0.1');
    expect([pixels.size, pixels.softness]).toEqual([0.6, 0.1]);
    type(element.querySelector('input[name="pixelSize"]'), '2');
    type(element.querySelector('input[name="pixelSoftness"]'), 'soft');
    expect([pixels.size, pixels.softness]).toEqual([0.6, 0.1]);

    await select(element.querySelector('select[name="direction"]'), 'out');
    expect(pixels.direction).toBe('out');

    // a comet bounces, a plasma has no direction and no softness, the shapes have a shape
    await pickPattern('comet');
    expect(pixels.pattern).toBe('comet');
    expect(pattern.textContent).toContain('designer.effect.pixel-pattern-comet');
    const bounce: HTMLInputElement = element.querySelector('#bounce_pixels');
    bounce.click();
    await update();
    expect(pixels.bounce).toBe(true);

    await pickPattern('plasma');
    expect(element.querySelector('select[name="direction"]')).toBeNull();
    expect(element.querySelector('input[name="pixelSoftness"]')).toBeNull();

    await pickPattern('shapes');
    await select(element.querySelector('select[name="pixelShape"]'), 'heart');
    expect(pixels.shape).toBe('heart');

    await pickPattern('sparkle');
    expect(element.textContent).toContain('designer.effect.pixel-fade');
    expect(previewLive).toHaveBeenCalled();

    // a sweep turns either way: the direction it had runs as the first way it turns
    await pickPattern('sweep');
    const directions = () => Array.from(element.querySelectorAll('select[name="direction"] option')).map((option: any) => option.value);
    expect(directions()).toEqual(['cw', 'ccw']);
    expect((element.querySelector('select[name="direction"]') as HTMLSelectElement).value).toBe('cw');
    await select(element.querySelector('select[name="direction"]'), 'ccw');
    expect(pixels.direction).toBe('ccw');

    // an orbit moves along a path and trails, a wave runs along a curve, a stack has no size
    await pickPattern('orbit');
    expect(element.textContent).toContain('designer.effect.pixel-path');
    expect(element.textContent).toContain('designer.effect.pixel-trail');
    expect((element.querySelector('select[name="pixelShape"]') as HTMLSelectElement).value).toBe('circle');
    await select(element.querySelector('select[name="pixelShape"]'), 'figure8');
    expect(pixels.shape).toBe('figure8');

    await pickPattern('wave');
    expect(element.textContent).toContain('designer.effect.pixel-curve');
    expect((element.querySelector('select[name="pixelShape"]') as HTMLSelectElement).value).toBe('sine');

    await pickPattern('stack');
    expect(element.querySelector('input[name="pixelSize"]')).toBeNull();
    expect(element.querySelector('input[name="pixelSoftness"]')).toBeNull();
  });

  it('edits the colors of an effect and saves them as a palette of the project', async () => {
    const pixels = new EffectPixel({ uuid: 'pixels' });
    curve = pixels;
    await render();

    // the shades of the preset have no colors to edit
    expect(element.querySelector('.pixel-palette-editor')).toBeNull();
    expect(element.querySelector('.pixel-palette-hint')).not.toBeNull();

    (element.querySelector('#palette_pixels_red-blue') as HTMLInputElement).click();
    await update();
    expect(element.querySelectorAll('lib-app-gradient-editor .gradient-stop').length).toBe(2);

    // the colors changed in the gradient editor: the effect's own colors from then on
    const editor: GradientEditorComponent = fixture.debugElement.query(By.directive(GradientEditorComponent)).componentInstance;
    editor.stopsChange.emit([
      { position: 0, color: '#00ff00' },
      { position: 0.8, color: '#1e4bff' },
    ]);
    await update();
    expect(pixels.palette.ref).toBe('custom');
    expect(pixels.palette.stops.map((stop) => [stop.position, stop.color])).toEqual([
      [0, '#00ff00'],
      [0.8, '#1e4bff'],
    ]);
    expect(pixels.palette.stops.every((stop) => stop instanceof PixelPaletteStop)).toBe(true);
    expect(previewLive).toHaveBeenCalled();
    await select(element.querySelector('select[name="paletteBetween"]'), 'smooth');
    await select(element.querySelector('select[name="paletteRepeat"]'), 'wrap');
    expect([pixels.palette.stops.length, pixels.palette.between, pixels.palette.repeat]).toEqual([2, 'smooth', 'wrap']);

    // saved with the project under a name, the effect painted in it
    const name = element.querySelector('input[name="paletteName"]') as HTMLInputElement;
    name.value = 'Green to blue';
    (element.querySelector('.pixel-palette-save') as HTMLElement).click();
    await update();
    const project = TestBed.inject(ProjectService).project;
    expect(project.pixelPalettes.map((palette) => palette.name)).toEqual(['Green to blue']);
    expect(pixels.palette.ref).toBe(project.pixelPalettes[0].uuid);
    expect(element.querySelectorAll('.pixel-project-palette').length).toBe(1);

    // picked by another effect, which keeps its own copy, and deleted
    (element.querySelector('#palette_pixels_fire') as HTMLInputElement).click();
    await update();
    (element.querySelector('.pixel-project-palette input') as HTMLInputElement).click();
    await update();
    expect(pixels.palette.stops.map((stop) => stop.color)).toEqual(['#00ff00', '#1e4bff']);
    expect(pixels.palette.stops === project.pixelPalettes[0].stops).toBe(false);

    (element.querySelector('.pixel-palette-delete') as HTMLElement).click();
    await update();
    expect(project.pixelPalettes).toEqual([]);
    expect(pixels.palette.ref).toBe('custom');
  });

  it('picks a pattern from all of them, each moving in the colors of the effect', async () => {
    const pixels = new EffectPixel({ uuid: 'pixels', palette: { ref: 'fire', stops: [{ position: 0, color: '#ff0000' }] } });
    curve = pixels;
    await render();

    (element.querySelector('.pixel-picker-toggle') as HTMLElement).click();
    await update();
    const tiles = Array.from(element.querySelectorAll('.pixel-picker-tile'));
    expect(tiles.length).toBe(pixelPatternsForBars.length + pixelPatternsForMatrices.length);
    expect(element.querySelector('.pixel-picker-tile.active canvas').getAttribute('data-pattern')).toBe('chase');

    // drawn with the grid: the pixels of a flow in red
    (component as any).animationService.timeMillis = 500;
    component.redraw();
    const flow = element.querySelector('canvas[data-pattern="flow"]') as HTMLCanvasElement;
    const pixel = flow.getContext('2d').getImageData(flow.width / 2, flow.height / 2, 1, 1).data;
    expect(pixel[0]).toBeGreaterThan(200);

    // a text and an image show something of their own, or a sample
    const text = element.querySelector('canvas[data-pattern="text"]') as HTMLCanvasElement;
    const lit = Array.from(text.getContext('2d').getImageData(0, 0, text.width, text.height).data).filter(
      (value, i) => i % 4 === 0 && value > 200
    );
    expect(lit.length).toBeGreaterThan(0);

    (tiles[tiles.length - 1] as HTMLElement).click();
    await update();
    expect(pixels.pattern).toBe(pixelPatternsForMatrices[pixelPatternsForMatrices.length - 1]);
    expect(element.querySelector('.pixel-picker')).toBeNull();

    // shown with the icon of the matrices
    expect(element.querySelector('.pixel-picker-toggle .icon-matrix')).not.toBeNull();
  });

  it('opens the tiles over the panel below the pattern picked, as far down as the window shows them', async () => {
    curve = new EffectPixel({ uuid: 'pixels' });
    await render();

    // the panel the card is in shows only 60 pixels of it, like the one of an effect with little to set, at the top of
    // the window
    const host = fixture.nativeElement as HTMLElement;
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    host.style.display = 'block';
    host.style.overflow = 'hidden';
    host.style.height = '60px';

    const toggle = element.querySelector('.pixel-picker-toggle') as HTMLElement;
    const picker = () => element.querySelector('.pixel-picker') as HTMLElement;

    toggle.click();
    await update();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(getComputedStyle(picker()).position).toBe('fixed');

    const anchor = toggle.getBoundingClientRect();
    const box = picker().getBoundingClientRect();
    expect(box.top).toBeCloseTo(anchor.bottom + 4, 0);
    expect(box.left).toBeCloseTo(Math.max(8, anchor.left), 0);
    expect(picker().style.maxHeight).toBe(Math.floor(window.innerHeight - anchor.bottom - 12) + 'px');

    // not cut by the panel: its tiles show further down than the panel reaches
    expect(box.bottom).toBeGreaterThan(host.getBoundingClientRect().bottom);

    // closed again by the pattern picked
    toggle.click();
    await update();
    expect(picker()).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the tiles above the pattern picked where too little is left below it', async () => {
    curve = new EffectPixel({ uuid: 'pixels' });
    await render();

    // the pattern picked near the bottom of the window
    const host = fixture.nativeElement as HTMLElement;
    host.style.position = 'fixed';
    host.style.left = '0';
    host.style.top = window.innerHeight - 60 + 'px';

    const toggle = element.querySelector('.pixel-picker-toggle') as HTMLElement;
    toggle.click();
    await update();

    const anchor = toggle.getBoundingClientRect();
    const picker = element.querySelector('.pixel-picker') as HTMLElement;
    expect(picker.getBoundingClientRect().bottom).toBeCloseTo(anchor.top - 4, 0);
    expect(picker.style.maxHeight).toBe(Math.floor(anchor.top - 12) + 'px');
  });

  it('follows the pattern picked when the panel scrolls, and closes with a click elsewhere and with Escape', async () => {
    curve = new EffectPixel({ uuid: 'pixels' });
    await render();

    // a panel which scrolls, at the top of the window
    const host = fixture.nativeElement as HTMLElement;
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    host.style.display = 'block';
    host.style.overflow = 'auto';
    host.style.height = '120px';
    const filler = document.createElement('div');
    filler.style.height = '1000px';
    host.appendChild(filler);

    const toggle = element.querySelector('.pixel-picker-toggle') as HTMLElement;
    const picker = () => element.querySelector('.pixel-picker') as HTMLElement;

    toggle.click();
    await update();
    host.scrollTop = 30;
    host.dispatchEvent(new Event('scroll'));
    expect(picker().getBoundingClientRect().top).toBeCloseTo(toggle.getBoundingClientRect().bottom + 4, 0);

    // a click on the tiles keeps them open, one anywhere else closes them
    picker().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await update();
    expect(picker()).not.toBeNull();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await update();
    expect(picker()).toBeNull();

    toggle.click();
    await update();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await update();
    expect(picker()).toBeNull();

    // and so does closing the effect, without listening any further
    toggle.click();
    await update();
    fixture.componentRef.setInput('isSelected', false);
    await update();
    expect(picker()).toBeNull();
    expect((component as any).pickerListeners.length).toBe(0);
  });

  it('shows the white LEDs of a matrix in white, as bright as the color the effect lights them in', async () => {
    // a preset of a matrix of 3 x 2 white LEDs, each a dimmer of its own
    const project = new Project({
      fixtureProfiles: [{ ...JSON.parse(JSON.stringify(profiles['test/white-matrix'])), uuid: 'test/white-matrix' }],
      fixtures: [{ uuid: 'white', profileUuid: 'test/white-matrix', modeShortName: '8ch', dmxUniverseUuid: 'u', dmxFirstChannel: 0 }],
      presetFixtures: [],
      presets: [{ uuid: 'look', fixtures: [], steps: [{ uuid: 'step' }] }],
    });
    TestBed.inject(ProjectService).project = project;
    const fixtureService = TestBed.inject(FixtureService);
    fixtureService.updateCachedFixtures();
    project.presets[0].fixtures = fixtureService.cachedFixtures.map(
      (cachedFixture) => new PresetFixture({ fixtureUuid: 'white', pixelKey: cachedFixture.pixel?.key })
    );
    presetService.selectedPreset = project.presets[0];

    const pixels = new EffectPixel({ uuid: 'pixels', size: 0.34, softness: 0, palette: { stops: [{ position: 0, color: '#ff0000' }] } });
    curve = pixels;
    await render();

    // its pixels, not its master dimmer
    const fixtures = (component as any).getPixelPreviewFixtures();
    expect(fixtures.length).toBe(1);
    expect([fixtures[0].columns, fixtures[0].rows, fixtures[0].example]).toEqual([3, 2, undefined]);
    expect(fixtures[0].white).toEqual([true, true, true, true, true, true]);

    // halfway through its period, the block on the middle column: white, as bright as the red
    const colorOf = (index: number) => (component as any).partColorOf(pixels, fixtures[0].parts[index], 0.5, 0, [0, 1, 0], true);
    expect(colorOf(1)).toEqual([1, 1, 1]);
    expect(Math.max(...colorOf(0))).toBeLessThan(0.01);

    // across the stage as well
    pixels.spread = 'stage';
    (component as any).stagePreview = undefined;
    const stage = (component as any).getStagePreview();
    expect(stage.example).toBe(false);
    expect(stage.parts.map((part: any) => part.white)).toEqual([true, true, true, true, true, true]);
  });

  it('tells when the preset dims to 0, which keeps a pixel effect dark', async () => {
    curve = new EffectPixel({ uuid: 'pixels' });
    await render();
    expect(element.querySelector('.pixel-dimmed-warning')).toBeNull();

    presetService.selectedPreset.steps[0].fixtureCapabilityValues.push(
      new FixtureCapabilityValue({ type: 'Intensity', valuePercentage: 0 })
    );
    await update();
    expect(element.querySelector('.pixel-dimmed-warning').textContent).toContain('designer.effect.pixel-dimmed-to-zero');
  });

  it('picks the palette of a pixel effect and how it is blended with the color of the preset', async () => {
    const pixels = new EffectPixel({ uuid: 'pixels' });
    curve = pixels;
    await render();

    // the color of the preset first, each palette shown in its colors
    const palettes = Array.from(element.querySelectorAll('.pixel-palette'));
    expect(palettes.length).toBe(15);
    expect((palettes[0].querySelector('input') as HTMLInputElement).checked).toBe(true);
    expect((palettes[3].querySelector('.pixel-palette-swatch') as HTMLElement).style.background).toContain('linear-gradient');

    (element.querySelector('#palette_pixels_fire') as HTMLInputElement).click();
    await update();
    expect(pixels.palette.ref).toBe('fire');
    expect(pixels.palette.stops.length).toBe(6);

    // the second tab: the blend, the mirror and the seed
    (element.querySelectorAll('.effect-tab-rail .nav-link')[1] as HTMLElement).click();
    await update();
    expect(element.querySelectorAll('.pixel-palette').length).toBe(0);

    (element.querySelector('#blend_pixels_mask') as HTMLInputElement).click();
    (element.querySelector('#mirror_pixels') as HTMLInputElement).click();
    await update();
    expect(pixels.blend).toBe('mask');
    expect(pixels.mirror).toBe(true);

    type(element.querySelector('input[name="seed"]'), '7');
    type(element.querySelector('input[name="seed"]'), '1.5');
    expect(pixels.seed).toBe(7);

    (element.querySelectorAll('.effect-tab-rail .nav-link')[0] as HTMLElement).click();
    await update();
    expect(element.querySelectorAll('.pixel-palette').length).toBe(15);
  });

  it('writes a text in the pixel font or a font of the browser, scrolling or standing', async () => {
    const pixels = new EffectPixel({ uuid: 'pixels' });
    curve = pixels;
    await render();

    // a text to start with, in the pixel font
    await pickPattern('text');
    expect(pixels.text).toBe('Rocket Show');
    expect(pixels.bitmap.height).toBe(7);
    expect(element.querySelector('input[name="pixelSize"]')).toBeNull();

    type(element.querySelector('input[name="pixelText"]'), 'Hi');
    expect(pixels.bitmap.width).toBe(9);

    // a font of the browser, as high as asked
    await select(element.querySelector('select[name="pixelFont"]'), 'serif');
    type(element.querySelector('input[name="pixelTextHeight"]'), '12');
    type(element.querySelector('input[name="pixelTextHeight"]'), '200');
    expect([pixels.font, pixels.textHeight, pixels.bitmap.height]).toEqual(['serif', 12, 12]);

    // scrolling to the left, or standing where it is aligned
    expect((element.querySelector('select[name="pixelScroll"]') as HTMLSelectElement).value).toBe('left');
    expect(element.querySelector('select[name="pixelAlign"]')).toBeNull();
    await select(element.querySelector('select[name="pixelScroll"]'), 'none');
    await select(element.querySelector('select[name="pixelAlign"]'), 'right');
    await select(element.querySelector('select[name="pixelTextColors"]'), 'letters');
    type(element.querySelector('input[name="pixelOffsetY"]'), '2');
    expect([pixels.scroll, pixels.align, pixels.textColors, pixels.offsetY]).toEqual(['none', 'right', 'letters', 2]);
  });

  it('makes an image picked into its pixels, an animation running in a period as long as it takes', async () => {
    const pixels = new EffectPixel({ uuid: 'pixels' });
    curve = pixels;
    await render();
    await pickPattern('image');

    // an image of 4 x 2 pixels
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 2;
    canvas.getContext('2d').fillStyle = '#ff0000';
    canvas.getContext('2d').fillRect(0, 0, 4, 2);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const file = new File([blob], 'red.png', { type: 'image/png' });

    await component.pickImage({ target: { files: [file], value: 'red.png' } } as any);
    await update();

    // as large as the pixels of the preset: the par is one, which the image covers with two
    expect([pixels.bitmap.width, pixels.bitmap.height, pixels.bitmap.channels, pixels.imageName]).toEqual([2, 1, 3, 'red.png']);
    expect(pixels.bitmap.value(pixels.bitmap.frame(0), 1, 0, 0)).toBe(255);
    expect(element.querySelector('.pixel-image-pick').textContent).toContain('red.png');
    expect(element.querySelector('.pixel-image-stored').textContent.trim()).toBe('designer.effect.pixel-image-stored');
    expect(component.pixelImageStored).toEqual({ width: 2, height: 1, frames: 1, size: '1 KB' });

    // as large as asked, for fixtures still to come
    const larger = document.createElement('canvas');
    larger.width = 400;
    larger.height = 200;
    const largerBlob: Blob = await new Promise((resolve) => larger.toBlob(resolve, 'image/png'));
    await select(element.querySelector('select[name="pixelImageSize"]'), '1: 16');
    await component.pickImage({ target: { files: [new File([largerBlob], 'wide.png', { type: 'image/png' })], value: '' } } as any);
    expect([pixels.bitmap.width, pixels.bitmap.height]).toEqual([16, 8]);
    // an animation, in megabytes
    pixels.bitmap.frames = new Array(30).fill('A'.repeat(65536));
    expect(component.pixelImageStored.size).toBe('1.9 MB');
    pixels.bitmap.frames = pixels.bitmap.frames.slice(0, 1);

    // fitted, scrolling and in its own colors or through the palette
    expect((element.querySelector('select[name="pixelScroll"]') as HTMLSelectElement).value).toBe('none');
    await select(element.querySelector('select[name="pixelFit"]'), 'cover');
    await select(element.querySelector('select[name="pixelImageColors"]'), 'palette');
    expect([pixels.fit, pixels.imageColors]).toEqual(['cover', 'palette']);

    // something which is no image
    await component.pickImage({ target: { files: [new File(['no image'], 'notes.txt', { type: 'text/plain' })], value: '' } } as any);
    await update();
    expect(element.querySelector('.pixel-image-failed')).not.toBeNull();
    expect(pixels.imageName).toBe('wide.png');
  });

  it('follows the audio of the composition, in a band and with its brightness or its size', async () => {
    const pixels = new EffectPixel({ uuid: 'pixels' });
    curve = pixels;
    await render();

    // the fourth tab: the audio it follows
    (element.querySelectorAll('.effect-tab-rail .nav-link')[3] as HTMLElement).click();
    await update();
    expect(element.querySelector('select[name="audioBand"]')).toBeNull();

    (element.querySelector('#audioSource_pixels_composition') as HTMLInputElement).click();
    await update();
    await select(element.querySelector('select[name="audioBand"]'), 'bass');
    await select(element.querySelector('select[name="audioFollows"]'), 'size');
    type(element.querySelector('input[name="audioGainDb"]'), '6');
    type(element.querySelector('input[name="audioFloorDb"]'), '-40');
    type(element.querySelector('input[name="audioAttackMillis"]'), '50');
    type(element.querySelector('input[name="audioReleaseMillis"]'), '800');
    // beyond what it takes
    type(element.querySelector('input[name="audioFloorDb"]'), '0');
    type(element.querySelector('input[name="audioReleaseMillis"]'), 'slow');

    expect([pixels.audioSource, pixels.audioBand, pixels.audioFollows]).toEqual(['composition', 'bass', 'size']);
    expect([pixels.audioGainDb, pixels.audioFloorDb, pixels.audioAttackMillis, pixels.audioReleaseMillis]).toEqual([6, -40, 50, 800]);

    // the level meter shows the audio itself
    await pickPattern('meter');
    expect(element.querySelector('select[name="audioFollows"]')).toBeNull();
  });

  it('follows the buses of Rocket Show it picks, all of them at first', async () => {
    const timelineService = TestBed.inject(TimelineService);
    const buses = [
      { uuid: 'music', name: 'Music' },
      { uuid: 'click', name: 'Click' },
      { uuid: 'drums', name: 'Drums' },
    ];
    spyOnProperty(timelineService, 'audioBuses').and.returnValue(buses);
    const previews = spyOn(timelineService, 'previewsAudioBuses').and.returnValue(true);
    const pixels = new EffectPixel({ uuid: 'pixels', audioSource: 'composition' });
    curve = pixels;
    await render();
    (element.querySelectorAll('.effect-tab-rail .nav-link')[3] as HTMLElement).click();
    await update();

    const bus = (uuid: string) => element.querySelector('#audioBus_pixels_' + uuid) as HTMLInputElement;
    const click = async (uuid: string) => {
      bus(uuid).click();
      await update();
    };

    expect(buses.map((candidate) => bus(candidate.uuid).checked)).toEqual([true, true, true]);

    // the click and the drums left out: the music alone, which stays
    await click('click');
    expect(pixels.audioBuses).toEqual(['music', 'drums']);
    await click('drums');
    expect(pixels.audioBuses).toEqual(['music']);
    expect(bus('music').disabled).toBe(true);
    expect(previewLive).toHaveBeenCalled();
    expect(element.querySelector('.pixel-audio-buses-hint')).toBeNull();

    // all of them again: all of them, also the ones added later
    await click('click');
    await click('drums');
    expect(pixels.audioBuses).toEqual([]);

    // a bus which is no longer there can be left out
    pixels.audioBuses = ['gone', 'music'];
    await update();
    expect(element.querySelector('label[for="audioBus_pixels_gone"]').textContent.trim()).toBe('designer.effect.pixel-audio-bus-gone');
    await click('gone');
    expect(pixels.audioBuses).toEqual(['music']);

    // where the preview can't tell the files of the buses, it says so
    previews.and.returnValue(false);
    await update();
    expect(element.querySelector('.pixel-audio-buses-hint')).not.toBeNull();
  });

  it('tells which buses of Rocket Show an effect follows where the designer does not run in it', async () => {
    curve = new EffectPixel({ uuid: 'pixels', audioSource: 'composition' });
    await render();
    (element.querySelectorAll('.effect-tab-rail .nav-link')[3] as HTMLElement).click();
    await update();

    expect(element.querySelector('.pixel-audio-buses-picked').textContent.trim()).toBe('designer.effect.pixel-audio-buses-all');

    (curve as EffectPixel).audioBuses = ['music', 'drums'];
    await update();
    expect(element.querySelector('.pixel-audio-buses-picked').textContent.trim()).toBe('designer.effect.pixel-audio-buses-some');
  });

  it('paints a pixel effect on each fixture or across the stage, and on the white LEDs', async () => {
    const pixels = new EffectPixel({ uuid: 'pixels' });
    curve = pixels;
    await render();

    // the third tab: where the pattern is painted
    (element.querySelectorAll('.effect-tab-rail .nav-link')[2] as HTMLElement).click();
    await update();
    expect((element.querySelector('#spread_pixels_fixture') as HTMLInputElement).checked).toBe(true);
    expect(element.querySelector('#view_pixels_top')).toBeNull();

    (element.querySelector('#spread_pixels_stage') as HTMLInputElement).click();
    await update();
    expect(pixels.spread).toBe('stage');

    (element.querySelector('#view_pixels_top') as HTMLInputElement).click();
    (element.querySelector('#whiteLed_pixels') as HTMLInputElement).click();
    await update();
    expect([pixels.view, pixels.whiteLed]).toEqual(['top', true]);
    expect(previewLive).toHaveBeenCalled();
  });

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
