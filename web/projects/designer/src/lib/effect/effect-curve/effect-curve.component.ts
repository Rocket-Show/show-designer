import { Component, ElementRef, Input, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { CachedFixtureChannel } from '../../models/cached-fixture-channel';
import { EffectCurveProfileChannels } from '../../models/effect-curve-profile-channel';
import { FixtureCapability, FixtureCapabilityColor, FixtureCapabilityType } from '../../models/fixture-capability';
import { FixtureProfile } from '../../models/fixture-profile';
import { FixtureService } from '../../services/fixture.service';
import { PresetService } from '../../services/preset.service';
import { EffectCurve } from './../../models/effect-curve';
import { EffectPanTilt } from '../../models/effect-pan-tilt';
import { AnimationService } from './../../services/animation.service';
import { EffectService } from '../../services/effect.service';
import { LivePreviewService } from '../../services/live-preview.service';
import { TimelineService } from '../../services/timeline.service';
import { BsModalService } from 'ngx-bootstrap/modal';
import { EffectCurveAdvancedComponent } from './effect-curve-advanced/effect-curve-advanced.component';
import { EffectPixel } from '../../models/effect-pixel';
import { CachedFixture } from '../../models/cached-fixture';
import { hexToRgb, PixelPalette } from '../../models/pixel-palette';
import { PixelContext, pixelPatternsForBars, pixelPatternsForMatrices, samplePixelPattern } from '../../models/pixel-pattern';
import { BuiltInPixelPalette, builtInPixelPalettes, pixelPaletteCss, pixelPaletteOf } from '../../models/pixel-palettes';
import { toInt } from '../../models/pixel-math';
import { ColorService } from '../../services/color.service';

// a fixture in the preview of a pixel effect: where each of its parts is, and the step of the chase it takes
interface PixelPreviewFixture {
  index: number;
  columns: number;
  rows: number;
  parts: PixelContext[];
}

// a capability checkbox, prepared for the template. the name and the checked state are
// calculated whenever they change instead of on each change detection cycle, because the
// sliders trigger change detection with each mouse move.
export interface CurveCapabilityOption {
  id: string;
  name: string;
  checked: boolean;
  capability: FixtureCapability;
}

// a channel checkbox, prepared for the template (see CurveCapabilityOption)
export interface CurveChannelOption {
  id: string;
  name: string;
  checked: boolean;
  profile: FixtureProfile;
  channel: CachedFixtureChannel;
}

@Component({
  selector: 'lib-app-effect-curve',
  templateUrl: './effect-curve.component.html',
  styleUrls: ['./effect-curve.component.css'],
  standalone: false,
})
export class EffectCurveComponent implements OnInit, OnDestroy {
  private animationFrameId: number;
  private ctx: any;
  private maxWidth: number;
  private maxHeight: number;

  // how far a movement of the moving heads reaches, in degrees (more can be typed in)
  public sizeMin = 0;
  public sizeMax = 360;

  // the shapes a movement of the moving heads moves in
  public readonly shapes = ['circle', 'figure8', 'line', 'wave'];

  public lengthMillisMin = 20;
  public lengthMillisMax = 8000;
  public lengthBeatsMin = 0.25;
  public lengthBeatsMax = 16;
  public amplitudeMin = 0;
  public amplitudeMax = 4;
  public phasingMillisMin = -1000;
  public phasingMillisMax = 1000;
  public phasingCyclesMin = -4;
  public phasingCyclesMax = 4;
  public phasingBeatsMin = -4;
  public phasingBeatsMax = 4;

  // the sliders cover the values used most, the input boxes take slower curves and
  // longer chases as well. a chase longer than the period still counts on a curve that
  // stops: it starts the fixtures one after the other.
  public lengthMillisInputMax = 600000;
  public lengthBeatsInputMax = 256;
  public phasingMillisInputMax = 60000;
  public phasingBeatsInputMax = 64;

  // the position moves the curve until it rests flat at the bottom or the top, which
  // takes half the amplitude beyond either end
  public positionMin = -this.amplitudeMax / 2;
  public positionMax = 1 + this.amplitudeMax / 2;

  // the position slider spans the way the curve can be moved at its current amplitude:
  // 0 rests it flat at the bottom, 1 at the top
  public positionReachMin = 0;
  public positionReachMax = 1;

  // the phase moves the curve inside its period, so a shift of a full period lands on
  // the same curve again -> the slider spans one period in each direction, whatever the
  // period is. it is set in cycles and shown in milliseconds.
  public phaseCyclesMin = -1;
  public phaseCyclesMax = 1;

  // the capabilities to choose from
  public capabilityOptions: CurveCapabilityOption[] = [];

  // the channels to choose from
  public channelOptions: CurveChannelOption[] = [];

  private availableChannels: Map<FixtureProfile, CachedFixtureChannel[]> = new Map<FixtureProfile, CachedFixtureChannel[]>();
  public availableProfiles: FixtureProfile[] = [];
  public selectedProfiles: FixtureProfile[] = [];

  private effectsOpenChangedSubscription: Subscription;
  private fixtureSelectionChangedSubscription: Subscription;
  private langChangeSubscription: Subscription;

  // whether this effect is the one currently opened in the accordion
  private effectSelected = false;

  // the number of fixtures the chase is distributed over. calculating it walks over all
  // fixtures of the project, which is far too expensive to repeat on each animation frame.
  private phasingCount = 0;
  private phasingCountMillis: number;

  // ---- a pixel effect, edited with its pattern, palette and blend in place of the curve and what it drives

  public readonly pixelPatternsForBars = pixelPatternsForBars;
  public readonly pixelPatternsForMatrices = pixelPatternsForMatrices;
  public readonly pixelDirections = ['right', 'left', 'out', 'in', 'up', 'down'];
  public readonly pixelShapes = ['circle', 'square', 'diamond', 'star', 'heart'];
  public readonly pixelBlends = ['replace', 'mask', 'add', 'max'];
  public readonly pixelPalettes = builtInPixelPalettes;

  // the tab the panel on the right shows: the colors or how they are blended
  public pixelTab = 'colors';

  // the fixtures of the preset the grid shows the pixel effect on, worked out when the selection changes
  private pixelPreviewFixtures: PixelPreviewFixture[];

  @Input() curve: EffectCurve;

  // whether the effect is currently being edited (open) or not
  @Input()
  set isSelected(value: boolean) {
    this.effectSelected = value;

    if (value) {
      this.startAnimation();
    } else {
      this.stopAnimation();
    }
  }

  @ViewChild('curveGrid', { static: true }) curveGrid: ElementRef;

  constructor(
    public presetService: PresetService,
    private animationService: AnimationService,
    private fixtureService: FixtureService,
    private translate: TranslateService,
    private effectService: EffectService,
    private ngZone: NgZone,
    public livePreviewService: LivePreviewService,
    private modalService: BsModalService,
    private timelineService: TimelineService,
    private colorService: ColorService
  ) {
    this.fixtureSelectionChangedSubscription = this.presetService.fixtureSelectionChanged.subscribe(() => {
      this.pixelPreviewFixtures = undefined;
      this.updateCapabilitiesAndChannels();

      // the chase is spread over the fixtures of the preset
      this.phasingCountMillis = undefined;
    });

    this.langChangeSubscription = this.translate.onLangChange.subscribe(() => {
      this.updateOptionNames();
    });

    this.effectsOpenChangedSubscription = this.effectService.effectsOpenChanged.subscribe(() => {
      if (this.effectService.effectsOpen) {
        this.startAnimation();
      } else {
        this.stopAnimation();
      }
    });
  }

  ngOnInit() {
    // the capabilities and channels are checked against the curve, which is only available
    // once the inputs have been set
    this.updateCapabilitiesAndChannels();

    const canvas = this.curveGrid.nativeElement;
    this.ctx = canvas.getContext('2d');
    this.maxWidth = canvas.width;
    this.maxHeight = canvas.height;

    this.redraw();
  }

  ngOnDestroy() {
    this.stopAnimation();
    this.effectsOpenChangedSubscription.unsubscribe();
    this.fixtureSelectionChangedSubscription.unsubscribe();
    this.langChangeSubscription.unsubscribe();
  }

  private startAnimation() {
    if (this.animationFrameId !== undefined) {
      return;
    }

    // only the effect opened in the accordion of the opened effects tab is visible
    if (!this.effectSelected || !this.effectService.effectsOpen) {
      return;
    }

    // Avoid triggering change detection with each animation frame -> run outside zone.
    // requestAnimationFrame draws exactly once per frame and pauses in background tabs.
    this.ngZone.runOutsideAngular(() => {
      const animate = () => {
        this.redraw();
        this.animationFrameId = requestAnimationFrame(animate);
      };

      this.animationFrameId = requestAnimationFrame(animate);
    });
  }

  private stopAnimation() {
    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
  }

  // A movement of the moving heads runs on the timing of a curve and is edited the same way, with its shape and its
  // size in place of the curve and its amplitude (see EffectPanTilt)
  get isMovement(): boolean {
    return this.curve instanceof EffectPanTilt;
  }

  get movement(): EffectPanTilt {
    return this.curve as EffectPanTilt;
  }

  setShape(shape: string) {
    this.movement.shape = shape;
    this.livePreviewService.previewLive();
  }

  // A pixel effect runs on the timing of a curve as well, with its pattern, its palette and how it is blended in place of
  // the curve and the capabilities and channels it drives (see EffectPixel)
  get isPixel(): boolean {
    return this.curve instanceof EffectPixel;
  }

  get pixelEffect(): EffectPixel {
    return this.curve as EffectPixel;
  }

  // what the pattern of a pixel effect lets be set besides its size
  usesDirection(): boolean {
    return ['chase', 'comet', 'wipe', 'flow'].indexOf(this.pixelEffect.pattern) >= 0;
  }

  usesShape(): boolean {
    return this.pixelEffect.pattern === 'shapes';
  }

  usesBounce(): boolean {
    return this.pixelEffect.pattern === 'comet';
  }

  usesSoftness(): boolean {
    return ['comet', 'flow', 'plasma', 'fire'].indexOf(this.pixelEffect.pattern) < 0;
  }

  // the size means something else for each pattern (a tail, rings, a density, ...)
  pixelSizeLabel(): string {
    return 'designer.effect.pixel-size-' + this.pixelEffect.pattern;
  }

  pixelSoftnessLabel(): string {
    return this.pixelEffect.pattern === 'sparkle' ? 'designer.effect.pixel-fade' : 'designer.effect.pixel-softness';
  }

  setPattern(pattern: string) {
    this.pixelEffect.pattern = pattern;
    this.livePreviewService.previewLive();
  }

  // the size and the softness are set between 0 and 1
  setPixelSize(value: any) {
    if (value !== '' && value !== null && !isNaN(value) && value >= 0 && value <= 1) {
      this.pixelEffect.size = +value;
      this.livePreviewService.previewLive();
    }
  }

  setPixelSoftness(value: any) {
    if (value !== '' && value !== null && !isNaN(value) && value >= 0 && value <= 1) {
      this.pixelEffect.softness = +value;
      this.livePreviewService.previewLive();
    }
  }

  setDirection(direction: string) {
    this.pixelEffect.direction = direction;
    this.livePreviewService.previewLive();
  }

  setPixelShape(shape: string) {
    this.pixelEffect.shape = shape;
    this.livePreviewService.previewLive();
  }

  setBounce(bounce: boolean) {
    this.pixelEffect.bounce = bounce;
    this.livePreviewService.previewLive();
  }

  setPalette(palette: BuiltInPixelPalette) {
    this.pixelEffect.palette = pixelPaletteOf(palette);
    this.livePreviewService.previewLive();
  }

  setBlend(blend: string) {
    this.pixelEffect.blend = blend;
    this.livePreviewService.previewLive();
  }

  setMirror(mirror: boolean) {
    this.pixelEffect.mirror = mirror;
    this.livePreviewService.previewLive();
  }

  // a whole number, which starts the random looking patterns somewhere else
  setSeed(value: any) {
    if (value !== '' && value !== null && Number.isInteger(+value)) {
      this.pixelEffect.seed = +value;
      this.livePreviewService.previewLive();
    }
  }

  // how a palette looks in the list, the one of the preset in its color
  paletteCss(palette: BuiltInPixelPalette): string {
    const preset = this.presetService.selectedPreset;
    return pixelPaletteCss(palette, preset ? this.colorService.getPresetColor(preset) : '#ffffff');
  }

  // The fixtures of the preset which light in colors, each with the parts it has in the preset (its pixels, or itself),
  // in the order the effect chases them in. None selected yet: a bar and a matrix to show what the pattern looks like.
  private getPixelPreviewFixtures(): PixelPreviewFixture[] {
    if (this.pixelPreviewFixtures) {
      return this.pixelPreviewFixtures;
    }

    const fixtures: PixelPreviewFixture[] = [];
    const preset = this.presetService.selectedPreset;

    if (preset) {
      const chase = this.presetService.getPresetWholeFixtureChase(preset);
      const byFixture = new Map<string, CachedFixture[]>();

      for (const cachedFixture of this.fixtureService.cachedFixtures) {
        const lightsInColors = cachedFixture.channels.some((channel) =>
          channel.capabilities.some((capability) => capability.capability.type === FixtureCapabilityType.ColorIntensity)
        );

        if (lightsInColors && this.presetService.getPresetFixture(preset, cachedFixture.fixture.uuid, cachedFixture.pixel?.key)) {
          const parts = byFixture.get(cachedFixture.fixture.uuid) || [];
          parts.push(cachedFixture);
          byFixture.set(cachedFixture.fixture.uuid, parts);
        }
      }

      byFixture.forEach((parts, fixtureUuid) => {
        const places = parts.map((part) => this.fixtureService.getPixelPlace(part));
        fixtures.push({ index: chase.indices.get(fixtureUuid) ?? 0, columns: places[0].columns, rows: places[0].rows, parts: places });
      });

      fixtures.sort((fixture1, fixture2) => fixture1.index - fixture2.index);
    }

    if (fixtures.length === 0) {
      fixtures.push(this.examplePixelFixture(0, 12, 1), this.examplePixelFixture(1, 8, 8));
    }

    this.pixelPreviewFixtures = fixtures;

    return fixtures;
  }

  private examplePixelFixture(index: number, columns: number, rows: number): PixelPreviewFixture {
    const parts: PixelContext[] = [];
    const longest = Math.max(columns, rows);

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        parts.push(
          Object.assign(new PixelContext(), {
            x: (column + 0.5) / columns,
            y: (row + 0.5) / rows,
            column,
            row,
            columns,
            rows,
            aspectX: columns / longest,
            aspectY: rows / longest,
          })
        );
      }
    }

    return { index, columns, rows, parts };
  }

  // The pixels of the fixtures of the preset as the pixel effect lights them now, in the color of the preset where the
  // palette follows it: the bars stacked on the left, the matrices next to them
  private drawPixels() {
    const effect = this.pixelEffect;
    const fixtures = this.getPixelPreviewFixtures().slice(0, 8);
    const bars = fixtures.filter((fixture) => fixture.rows === 1).slice(0, 6);
    const matrices = fixtures.filter((fixture) => fixture.rows > 1).slice(0, 2);
    const margin = 6;
    const gap = 6;
    const preset = this.presetService.selectedPreset;
    const base = hexToRgb(preset ? this.colorService.getPresetColor(preset) : '#ffffff');
    const fixtureCount = Math.max(...fixtures.map((fixture) => fixture.index)) + 1;
    const loopMillis = effect.getRunLoopMillis(fixtureCount, this.beatsPerMinute);
    const timeMillis = loopMillis === undefined ? this.animationService.timeMillis : this.animationService.timeMillis % loopMillis;

    const matrixSize = matrices.length
      ? Math.min(this.maxHeight - margin * 2, (this.maxWidth - margin * 2) / (matrices.length + (bars.length ? 1.2 : 0)))
      : 0;
    const barsWidth = this.maxWidth - margin * 2 - matrices.length * (matrixSize + gap);
    const barColumns = Math.max(1, ...bars.map((bar) => bar.columns));
    const barCell = Math.min(barsWidth / barColumns, (this.maxHeight - margin * 2) / Math.max(bars.length * 1.6, 1));

    bars.forEach((bar, i) => {
      const top = (this.maxHeight - bars.length * barCell * 1.6) / 2 + i * barCell * 1.6 + barCell * 0.3;
      this.drawPixelFixture(effect, bar, margin, top, barCell, timeMillis, fixtureCount, base);
    });

    matrices.forEach((matrix, i) => {
      const cell = matrixSize / Math.max(matrix.columns, matrix.rows);
      const left = this.maxWidth - margin - (i + 1) * matrixSize - i * gap + (matrixSize - cell * matrix.columns) / 2;
      const top = (this.maxHeight - cell * matrix.rows) / 2;
      this.drawPixelFixture(effect, matrix, left, top, cell, timeMillis, fixtureCount, base);
    });
  }

  private drawPixelFixture(
    effect: EffectPixel,
    fixture: PixelPreviewFixture,
    left: number,
    top: number,
    cell: number,
    timeMillis: number,
    fixtureCount: number,
    base: number[]
  ) {
    const cycles = effect.getCyclesAtMillis(timeMillis, fixture.index, fixtureCount, this.beatsPerMinute);
    const gap = Math.max(1, cell * 0.15);

    for (const part of fixture.parts) {
      let color = base;

      if (cycles !== undefined) {
        const context = Object.assign(new PixelContext(), part);
        context.seed = toInt(effect.seed * 7919 + fixture.index * 131);

        if (effect.mirror) {
          context.x = context.x < 0.5 ? context.x * 2 : (1 - context.x) * 2;
        }

        const [place, level] = samplePixelPattern(effect, cycles, context);
        const stops = effect.palette.ref === 'preset' ? PixelPalette.shadesOf(base) : effect.palette.stops;
        const lit = PixelPalette.colorOf(stops, effect.palette.between, effect.palette.repeat, place).map((component) => component * level);

        color = lit.map((component, i) => {
          switch (effect.blend) {
            case 'mask':
              return base[i] * level;
            case 'add':
              return Math.min(base[i] + component, 1);
            case 'max':
              return Math.max(base[i], component);
            default:
              return component;
          }
        });
      }

      // an unlit pixel still shows where it is
      const [red, green, blue] = color.map((component) => Math.round(component * 255));
      this.ctx.fillStyle = Math.max(red, green, blue) < 40 ? 'rgb(32, 36, 43)' : `rgb(${red}, ${green}, ${blue})`;
      this.ctx.fillRect(left + part.column * cell + gap / 2, top + part.row * cell + gap / 2, cell - gap, cell - gap);
    }
  }

  // the size of the movement on the pan or the tilt, in degrees
  getSize(axis: string): number {
    return axis === 'Pan' ? this.movement.sizePanDegrees : this.movement.sizeTiltDegrees;
  }

  setSize(axis: string, value: any) {
    const degrees = Number(value);

    if (value === '' || value === null || isNaN(degrees) || degrees < 0) {
      return;
    }

    if (axis === 'Pan') {
      this.movement.sizePanDegrees = degrees;
    } else {
      this.movement.sizeTiltDegrees = degrees;
    }

    this.livePreviewService.previewLive();
  }

  // the tempo the grid draws a curve synced to the beat at. a preset can be edited without
  // a composition being open, which leaves the curve on its default tempo.
  public get beatsPerMinute(): number {
    return this.timelineService.selectedComposition?.beatsPerMinute ?? EffectCurve.defaultBeatsPerMinute;
  }

  private drawCurrentValue(currMillis: number, radius: number, lineWidth: number, durationMillis: number, maxHeight: number) {
    const value = this.curve.getValueAtMillis(currMillis, undefined, undefined, this.beatsPerMinute);

    if (value === undefined) {
      // the curve has finished running and left the fixtures to the rest of the preset
      return;
    }

    const currVal = 1 - value;

    const x = (this.maxWidth * (currMillis % durationMillis)) / durationMillis;
    const y = maxHeight * currVal + lineWidth;

    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
    this.ctx.fillStyle = '#fff';
    this.ctx.fill();
    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = '#000';
    this.ctx.stroke();
  }

  private getPhasingCount(): number {
    if (!this.presetService.selectedPreset) {
      return 0;
    }

    // cache the count for a moment. it also depends on the addresses of the fixtures, which
    // can be changed without notifying this component.
    const nowMillis = Date.now();

    if (this.phasingCountMillis === undefined || nowMillis - this.phasingCountMillis > 500) {
      this.phasingCount = this.presetService.getPresetFixtureCount(this.presetService.selectedPreset);
      this.phasingCountMillis = nowMillis;
    }

    return this.phasingCount;
  }

  // the time the grid shows. it is the same window the preview repeats, so the marks on
  // the grid stay in step with the fixtures.
  private getGridDurationMillis(): number {
    const loopMillis = this.curve.getRunLoopMillis(this.getPhasingCount(), this.beatsPerMinute);

    if (loopMillis !== undefined) {
      return loopMillis;
    }

    // a short period is shown a few times over, so the grid does not only hold a single
    // cycle of it
    const lengthMillis = this.curve.getLengthMillis(this.beatsPerMinute);

    return lengthMillis * Math.max(Math.round(4 - lengthMillis / 1000), 1);
  }

  // a dashed line of the grid behind the curve or the movement
  private drawGridLine(x1: number, y1: number, x2: number, y2: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  private startGrid() {
    this.ctx.save();
    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    this.ctx.setLineDash([4, 4]);
  }

  // the grid of a curve: its middle, and the borders of its cycles
  private drawCurveGrid(durationMillis: number, maxHeight: number, width: number) {
    this.startGrid();

    const middle = Math.round(maxHeight * 0.5 + width) + 0.5;
    this.drawGridLine(0, middle, this.maxWidth, middle);

    const lengthMillis = this.curve.getLengthMillis(this.beatsPerMinute);
    const phaseMillis = this.curve.getPhaseMillis(this.beatsPerMinute);
    const cycles = durationMillis / lengthMillis;

    // not a wall of lines for a period far shorter than the grid
    if (cycles <= 16) {
      const firstBorder = (((phaseMillis % lengthMillis) + lengthMillis) % lengthMillis) - lengthMillis;

      for (let millis = firstBorder; millis <= durationMillis; millis += lengthMillis) {
        const x = (this.maxWidth * millis) / durationMillis;

        // the borders of the grid itself are no borders of a cycle
        if (x > 0 && x < this.maxWidth) {
          this.drawGridLine(Math.round(x) + 0.5, 0, Math.round(x) + 0.5, this.maxHeight);
        }
      }
    }

    this.ctx.restore();
  }

  // the movement of the moving heads: its shape, the middle of both axes behind it and where the heads are on it now
  private drawMovement() {
    const movement = this.movement;
    const margin = 8;
    const centerX = this.maxWidth / 2;
    const centerY = this.maxHeight / 2;

    this.startGrid();
    this.drawGridLine(Math.round(centerX) + 0.5, 0, Math.round(centerX) + 0.5, this.maxHeight);
    this.drawGridLine(0, Math.round(centerY) + 0.5, this.maxWidth, Math.round(centerY) + 0.5);
    this.ctx.restore();

    // degrees take the same room either way: the larger size of the two fills the grid
    const scale = Math.min(
      (this.maxWidth - 2 * margin) / Math.max(Math.abs(movement.sizePanDegrees), 1),
      (this.maxHeight - 2 * margin) / Math.max(Math.abs(movement.sizeTiltDegrees), 1)
    );
    const point = (offset: { pan: number; tilt: number }) => [centerX + offset.pan * scale, centerY - offset.tilt * scale];

    this.ctx.lineWidth = 3;
    this.ctx.beginPath();

    for (let i = 0; i <= 120; i++) {
      const shape = movement.getShapePosition((i / 120) % 1);
      const [x, y] = point({ pan: (movement.sizePanDegrees / 2) * shape.pan, tilt: (movement.sizeTiltDegrees / 2) * shape.tilt });

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.stroke();

    // where the heads are now, each step of the chase on its own, the first one bigger
    const phasingCount = this.getPhasingCount();
    const loopMillis = movement.getRunLoopMillis(phasingCount, this.beatsPerMinute);
    const timeMillis = loopMillis === undefined ? this.animationService.timeMillis : this.animationService.timeMillis % loopMillis;
    const chased = movement.getPhasingStepMillis(1, phasingCount, this.beatsPerMinute) !== 0;
    const stepCount = chased ? movement.getPhasingStepCount(phasingCount) : 1;
    const groupSize = Math.max(Math.round(movement.phasingGroupSize), 1);

    for (let step = stepCount - 1; step >= 0; step--) {
      const offset = movement.getOffsetAtMillis(timeMillis, step * groupSize, phasingCount, this.beatsPerMinute);

      if (offset) {
        const [x, y] = point(offset);

        this.ctx.beginPath();
        this.ctx.arc(x, y, step === 0 ? 5 : 3, 0, 2 * Math.PI, false);
        this.ctx.fillStyle = '#fff';
        this.ctx.fill();
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = '#000';
        this.ctx.stroke();
      }
    }
  }

  redraw() {
    if (!this.ctx) {
      return;
    }

    this.ctx.clearRect(0, 0, this.maxWidth, this.maxHeight);
    this.ctx.fillStyle = '#fff';
    this.ctx.strokeStyle = '#fff';

    if (this.isMovement) {
      this.drawMovement();
      return;
    }

    if (this.isPixel) {
      this.drawPixels();
      return;
    }

    // the width of the lines
    const width = 3;

    const durationMillis = this.getGridDurationMillis();
    const maxHeight = this.maxHeight - width * 2;

    this.drawCurveGrid(durationMillis, maxHeight, width);

    this.ctx.lineWidth = width;

    // sample the curve once per pixel of the grid. a finer resolution only produces line
    // segments the canvas cannot resolve anyway.
    const samples = Math.ceil(this.maxWidth);
    const stepMillis = durationMillis / samples;

    // draw the whole curve as a single path. stroking each segment on its own is by far the
    // most expensive part of the redraw and the redraw runs on each animation frame.
    this.ctx.beginPath();

    let drawing = false;

    for (let i = -2; i <= samples + 2; i++) {
      const millis = i * stepMillis;
      const value = this.curve.getValueAtMillis(millis, undefined, undefined, this.beatsPerMinute);

      if (value === undefined) {
        // the curve does not apply here (before or after its run) -> leave a gap
        drawing = false;
        continue;
      }

      // Scale the values to the grid dimensions
      const x = (this.maxWidth * millis) / durationMillis;
      const y = maxHeight * (1 - value) + width;

      if (drawing) {
        this.ctx.lineTo(x, y);
      } else {
        this.ctx.moveTo(x, y);
        drawing = true;
      }
    }

    this.ctx.stroke();

    // draw the current value
    this.drawCurrentValue(this.animationService.timeMillis % durationMillis, 5, width, durationMillis, maxHeight);

    // draw the phasing values (chase), if required. the fixtures of a group run the same
    // step of the chase, so the grid marks each step once, not each fixture of it.
    const phasingCount = this.getPhasingCount();
    const stepCount = this.curve.getPhasingStepCount(phasingCount);

    if (this.curve.getPhasingStepMillis(1, phasingCount, this.beatsPerMinute) === 0) {
      // the steps are not shifted against each other -> they all run on the mark that
      // has just been drawn
      return;
    }

    for (let step = 1; step < stepCount; step++) {
      // the phasing can be negative, which the modulo has to be normalized for
      const phasedMillis = this.animationService.timeMillis - this.curve.getPhasingStepMillis(step, phasingCount, this.beatsPerMinute);

      this.drawCurrentValue(((phasedMillis % durationMillis) + durationMillis) % durationMillis, 3, width, durationMillis, maxHeight);
    }
  }

  private calculateChannelCapabilities() {
    this.availableChannels = this.presetService.getSelectedProfileChannels(this.selectedProfiles);
    this.updateChannelOptions();
  }

  changeProfileSelection($event: any, profile: FixtureProfile) {
    if (this.selectedProfiles.indexOf(profile) >= 0) {
      this.selectedProfiles.splice(this.selectedProfiles.indexOf(profile), 1);
    } else {
      this.selectedProfiles.push(profile);
    }

    this.calculateChannelCapabilities();
  }

  profileChecked(profile: FixtureProfile): boolean {
    return this.selectedProfiles.indexOf(profile) >= 0;
  }

  private updateCapabilitiesAndChannels() {
    // capabilities
    const availableCapabilities: FixtureCapability[] = [];

    if (this.presetService.hasCapabilityDimmer()) {
      const capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.Intensity;
      availableCapabilities.push(capability);
    }

    if (this.presetService.hasCapabilityColor()) {
      let capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.ColorIntensity;
      capability.color = FixtureCapabilityColor.Red;
      availableCapabilities.push(capability);

      capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.ColorIntensity;
      capability.color = FixtureCapabilityColor.Green;
      availableCapabilities.push(capability);

      capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.ColorIntensity;
      capability.color = FixtureCapabilityColor.Blue;
      availableCapabilities.push(capability);
    }

    if (this.presetService.hasCapabilityPanTilt()) {
      let capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.Pan;
      availableCapabilities.push(capability);

      capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.Tilt;
      availableCapabilities.push(capability);
    }

    this.capabilityOptions = availableCapabilities.map((capability, index) => ({
      id: 'capability_' + this.curve?.uuid + '_' + index,
      name: '',
      checked: this.capabilityChecked(capability),
      capability,
    }));

    this.updateCapabilityNames();

    // calculate all profiles
    this.availableProfiles = this.presetService.getSelectedProfiles();

    // select all profiles by default
    this.selectedProfiles = [...this.availableProfiles];

    // calculate all channels
    this.calculateChannelCapabilities();
  }

  private updateChannelOptions() {
    const channelOptions: CurveChannelOption[] = [];
    let profileIndex = 0;

    this.availableChannels.forEach((channels: CachedFixtureChannel[], profile: FixtureProfile) => {
      channels.forEach((channel: CachedFixtureChannel, channelIndex: number) => {
        channelOptions.push({
          id: 'channel_' + this.curve?.uuid + '_' + profileIndex + '_' + channelIndex,
          name: this.getChannelName(profile.name, channel.name),
          checked: this.channelChecked(profile, channel),
          profile,
          channel,
        });
      });

      profileIndex++;
    });

    this.channelOptions = channelOptions;
  }

  private updateOptionNames() {
    this.updateCapabilityNames();

    for (const option of this.channelOptions) {
      option.name = this.getChannelName(option.profile.name, option.channel.name);
    }
  }

  private updateCapabilityNames() {
    for (const option of this.capabilityOptions) {
      const capability = option.capability;
      const typeKey = 'designer.fixtureCapabilityType.' + capability.type;
      const colorKey = 'designer.fixtureCapabilityColor.' + capability.color;

      this.translate.get([typeKey, colorKey]).subscribe((result: any) => {
        option.name = capability.color ? result[typeKey] + ', ' + result[colorKey] : result[typeKey];
      });
    }
  }

  private capabilityChecked(capability: FixtureCapability): boolean {
    if (!this.curve) {
      return false;
    }

    for (const existingCapability of this.curve.capabilities) {
      if (
        this.fixtureService.capabilitiesMatch(
          existingCapability.type,
          capability.type,
          existingCapability.color,
          capability.color,
          null,
          null,
          null,
          null
        )
      ) {
        return true;
      }
    }
    return false;
  }

  toggleCapability(event: any, option: CurveCapabilityOption) {
    const capability = option.capability;

    if (event.currentTarget.checked) {
      // add the capability
      this.curve.capabilities.push(capability);
    } else {
      // Remove the channel
      for (let i = 0; i < this.curve.capabilities.length; i++) {
        const existingCapability = this.curve.capabilities[i];
        if (
          this.fixtureService.capabilitiesMatch(
            existingCapability.type,
            capability.type,
            existingCapability.color,
            capability.color,
            null,
            null,
            null,
            null
          )
        ) {
          this.curve.capabilities.splice(i, 1);
        }
      }
    }

    option.checked = this.capabilityChecked(capability);

    this.effectService.effectsChanged.next();
    this.livePreviewService.previewLive();
  }

  private getChannelName(profileName: string, channelName: string) {
    if (this.availableProfiles.length > 1) {
      return profileName + ' - ' + channelName;
    }

    return channelName;
  }

  private channelChecked(profile: FixtureProfile, channel: CachedFixtureChannel): boolean {
    if (!this.curve) {
      return false;
    }

    for (const profileChannels of this.curve.channels) {
      if (profileChannels.profileUuid === profile.uuid) {
        if (profileChannels.channels.includes(channel.name)) {
          return true;
        }

        break;
      }
    }

    return false;
  }

  toggleChannel(event: any, option: CurveChannelOption) {
    const profile = option.profile;
    const channel = option.channel;

    // add the profile, if necessary
    let profileContained = false;
    for (const profileChannels of this.curve.channels) {
      if (profileChannels.profileUuid === profile.uuid) {
        profileContained = true;
        break;
      }
    }

    if (!profileContained) {
      const profileChannels = new EffectCurveProfileChannels();
      profileChannels.profileUuid = profile.uuid;
      this.curve.channels.push(profileChannels);
    }

    // add or delete the channel
    for (const profileChannels of this.curve.channels) {
      if (profileChannels.profileUuid === profile.uuid) {
        const index = profileChannels.channels.indexOf(channel.name);

        if (index >= 0) {
          profileChannels.channels.splice(index, 1);
        } else {
          profileChannels.channels.push(channel.name);
        }

        break;
      }
    }

    option.checked = this.channelChecked(profile, channel);

    this.effectService.effectsChanged.next();
    this.livePreviewService.previewLive();
  }

  setLengthMillis(value: any) {
    if (!isNaN(value) && value >= this.lengthMillisMin && value <= this.lengthMillisInputMax) {
      this.curve.lengthMillis = +value;
      this.lengthChanged();
    }
  }

  // the slider reports its value after it has changed, so the period cannot be bound to
  // it directly: the phase has to be brought along with the new period, not the old one
  setLengthMillisFromSlider(value: any) {
    if (isNaN(value)) {
      return;
    }

    this.curve.lengthMillis = Math.round(+value);
    this.lengthChanged();
  }

  setLengthBeats(value: any) {
    if (!isNaN(value) && value >= this.lengthBeatsMin && value <= this.lengthBeatsInputMax) {
      this.curve.lengthBeats = +value;
      this.lengthChanged();
    }
  }

  // see setLengthMillisFromSlider
  setLengthBeatsFromSlider(value: any) {
    if (isNaN(value)) {
      return;
    }

    this.curve.lengthBeats = +value;
    this.lengthChanged();
  }

  // the curve keeps the speed and the shape it had when it starts or stops following the
  // tempo, so switching the unit does not throw away what has been set on it
  setLengthMode(lengthMode: string) {
    if (lengthMode === this.curve.lengthMode) {
      return;
    }

    const phaseCycles = this.phaseCycles;

    if (lengthMode === 'beats') {
      // the beats the current period lasts, snapped to the steps the slider offers
      const beats = this.curve.lengthMillis / EffectCurve.getBeatMillis(this.beatsPerMinute);
      this.curve.lengthBeats = this.clamp(Math.round(beats * 4) / 4, this.lengthBeatsMin, this.lengthBeatsInputMax);
    } else {
      const millis = this.curve.getLengthMillis(this.beatsPerMinute);
      this.curve.lengthMillis = this.clamp(Math.round(millis), this.lengthMillisMin, this.lengthMillisInputMax);
    }

    this.curve.lengthMode = lengthMode;

    // the phase is bound to the period, which is now measured in another unit
    this.setPhaseCycles(phaseCycles);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(Math.min(value, max), min);
  }

  private lengthChanged() {
    // the phase is bound to the period, which just changed under it
    this.wrapPhase();
    this.livePreviewService.previewLive();
  }

  // the phase repeats with the period: shifting the curve by a full period lands on the
  // same curve again. keeping it inside one period does not change what the curve puts
  // on its fixtures and keeps it on the scale of its slider.
  private wrapPhase() {
    if (this.curve.isBeatSynced()) {
      if (this.curve.lengthBeats > 0 && Math.abs(this.curve.phaseBeats) > this.curve.lengthBeats) {
        this.curve.phaseBeats = this.curve.phaseBeats % this.curve.lengthBeats;
      }

      return;
    }

    if (this.curve.lengthMillis > 0 && Math.abs(this.curve.phaseMillis) > this.curve.lengthMillis) {
      this.curve.phaseMillis = Math.round(this.curve.phaseMillis % this.curve.lengthMillis);
    }
  }

  // the phase as the part of the period it shifts the curve by
  get phaseCycles(): number {
    if (this.curve.isBeatSynced()) {
      if (!this.curve.lengthBeats) {
        return 0;
      }

      return this.curve.phaseBeats / this.curve.lengthBeats;
    }

    if (!this.curve.lengthMillis) {
      return 0;
    }

    return this.curve.phaseMillis / this.curve.lengthMillis;
  }

  setPhaseCycles(value: any) {
    if (isNaN(value)) {
      return;
    }

    if (this.curve.isBeatSynced()) {
      // the slider walks the period in small steps, which would leave the phase with far
      // more decimals than its input box can show
      this.curve.phaseBeats = Math.round(+value * this.curve.lengthBeats * 1000) / 1000;
    } else {
      this.curve.phaseMillis = Math.round(+value * this.curve.lengthMillis);
    }

    this.livePreviewService.previewLive();
  }

  setAmplitude(value: any) {
    if (!isNaN(value) && value >= this.amplitudeMin && value <= this.amplitudeMax) {
      this.curve.amplitude = +value;
      this.livePreviewService.previewLive();
    }
  }

  setPosition(value: any) {
    if (!isNaN(value) && value >= this.positionMin && value <= this.positionMax) {
      this.curve.position = +value;
      this.livePreviewService.previewLive();
    }
  }

  // the position as the part of the way the curve can be moved at its amplitude: from
  // half the amplitude below the bottom, where it rests flat on it, to half of it above
  // the top
  get positionReach(): number {
    return (this.curve.position + this.curve.amplitude / 2) / (1 + this.curve.amplitude);
  }

  setPositionReach(value: any) {
    if (isNaN(value)) {
      return;
    }

    const position = +value * (1 + this.curve.amplitude) - this.curve.amplitude / 2;

    // the slider walks the way in small steps, which would leave the position with far
    // more decimals than its input box can show
    this.curve.position = Math.round(position * 1000) / 1000;
    this.livePreviewService.previewLive();
  }

  setPhaseMillis(value: any) {
    if (!isNaN(value) && Math.abs(value) <= this.curve.lengthMillis) {
      this.curve.phaseMillis = +value;
      this.livePreviewService.previewLive();
    }
  }

  setPhaseBeats(value: any) {
    if (!isNaN(value) && Math.abs(value) <= this.curve.lengthBeats) {
      this.curve.phaseBeats = +value;
      this.livePreviewService.previewLive();
    }
  }

  setPhasingMillis(value: any) {
    if (!isNaN(value) && Math.abs(value) <= this.phasingMillisInputMax) {
      this.curve.phasingMillis = +value;
      this.livePreviewService.previewLive();
    }
  }

  setPhasingBeats(value: any) {
    if (!isNaN(value) && Math.abs(value) <= this.phasingBeatsInputMax) {
      this.curve.phasingBeats = +value;
      this.livePreviewService.previewLive();
    }
  }

  setPhasingCycles(value: any) {
    if (!isNaN(value) && value >= this.phasingCyclesMin && value <= this.phasingCyclesMax) {
      this.curve.phasingCycles = +value;
      this.livePreviewService.previewLive();
    }
  }

  setPhasingMode(phasingMode: string) {
    this.curve.phasingMode = phasingMode;
    this.livePreviewService.previewLive();
  }

  // whether the advanced settings hold anything else than their defaults. the button
  // marks it, so settings that are not on this screen are not lost out of sight.
  advancedActive(): boolean {
    return this.curve.runMode !== 'infinite' || this.curve.dutyCycle !== 0.5 || this.curve.phasingGroupSize !== 1;
  }

  openAdvanced() {
    this.modalService.show(EffectCurveAdvancedComponent, {
      keyboard: true,
      ignoreBackdropClick: false,
      class: '',
      initialState: { curve: this.curve },
    });
  }
}
