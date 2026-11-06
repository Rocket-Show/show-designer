import { Component, ElementRef, Input, NgZone, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
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
import { AudioBus, TimelineService } from '../../services/timeline.service';
import { BsModalService } from 'ngx-bootstrap/modal';
import { EffectCurveAdvancedComponent } from './effect-curve-advanced/effect-curve-advanced.component';
import { EffectPixel } from '../../models/effect-pixel';
import { CachedFixture } from '../../models/cached-fixture';
import { hexToRgb, PixelPalette, PixelPaletteStop, ProjectPixelPalette } from '../../models/pixel-palette';
import {
  PixelContext,
  PixelPatternOptions,
  pixelPatternOptions,
  pixelPatternsForBars,
  pixelPatternsForMatrices,
  samplePixelPattern,
} from '../../models/pixel-pattern';
import { BuiltInPixelPalette, builtInPixelPalettes, pixelPaletteCss, pixelPaletteOf, pixelStopsCss } from '../../models/pixel-palettes';
import { UuidService } from '../../services/uuid.service';
import { GradientStop } from '../../gradient-editor/gradient-editor.component';
import { toInt } from '../../models/pixel-math';
import { ColorService } from '../../services/color.service';
import { ProjectService } from '../../services/project.service';
import { FixtureCapabilityColor as PixelColor } from '../../models/fixture-capability';
import { getStagePlacements } from '../../models/pan-tilt';
import { pixelHousingSize, pixelStagePosition, stagePixelPlaces } from '../../models/pixel-stage';
import { PIXEL_FONT, pixelFontBitmap, textBitmap } from '../../models/pixel-text';
import { encodeBase64, PixelBitmap } from '../../models/pixel-bitmap';
import {
  animationMillis,
  fittedPixelImageSize,
  imageBitmapOf,
  PIXEL_IMAGE_SIZES,
  PixelPicture,
  pixelImageBytes,
  pixelImageSize as longestSideImageSize,
} from '../../models/pixel-image';
import { PixelAudio } from '../../models/pixel-audio';
import { demoAudioFrames } from '../../models/pixel-audio-analysis';

// a fixture in the preview of a pixel effect: where each of its parts is, and the step of the chase it takes
interface PixelPreviewFixture {
  index: number;
  columns: number;
  rows: number;
  parts: PixelContext[];
  // shown while the preset lights no fixture in colors yet
  example?: boolean;

  // the colors of its lit pixels, a pixel of this canvas each, drawn blurred over them to let them glow (see
  // drawPixelGlow). Made with the first preview.
  glow?: CanvasRenderingContext2D;
}

// the housing around the pixels of a fixture in the preview of a pixel effect, and its edge
const PIXEL_HOUSING_COLOR = '#08090b';
const PIXEL_HOUSING_EDGE_COLOR = 'rgba(255, 255, 255, 0.07)';

// the darkest a pixel is drawn in, so one which is off still shows where it is: a dark grey, like an LED in the dark,
// and a lighter one in the picture of the stage, where no housing is drawn around them
const PIXEL_OFF_COLOR = [20, 23, 28];
const STAGE_PIXEL_OFF_COLOR = [36, 40, 48];

// how strong the glow around the lit pixels is, and how far it reaches (in pixels of the fixture)
const PIXEL_GLOW_ALPHA = 0.8;
const PIXEL_GLOW_REACH = 0.9;

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

// how tall the tiles to pick a pattern from are at least (two rows), how far they keep from the pattern picked and from
// the edges of the window, in CSS pixels
const PICKER_MIN_HEIGHT = 180;
const PICKER_GAP = 4;
const PICKER_MARGIN = 8;

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

  // the device pixels the canvas has per CSS pixel, to be sharp on a screen with more than one
  private pixelRatio = 1;

  // whether the browser blurs what is drawn on a canvas (a browser without it lets the pixels glow less smoothly)
  private canvasBlurs = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

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

  public readonly pixelBlends = ['replace', 'mask', 'add', 'max'];
  public readonly pixelSpreads = ['fixture', 'stage'];
  public readonly pixelFonts = [PIXEL_FONT, 'sans-serif', 'serif', 'monospace'];
  public readonly pixelAligns = ['left', 'center', 'right'];
  public readonly pixelFits = ['contain', 'cover', 'stretch', 'pixels'];
  public readonly pixelTextColors = ['along', 'letters', 'one'];
  public readonly pixelImageColors = ['own', 'palette'];
  public readonly pixelImageSizes = PIXEL_IMAGE_SIZES;
  public readonly pixelAudioSources = ['off', 'composition'];
  public readonly pixelAudioBands = ['full', 'bass', 'mid', 'high'];
  public readonly pixelAudioFollows = ['brightness', 'size'];

  // how large an image is made when it is picked: as large as the pixels it is shown on, or its longest side as many
  // pixels as picked (for fixtures still to come), and whether the last one could not be read
  public pixelImageSize: number | 'fixtures' = 'fixtures';
  public pixelImageFailed = false;
  public readonly pixelViews = ['front', 'top'];
  public readonly pixelPalettes = builtInPixelPalettes;

  // the tab the panel on the right shows: the colors or how they are blended
  public pixelTab = 'colors';

  // the parts of the preset in the picture of the stage, for an effect spread across it, and the view it is seen in
  private stagePreview: { view: string; parts: { place: PixelContext; index: number }[]; count: number; example: boolean };

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

      // the tiles close with the effect
      this.closePicker();
    }
  }

  @ViewChild('curveGrid', { static: true }) curveGrid: ElementRef;

  // the patterns to pick from, as they look (see drawPatternTiles)
  @ViewChildren('patternTile') patternTiles: QueryList<ElementRef<HTMLCanvasElement>>;
  public pickingPattern = false;

  // the pattern picked, which opens the tiles below it
  @ViewChild('pickerToggle') pickerToggle: ElementRef<HTMLElement>;

  // The tiles, placed over the panels once they are open, and again when the panel scrolls or the window changes its
  // size. They close with a click anywhere else and with Escape.
  private pickerElement: HTMLElement;
  private pickerListeners: (() => void)[] = [];

  @ViewChild('picker') set picker(picker: ElementRef<HTMLElement>) {
    const element = picker?.nativeElement;

    if (element === this.pickerElement) {
      return;
    }

    this.removePickerListeners();
    this.pickerElement = element;

    if (element) {
      this.placePicker();
      this.addPickerListeners();
    }
  }
  public readonly pixelPatternGroups = [
    // with the icons of the fixtures in the fixture list
    { name: 'bars', icon: 'icon-pixel-bar', patterns: pixelPatternsForBars },
    { name: 'matrices', icon: 'icon-matrix', patterns: pixelPatternsForMatrices },
  ];

  // a text and an image to show the patterns with, where the effect has none of its own
  private tileText = pixelFontBitmap('Ab');
  private tileImage = gradientBitmap();

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
    private colorService: ColorService,
    private projectService?: ProjectService,
    private uuidService?: UuidService
  ) {
    this.fixtureSelectionChangedSubscription = this.presetService.fixtureSelectionChanged.subscribe(() => {
      this.pixelPreviewFixtures = undefined;
      this.stagePreview = undefined;
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

    // The canvas gets as many pixels as the screen shows it with, the grid keeps drawing on the size it has in CSS
    // pixels. A ratio of 1 leaves the canvas as it is.
    this.pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);

    if (this.ctx && this.pixelRatio !== 1) {
      canvas.style.width = this.maxWidth + 'px';
      canvas.style.height = this.maxHeight + 'px';
      canvas.width = Math.round(this.maxWidth * this.pixelRatio);
      canvas.height = Math.round(this.maxHeight * this.pixelRatio);
      this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    }

    this.redraw();
  }

  ngOnDestroy() {
    this.stopAnimation();
    this.removePickerListeners();
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

  // what the pattern of a pixel effect lets be set (see pixelPatternOptions)
  private get patternOptions(): PixelPatternOptions {
    return pixelPatternOptions[this.pixelEffect.pattern] || {};
  }

  usesSize(): boolean {
    return !this.patternOptions.withoutSize;
  }

  usesDirection(): boolean {
    return !!this.patternOptions.directions;
  }

  usesShape(): boolean {
    return !!this.patternOptions.shapes;
  }

  usesBounce(): boolean {
    return !!this.patternOptions.bounce;
  }

  usesSoftness(): boolean {
    return !!this.patternOptions.softness;
  }

  get pixelDirections(): string[] {
    return this.patternOptions.directions || [];
  }

  get pixelShapes(): string[] {
    return this.patternOptions.shapes || [];
  }

  // The direction and the shape the pattern runs in: one it does not know (e.g. the one of another pattern before) is
  // played as its first one
  get pixelDirection(): string {
    return this.pixelDirections.indexOf(this.pixelEffect.direction) >= 0 ? this.pixelEffect.direction : this.pixelDirections[0];
  }

  get pixelShape(): string {
    return this.pixelShapes.indexOf(this.pixelEffect.shape) >= 0 ? this.pixelEffect.shape : this.pixelShapes[0];
  }

  // the size means something else for each pattern (a tail, rings, a density, ...)
  pixelSizeLabel(): string {
    return 'designer.effect.pixel-size-' + this.pixelEffect.pattern;
  }

  pixelSoftnessLabel(): string {
    switch (this.patternOptions.softness) {
      case 'fade':
        return 'designer.effect.pixel-fade';
      case 'trail':
        return 'designer.effect.pixel-trail';
      default:
        return 'designer.effect.pixel-softness';
    }
  }

  // what the shape is of: an outline, the path of a dot or a curve
  pixelShapeLabel(): string {
    switch (this.pixelEffect.pattern) {
      case 'orbit':
        return 'designer.effect.pixel-path';
      case 'wave':
        return 'designer.effect.pixel-curve';
      default:
        return 'designer.effect.pixel-shape';
    }
  }

  setPattern(pattern: string) {
    this.pixelEffect.pattern = pattern;

    // a text to start with
    if (pattern === 'text' && !this.pixelEffect.text) {
      this.pixelEffect.text = 'Rocket Show';
    }

    if (pattern === 'text') {
      this.renderText();
    }

    this.livePreviewService.previewLive();
  }

  // the icon of the fixtures the pattern is made for, like in the fixture list
  pixelPatternIcon(): string {
    return (this.pixelPatternGroups.find((group) => group.patterns.includes(this.pixelEffect.pattern)) || this.pixelPatternGroups[0]).icon;
  }

  togglePicker() {
    this.pickingPattern = !this.pickingPattern;
  }

  closePicker() {
    this.pickingPattern = false;
  }

  // a pattern picked from the tiles
  pickPattern(pattern: string) {
    this.closePicker();
    this.setPattern(pattern);
  }

  // The tiles open over the panels, below the pattern picked and as far down as the window shows them, scrolling inside.
  // Where less than two rows are left below it, but more above it, they open above it.
  placePicker() {
    const picker = this.pickerElement;
    const toggle = this.pickerToggle?.nativeElement;

    if (!picker || !toggle) {
      return;
    }

    const anchor = toggle.getBoundingClientRect();
    const width = Math.min(picker.offsetWidth, window.innerWidth - 2 * PICKER_MARGIN);
    const below = Math.floor(window.innerHeight - anchor.bottom - PICKER_GAP - PICKER_MARGIN);
    const above = Math.floor(anchor.top - PICKER_GAP - PICKER_MARGIN);
    const upwards = below < PICKER_MIN_HEIGHT && above > below;

    picker.style.left = Math.max(PICKER_MARGIN, Math.min(anchor.left, window.innerWidth - width - PICKER_MARGIN)) + 'px';

    if (upwards) {
      picker.style.top = '';
      picker.style.bottom = window.innerHeight - anchor.top + PICKER_GAP + 'px';
    } else {
      picker.style.top = anchor.bottom + PICKER_GAP + 'px';
      picker.style.bottom = '';
    }

    picker.style.maxHeight = Math.max(upwards ? above : below, 0) + 'px';
  }

  private addPickerListeners() {
    this.ngZone.runOutsideAngular(() => {
      const place = () => this.placePicker();

      // a click anywhere but on the tiles and on the pattern picked (which closes them itself)
      const pointerDown = (event: Event) => {
        const target = event.target as Node;

        if (!this.pickerElement?.contains(target) && !this.pickerToggle?.nativeElement.contains(target)) {
          this.ngZone.run(() => this.closePicker());
        }
      };
      const keyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          this.ngZone.run(() => this.closePicker());
        }
      };

      // the scroll of any panel, which does not bubble up
      window.addEventListener('scroll', place, true);
      window.addEventListener('resize', place);
      document.addEventListener('pointerdown', pointerDown, true);
      document.addEventListener('keydown', keyDown);

      this.pickerListeners = [
        () => window.removeEventListener('scroll', place, true),
        () => window.removeEventListener('resize', place),
        () => document.removeEventListener('pointerdown', pointerDown, true),
        () => document.removeEventListener('keydown', keyDown),
      ];
    });
  }

  private removePickerListeners() {
    this.pickerListeners.forEach((remove) => remove());
    this.pickerListeners = [];
  }

  // Each pattern on a bar or a matrix in the colors of the effect, moving: what it looks like before it is picked.
  // Drawn with the grid in each frame while the tiles are open.
  private drawPatternTiles() {
    const effect = this.pixelEffect;
    const preset = this.presetService.selectedPreset;
    const base = hexToRgb((preset && this.colorService.getPresetLightColor(preset)) || '#ffffff');
    const cycles = this.animationService.timeMillis / 2000;

    this.patternTiles?.forEach((tile) => {
      const canvas = tile.nativeElement;

      // as many pixels as the screen shows it with
      if (canvas.width !== Math.round(84 * this.pixelRatio)) {
        canvas.width = Math.round(84 * this.pixelRatio);
        canvas.height = Math.round(44 * this.pixelRatio);
      }

      const context = canvas.getContext('2d');
      const pattern = canvas.dataset.pattern;
      const matrix = canvas.dataset.matrix === 'true';
      const columns = matrix ? 10 : 16;
      const rows = matrix ? 5 : 1;
      const cell = Math.min(canvas.width / columns, canvas.height / rows);
      const left = (canvas.width - cell * columns) / 2;
      const top = (canvas.height - cell * rows) / 2;
      const ownBitmap = effect.pattern === pattern ? effect.bitmap : undefined;
      const settings = { ...effect, pattern, bitmap: ownBitmap || (pattern === 'text' ? this.tileText : this.tileImage) };

      context.clearRect(0, 0, canvas.width, canvas.height);

      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const place = Object.assign(new PixelContext(), {
            x: (column + 0.5) / columns,
            y: (row + 0.5) / rows,
            column,
            row,
            columns,
            rows,
            aspectX: 1,
            aspectY: rows / columns,
          });
          const [red, green, blue] = this.pixelColorOf(settings as EffectPixel, place, cycles, 0, base).map((component) =>
            Math.round(Math.min(Math.max(component, 0), 1) * 255)
          );

          context.fillStyle = `rgb(${Math.max(red, PIXEL_OFF_COLOR[0])}, ${Math.max(green, PIXEL_OFF_COLOR[1])}, ${Math.max(
            blue,
            PIXEL_OFF_COLOR[2]
          )})`;
          context.fillRect(left + column * cell + 0.5, top + row * cell + 0.5, cell - 1, cell - 1);
        }
      }
    });
  }

  // ---- a text or an image

  // the ways the text or the image scrolls, the first one where it does without being told
  get pixelScrolls(): string[] {
    return this.pixelEffect.pattern === 'text' ? ['left', 'right', 'up', 'down', 'none'] : ['none', 'left', 'right', 'up', 'down'];
  }

  get pixelScroll(): string {
    return this.pixelScrolls.indexOf(this.pixelEffect.scroll) >= 0 ? this.pixelEffect.scroll : this.pixelScrolls[0];
  }

  // a text which does not scroll along stands where it is aligned
  usesAlign(): boolean {
    return this.pixelEffect.pattern === 'text' && this.pixelScroll !== 'left' && this.pixelScroll !== 'right';
  }

  // the picture of the text in its font, made anew whenever one of them changes
  private renderText() {
    const effect = this.pixelEffect;
    effect.bitmap = textBitmap(effect.text, effect.font, effect.textHeight);
  }

  setText(text: string) {
    this.pixelEffect.text = text ?? '';
    this.renderText();
    this.livePreviewService.previewLive();
  }

  setFont(font: string) {
    this.pixelEffect.font = font;
    this.renderText();
    this.livePreviewService.previewLive();
  }

  setTextHeight(value: any) {
    const height = Number(value);

    if (value !== '' && value !== null && Number.isInteger(height) && height >= 4 && height <= 64) {
      this.pixelEffect.textHeight = height;
      this.renderText();
      this.livePreviewService.previewLive();
    }
  }

  setScroll(scroll: string) {
    this.pixelEffect.scroll = scroll;
    this.livePreviewService.previewLive();
  }

  setAlign(align: string) {
    this.pixelEffect.align = align;
    this.livePreviewService.previewLive();
  }

  setOffsetY(value: any) {
    const offset = Number(value);

    if (value !== '' && value !== null && Number.isInteger(offset) && Math.abs(offset) <= 64) {
      this.pixelEffect.offsetY = offset;
      this.livePreviewService.previewLive();
    }
  }

  setTextColors(colors: string) {
    this.pixelEffect.textColors = colors;
    this.livePreviewService.previewLive();
  }

  setFit(fit: string) {
    this.pixelEffect.fit = fit;
    this.livePreviewService.previewLive();
  }

  setImageColors(colors: string) {
    this.pixelEffect.imageColors = colors;
    this.livePreviewService.previewLive();
  }

  // An image picked: made as small as asked and kept as its pixels. An animation runs through its frames in a period,
  // which starts as long as the animation takes.
  async pickImage(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    const effect = this.pixelEffect;

    try {
      const size = this.pixelImageSize;
      const pictures = this.pixelImagePictures();

      effect.bitmap = await imageBitmapOf(file, (width, height) =>
        size === 'fixtures' ? fittedPixelImageSize(width, height, pictures) : longestSideImageSize(width, height, size)
      );
      effect.imageName = file.name;
      this.pixelImageFailed = false;

      const millis = animationMillis(effect.bitmap);

      if (millis > 0) {
        effect.lengthMode = 'millis';
        effect.lengthMillis = millis;
      }

      this.livePreviewService.previewLive();
    } catch (error) {
      this.pixelImageFailed = true;
    }

    input.value = '';
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

  // ---- the palettes of the project, and editing the colors of the effect

  get projectPalettes(): ProjectPixelPalette[] {
    return this.projectService?.project?.pixelPalettes || [];
  }

  // a palette of the project picked: the effect keeps a copy of its colors
  setProjectPalette(palette: ProjectPixelPalette) {
    this.pixelEffect.palette = new PixelPalette({
      ref: palette.uuid,
      stops: palette.stops.map((stop) => ({ position: stop.position, color: stop.color })),
      between: palette.between,
      repeat: palette.repeat,
    });
    this.livePreviewService.previewLive();
  }

  stopsCss(stops: PixelPaletteStop[], between: string): string {
    return pixelStopsCss(stops, between);
  }

  // Each edit changes the colors of the effect alone: the palette it was picked from stays as it is
  private editedPalette() {
    this.pixelEffect.palette.ref = 'custom';
    this.livePreviewService.previewLive();
  }

  // the colors as the gradient editor left them: moved, added, taken away or picked anew
  setStops(stops: GradientStop[]) {
    this.pixelEffect.palette.stops = stops.map((stop) => new PixelPaletteStop({ position: stop.position, color: stop.color }));
    this.editedPalette();
  }

  setPaletteBetween(between: string) {
    this.pixelEffect.palette.between = between;
    this.editedPalette();
  }

  setPaletteRepeat(repeat: string) {
    this.pixelEffect.palette.repeat = repeat;
    this.editedPalette();
  }

  // the colors of the effect saved with the project under a name, which the effect is painted in from then on
  savePalette(name: string) {
    const project = this.projectService?.project;

    if (!project || !name || !name.trim()) {
      return;
    }

    const effectPalette = this.pixelEffect.palette;
    const palette = new ProjectPixelPalette({
      uuid: this.uuidService ? this.uuidService.getUuid() : 'palette-' + Date.now(),
      name: name.trim(),
      stops: effectPalette.stops.map((stop) => ({ position: stop.position, color: stop.color })),
      between: effectPalette.between,
      repeat: effectPalette.repeat,
    });

    project.pixelPalettes.push(palette);
    effectPalette.ref = palette.uuid;
    this.livePreviewService.previewLive();
  }

  deleteProjectPalette(palette: ProjectPixelPalette) {
    const palettes = this.projectService.project.pixelPalettes;
    palettes.splice(palettes.indexOf(palette), 1);

    // an effect painted in it keeps its colors
    if (this.pixelEffect.palette.ref === palette.uuid) {
      this.pixelEffect.palette.ref = 'custom';
    }
  }

  setBlend(blend: string) {
    this.pixelEffect.blend = blend;
    this.livePreviewService.previewLive();
  }

  // paint each fixture on its own or one picture across the stage
  setSpread(spread: string) {
    this.pixelEffect.spread = spread;
    this.livePreviewService.previewLive();
  }

  setView(view: string) {
    this.pixelEffect.view = view;
    this.livePreviewService.previewLive();
  }

  setWhiteLed(whiteLed: boolean) {
    this.pixelEffect.whiteLed = whiteLed;
    this.livePreviewService.previewLive();
  }

  // whether the preset sets the dimmer to 0 in one of its steps: the effect does not light the fixtures with a dimmer
  // then
  dimmedToZero(): boolean {
    const preset = this.presetService.selectedPreset;

    return !!preset?.steps?.some((step) =>
      step.fixtureCapabilityValues.some((value) => value.type === FixtureCapabilityType.Intensity && value.valuePercentage === 0)
    );
  }

  // ---- the audio it follows

  // the level meter and the wave of the audio show it, the other patterns follow it
  showsAudio(): boolean {
    return this.pixelEffect.pattern === 'meter' || this.pixelEffect.pattern === 'scope';
  }

  setAudioSource(source: string) {
    this.pixelEffect.audioSource = source;
    this.livePreviewService.previewLive();
  }

  // The buses to pick from: the ones of Rocket Show, and the ones the effect follows which are no longer there (none
  // where the designer doesn't run in Rocket Show)
  get audioBusChoices(): AudioBus[] {
    const buses = this.timelineService.audioBuses;

    if (buses.length === 0) {
      return buses;
    }

    const gone = this.pixelEffect.audioBuses.filter((uuid) => !buses.some((bus) => bus.uuid === uuid)).map((uuid) => ({ uuid, name: '' }));

    return gone.length ? [...buses, ...gone] : buses;
  }

  // following none of them by name is following all of them
  followsAudioBus(uuid: string): boolean {
    return this.pixelEffect.audioBuses.length === 0 || this.pixelEffect.audioBuses.includes(uuid);
  }

  // one bus is followed at least
  isLastAudioBus(uuid: string): boolean {
    const followed = this.audioBusChoices.filter((bus) => this.followsAudioBus(bus.uuid));

    return followed.length === 1 && followed[0].uuid === uuid;
  }

  // a bus followed or not anymore: all of the ones of Rocket Show followed are all of them, also the ones added later
  switchAudioBus(uuid: string) {
    const followed = this.audioBusChoices.map((bus) => bus.uuid).filter((busUuid) => this.followsAudioBus(busUuid) !== (busUuid === uuid));
    const all = this.timelineService.audioBuses.every((bus) => followed.includes(bus.uuid));

    this.pixelEffect.audioBuses = all ? [] : followed;
    this.livePreviewService.previewLive();
  }

  previewsAudioBuses(): boolean {
    return this.timelineService.previewsAudioBuses();
  }

  setAudioBand(band: string) {
    this.pixelEffect.audioBand = band;
    this.livePreviewService.previewLive();
  }

  setAudioFollows(follows: string) {
    this.pixelEffect.audioFollows = follows;
    this.livePreviewService.previewLive();
  }

  // the gain and the floor in dB, the attack and the release in ms
  setAudioNumber(key: 'audioGainDb' | 'audioFloorDb' | 'audioAttackMillis' | 'audioReleaseMillis', value: any) {
    const number = Number(value);
    const allowed = {
      audioGainDb: [-40, 40],
      audioFloorDb: [-100, -6],
      audioAttackMillis: [0, 5000],
      audioReleaseMillis: [0, 10000],
    }[key];

    if (value !== '' && value !== null && !isNaN(number) && number >= allowed[0] && number <= allowed[1]) {
      this.pixelEffect[key] = number;
      this.livePreviewService.previewLive();
    }
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
    return pixelPaletteCss(palette, (preset && this.colorService.getPresetLightColor(preset)) || '#ffffff');
  }

  // The pictures an image is shown on: each fixture of the preset lighting in colors (its matrix, its pixels in a row
  // or itself), or all of them together across the stage. None while the preset lights none.
  pixelImagePictures(): PixelPicture[] {
    if (this.pixelEffect.spread === 'stage') {
      const stage = this.getStagePreview();

      return stage.example || stage.parts.length === 0 ? [] : [stage.parts[0].place];
    }

    const fixtures = this.getPixelPreviewFixtures();

    return fixtures.some((fixture) => fixture.example) ? [] : fixtures.map((fixture) => fixture.parts[0]);
  }

  // what the pixels of the image take in the project: their size, their frames and their bytes
  get pixelImageStored(): { width: number; height: number; frames: number; size: string } {
    const bitmap = this.pixelEffect.bitmap;

    if (!bitmap || !this.pixelEffect.imageName) {
      return undefined;
    }

    const bytes = pixelImageBytes(bitmap);
    const size = bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB';

    return { width: bitmap.width, height: bitmap.height, frames: bitmap.frames.length, size };
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
      fixtures.push({ ...this.examplePixelFixture(0, 12, 1), example: true }, { ...this.examplePixelFixture(1, 8, 8), example: true });
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
    if (this.pixelEffect.spread === 'stage') {
      this.drawStagePixels();
      return;
    }

    const effect = this.pixelEffect;
    const fixtures = this.getPixelPreviewFixtures().slice(0, 8);
    const bars = fixtures.filter((fixture) => fixture.rows === 1).slice(0, 6);
    const matrices = fixtures.filter((fixture) => fixture.rows > 1).slice(0, 2);
    const margin = 6;
    // room for the housings around the pixels between the fixtures
    const gap = 10;
    const preset = this.presetService.selectedPreset;
    const base = hexToRgb((preset && this.colorService.getPresetLightColor(preset)) || '#ffffff');
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

  // A fixture of the preview with its pixels as the effect lights them now: in a dark housing, each a rounded LED, the
  // lit ones glowing
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
    const width = fixture.columns * cell;
    const height = fixture.rows * cell;
    const pad = Math.max(1.5, cell * 0.26);
    const gap = Math.max(0.5, cell * 0.15);
    const glow = this.pixelGlowOf(fixture);

    this.ctx.fillStyle = PIXEL_HOUSING_COLOR;
    this.roundedRect(left - pad, top - pad, width + pad * 2, height + pad * 2, Math.min(5, pad * 1.4));
    this.ctx.fill();
    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = PIXEL_HOUSING_EDGE_COLOR;
    this.ctx.stroke();

    glow?.clearRect(0, 0, fixture.columns, fixture.rows);

    for (const part of fixture.parts) {
      const [red, green, blue] = this.pixelColorOf(effect, part, cycles, fixture.index, base).map((component) =>
        Math.round(Math.min(Math.max(component, 0), 1) * 255)
      );

      this.ctx.fillStyle = `rgb(${Math.max(red, PIXEL_OFF_COLOR[0])}, ${Math.max(green, PIXEL_OFF_COLOR[1])}, ${Math.max(
        blue,
        PIXEL_OFF_COLOR[2]
      )})`;
      this.roundedRect(left + part.column * cell + gap / 2, top + part.row * cell + gap / 2, cell - gap, cell - gap, cell * 0.2);
      this.ctx.fill();

      if (glow) {
        glow.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        glow.fillRect(part.column, part.row, 1, 1);
      }
    }

    if (glow) {
      this.drawPixelGlow(glow.canvas, left, top, width, height, cell);
    }
  }

  // The picture of the stage the parts of the preset make up, each part a pixel where it is in it (see pixel-stage),
  // with the glow of the lit ones
  private drawStagePixels() {
    const effect = this.pixelEffect;
    const stage = this.getStagePreview();
    const first = stage.parts[0]?.place;

    if (!first) {
      return;
    }

    const preset = this.presetService.selectedPreset;
    const base = hexToRgb((preset && this.colorService.getPresetLightColor(preset)) || '#ffffff');
    const loopMillis = effect.getRunLoopMillis(stage.count, this.beatsPerMinute);
    const timeMillis = loopMillis === undefined ? this.animationService.timeMillis : this.animationService.timeMillis % loopMillis;

    // the picture as large as it fits in its aspect, a picture of one row (or column) across the middle
    const margin = 10;
    const width = this.maxWidth - margin * 2;
    const height = this.maxHeight - margin * 2;
    const scale = Math.min(first.aspectX > 0 ? width / first.aspectX : Infinity, first.aspectY > 0 ? height / first.aspectY : Infinity);
    const pictureWidth = first.aspectX * scale;
    const pictureHeight = first.aspectY * scale;
    const left = (this.maxWidth - pictureWidth) / 2;
    const top = (this.maxHeight - pictureHeight) / 2;
    const cell = Math.max(2, Math.min(pictureWidth / first.columns, first.rows > 1 ? pictureHeight / first.rows : height, 16) * 0.8);

    for (const part of stage.parts) {
      const cycles = effect.getCyclesAtMillis(timeMillis, part.index, stage.count, this.beatsPerMinute);
      const [red, green, blue] = this.pixelColorOf(effect, part.place, cycles, part.index, base, true).map((component) =>
        Math.round(Math.min(Math.max(component, 0), 1) * 255)
      );
      const x = left + part.place.x * pictureWidth - cell / 2;
      const y = top + part.place.y * pictureHeight - cell / 2;

      this.ctx.save();
      // lit ones glow around them
      this.ctx.shadowColor = `rgba(${red}, ${green}, ${blue}, ${PIXEL_GLOW_ALPHA})`;
      this.ctx.shadowBlur = Math.max(red, green, blue) > 0 ? cell * PIXEL_GLOW_REACH * 2 * this.pixelRatio : 0;
      this.ctx.fillStyle = `rgb(${Math.max(red, STAGE_PIXEL_OFF_COLOR[0])}, ${Math.max(green, STAGE_PIXEL_OFF_COLOR[1])}, ${Math.max(
        blue,
        STAGE_PIXEL_OFF_COLOR[2]
      )})`;
      this.roundedRect(x, y, cell, cell, cell * 0.2);
      this.ctx.fill();
      this.ctx.restore();
    }
  }

  // The parts of the preset lighting in colors where they are in the picture of the stage, like the preview of the
  // designer and Rocket Show see them (see PreviewService.getStagePixelPlace), with their places in the chase of the
  // preset. None picked yet: three bars side by side.
  private getStagePreview(): { view: string; parts: { place: PixelContext; index: number }[]; count: number; example: boolean } {
    const view = this.pixelEffect.view;

    if (this.stagePreview && this.stagePreview.view === view) {
      return this.stagePreview;
    }

    const preset = this.presetService.selectedPreset;
    const project = this.projectService?.project;
    const parts: CachedFixture[] = [];
    let indices = new Map<string, number>();
    let count = 1;

    if (preset && project) {
      const chase = this.presetService.getPresetWholeFixtureChase(preset);
      indices = chase.indices;
      count = chase.count;

      for (const cachedFixture of this.fixtureService.cachedFixtures) {
        const lightsInColors = cachedFixture.channels.some((channel) =>
          channel.capabilities.some(
            (capability) =>
              capability.capability.type === FixtureCapabilityType.ColorIntensity &&
              [PixelColor.Red, PixelColor.Green, PixelColor.Blue].indexOf(capability.capability.color) >= 0
          )
        );

        if (lightsInColors && this.presetService.getPresetFixture(preset, cachedFixture.fixture.uuid, cachedFixture.pixel?.key)) {
          parts.push(cachedFixture);
        }
      }
    }

    let positions: number[][];
    let partIndices: number[];

    if (parts.length > 0) {
      const placements = getStagePlacements(project);
      positions = parts.map((part) => {
        const place = this.fixtureService.getPixelPlace(part);

        return pixelStagePosition(
          place,
          pixelHousingSize(part.profile, place.columns, place.rows),
          placements.get(part.fixture.uuid) || { position: [0, 0, 0], rotation: [0, 0, 0] },
          part.fixture.positioning
        );
      });
      partIndices = parts.map((part) => indices.get(part.fixture.uuid) ?? 0);
    } else {
      positions = [];
      partIndices = [];

      for (let bar = 0; bar < 3; bar++) {
        for (let pixel = 0; pixel < 12; pixel++) {
          positions.push([bar * 130 + (pixel + 0.5) * 8.8, 0, 0]);
          partIndices.push(bar);
        }
      }

      count = 3;
    }

    const places = stagePixelPlaces(positions, view);
    this.stagePreview = { view, count, parts: places.map((place, i) => ({ place, index: partIndices[i] })), example: parts.length === 0 };

    return this.stagePreview;
  }

  // the color of a pixel of the preview, as red, green and blue between 0 and 1: what the effect lights it in, blended
  // with the color of the preset, or that color alone before and after the effect runs on the fixture. Spread across
  // the stage, all fixtures start the random looking patterns at the same place.
  private pixelColorOf(
    effect: EffectPixel,
    part: PixelContext,
    cycles: number,
    fixtureIndex: number,
    base: number[],
    stage = false
  ): number[] {
    if (cycles === undefined) {
      return base;
    }

    const context = Object.assign(new PixelContext(), part);
    context.seed = toInt(effect.seed * 7919 + (stage ? 0 : fixtureIndex * 131));

    if (effect.mirror) {
      context.x = context.x < 0.5 ? context.x * 2 : (1 - context.x) * 2;
    }

    // following a beat, like the preview does while no composition plays (see PreviewService.getPixelAudio)
    const audio =
      effect.audioSource === 'composition' ? new PixelAudio(demoAudioFrames, this.animationService.timeMillis, effect) : undefined;
    const showsAudio = effect.pattern === 'meter' || effect.pattern === 'scope';
    const audioLevel = audio && !showsAudio ? audio.level() : 1;
    const followsSize = audio && !showsAudio && effect.audioFollows === 'size';
    const sample = samplePixelPattern(followsSize ? { ...effect, size: effect.size * audioLevel } : effect, cycles, context, audio);

    if (!followsSize) {
      sample[1] *= audioLevel;
    }

    const stops = effect.palette.ref === 'preset' ? PixelPalette.shadesOf(base) : effect.palette.stops;
    const color =
      sample.length > 2 ? sample.slice(2, 5) : PixelPalette.colorOf(stops, effect.palette.between, effect.palette.repeat, sample[0]);
    const level = sample[1];
    const lit = color.map((component) => component * level);

    return lit.map((component, i) => {
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

  // the canvas a fixture of the preview keeps the colors of its pixels on for their glow, none where there is no document
  // to make one in
  private pixelGlowOf(fixture: PixelPreviewFixture): CanvasRenderingContext2D {
    if (!fixture.glow && typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = fixture.columns;
      canvas.height = fixture.rows;
      fixture.glow = canvas.getContext('2d');
    }

    return fixture.glow;
  }

  // The lit pixels of a fixture glowing: their colors stretched over them, blurred and added to what is drawn. The blur
  // is worked out in pixels of the device, which a browser blurs by, whatever the canvas is scaled with.
  private drawPixelGlow(glow: HTMLCanvasElement, left: number, top: number, width: number, height: number, cell: number) {
    const ratio = this.pixelRatio;
    const reach = Math.max(2, cell * PIXEL_GLOW_REACH) * ratio;

    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalCompositeOperation = 'lighter';
    this.ctx.imageSmoothingEnabled = true;

    if (this.canvasBlurs) {
      this.ctx.filter = `blur(${reach.toFixed(1)}px)`;
      this.ctx.globalAlpha = PIXEL_GLOW_ALPHA;
      this.ctx.drawImage(glow, left * ratio, top * ratio, width * ratio, height * ratio);
    } else {
      // stretched beyond the pixels, the smoothing blurs a little
      this.ctx.globalAlpha = PIXEL_GLOW_ALPHA * 0.4;
      this.ctx.drawImage(glow, left * ratio - reach, top * ratio - reach, width * ratio + reach * 2, height * ratio + reach * 2);
    }

    this.ctx.restore();
  }

  // the path of a rectangle with rounded corners (drawn with arcs, which every browser has)
  private roundedRect(x: number, y: number, width: number, height: number, radius: number) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));

    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.arcTo(x + width, y, x + width, y + height, r);
    this.ctx.arcTo(x + width, y + height, x, y + height, r);
    this.ctx.arcTo(x, y + height, x, y, r);
    this.ctx.arcTo(x, y, x + width, y, r);
    this.ctx.closePath();
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

      if (this.pickingPattern) {
        this.drawPatternTiles();
      }

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

// a picture to show the image pattern with: a gradient from red over green to blue, light at the top
function gradientBitmap(): PixelBitmap {
  const width = 8;
  const height = 4;
  const bytes = new Uint8Array(width * height * 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const along = x / (width - 1);
      const light = 1 - y / height / 2;
      bytes.set([255 * (1 - along) * light, 255 * (1 - Math.abs(along - 0.5) * 2) * light, 255 * along * light], (y * width + x) * 3);
    }
  }

  return new PixelBitmap({ width, height, channels: 3, frames: [encodeBase64(bytes)] });
}
