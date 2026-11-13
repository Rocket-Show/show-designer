import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import {
  AiLooks,
  AiLooksResponse,
  AiLooksStatus,
  AiScene,
  aiMoods,
  aiMovements,
  aiOutputs,
  aiPalettes,
  AiRig,
  AiSettings,
  defaultAiSettings,
} from '../../models/ai-looks';
import { AiCompiled } from '../../models/ai-looks-compiler';
import { getForwardingErrorKey } from '../../models/api-error';
import { builtInPixelPalettes, pixelPaletteCss } from '../../models/pixel-palettes';
import { Scene } from '../../models/scene';
import { AiLooksService } from '../../services/ai-looks.service';
import { AnimationService } from '../../services/animation.service';
import { PreviewService } from '../../services/preview.service';
import { UserEnsureLoginService } from '../../services/user-ensure-login.service';

// what the panel shows: the settings, the wait for the AI, or the looks it designed
type AiLooksView = 'settings' | 'designing' | 'looks';

// what the user asks the AI for, once it designed the looks: to change the scene on the stage, all of them, or to add
// one more scene
export type AiLooksScope = 'scene' | 'all' | 'add';

// The AI looks (see AiLooksService), in a panel beside the designer: the user describes the looks and picks colors, a
// mood, the energy, the tempo and how much the heads move, and the AI designs presets and scenes for the fixtures of
// the project. The stage plays each scene picked before anything is added: the user adds the scenes they want to the
// project, has the AI change the scene on the stage, all of them or add one more scene, or discards them.
@Component({
  selector: 'lib-ai-looks',
  templateUrl: './ai-looks.component.html',
  styleUrls: ['./ai-looks.component.css'],
  standalone: false,
})
export class AiLooksComponent implements OnInit, OnDestroy {
  readonly outputs = aiOutputs;
  readonly moods = aiMoods;
  readonly movements = aiMovements;
  readonly palettes = aiPalettes;
  readonly energies = [1, 2, 3, 4, 5];
  readonly scopes: AiLooksScope[] = ['scene', 'all', 'add'];
  readonly maxColors = 4;

  view: AiLooksView = 'settings';
  rig: AiRig;
  status: AiLooksStatus;
  loadingStatus = true;

  settings: AiSettings;
  prompt = '';
  looks: AiLooks;
  instruction = '';
  scope: AiLooksScope = 'scene';

  // the scene the AI changes (its index), or 'add' while it adds one: the looks stay on the stage meanwhile
  working: number | 'add';
  private destroyed = false;

  // the error of the last request, as a key of the translations
  errorKey: string;

  // the looks made into presets and scenes, the scene the stage plays, the scenes not to add and whether the stage
  // plays one scene after the other
  compiled: AiCompiled;
  playing = 0;
  private left = new Set<Scene>();
  autoplay = false;
  private autoplayTimer: any;

  // the bars each scene plays for, while the stage plays one after the other
  static readonly autoplayBars = 8;

  constructor(
    private aiLooksService: AiLooksService,
    private previewService: PreviewService,
    private animationService: AnimationService,
    private userEnsureLoginService: UserEnsureLoginService,
    private toastrService: ToastrService,
    private translateService: TranslateService
  ) {}

  ngOnInit() {
    this.rig = this.aiLooksService.getRig();

    // what the user picked the last time the dialog was open
    const last = this.aiLooksService.last;
    this.settings = last ? { ...last.settings, colors: [...last.settings.colors] } : defaultAiSettings(this.aiLooksService.getTempo());
    this.prompt = last ? last.prompt : '';
    this.looks = last ? last.looks : undefined;

    // back to the looks designed the last time, if there are any
    if (this.looks) {
      this.showLooks();
    }

    this.aiLooksService.getStatus().subscribe({
      next: (status) => {
        this.status = status;
        this.loadingStatus = false;
      },
      error: (error) => {
        this.status = { available: false };
        this.loadingStatus = false;
        this.showError(error);
      },
    });
  }

  get available(): boolean {
    return !!this.status && this.status.available;
  }

  get hasFixtures(): boolean {
    return this.rig.groups.length > 0;
  }

  // how many requests the user has left today, or undefined for as many as they like
  get requestsLeft(): number {
    if (!this.status || typeof this.status.requestsPerUserPerDay !== 'number') {
      return undefined;
    }

    return Math.max(this.status.requestsPerUserPerDay - (this.status.requestsLast24Hours || 0), 0);
  }

  get canDesign(): boolean {
    return this.available && this.hasFixtures && this.requestsLeft !== 0 && this.view !== 'designing' && this.working === undefined;
  }

  // a change needs an instruction, one more scene can be left to the AI
  get canAsk(): boolean {
    return this.canDesign && (this.scope === 'add' || !!this.instruction.trim());
  }

  setOutput(output: AiSettings['output']) {
    this.settings.output = output;
  }

  // a mood picked again is picked no more
  setMood(mood: AiSettings['mood']) {
    this.settings.mood = this.settings.mood === mood ? null : mood;
  }

  setMovement(movement: AiSettings['movement']) {
    this.settings.movement = movement;
  }

  setPalette(palette: string) {
    this.settings.palette = this.settings.palette === palette ? null : palette;
  }

  addColor() {
    if (this.settings.colors.length < this.maxColors) {
      const defaults = ['#ff2fa0', '#00e5ff', '#ffb000', '#7a00ff'];
      this.settings.colors.push(defaults[this.settings.colors.length]);
    }
  }

  setColor(index: number, color: string) {
    if (/^#[0-9a-fA-F]{6}$/.test(color)) {
      this.settings.colors[index] = color.toLowerCase();
    }
  }

  removeColor(index: number) {
    this.settings.colors.splice(index, 1);
  }

  setNumber(key: 'energy' | 'bpm' | 'contrast', value: any, min: number, max: number) {
    const number = Number(value);

    if (!isNaN(number)) {
      this.settings[key] = Math.min(Math.max(key === 'energy' ? Math.round(number) : number, min), max);
    }
  }

  paletteCss(id: string): string {
    const palette = builtInPixelPalettes.find((candidate) => candidate.id === id);

    return palette ? pixelPaletteCss(palette, '#ffffff') : '';
  }

  // the abilities of a group, as the icons the list shows them with
  abilityIcon(ability: string): string {
    const icons = {
      dimmer: 'fa-sun-o',
      color: 'fa-tint',
      'pan-tilt': 'fa-arrows',
      strobe: 'fa-bolt',
      pixels: 'fa-th',
      zoom: 'fa-search-plus',
      gobo: 'fa-circle-o-notch',
      prism: 'fa-diamond',
    };

    return icons[ability] || 'fa-circle';
  }

  presetNames(presetIds: string[]): string {
    return presetIds
      .map((id) => this.looks.presets.find((preset) => preset.id === id))
      .filter((preset) => !!preset)
      .map((preset) => preset.name)
      .join(', ');
  }

  // the color a preset of the looks lights its fixtures with first, to mark a scene with
  sceneColors(presetIds: string[]): string[] {
    const colors: string[] = [];

    for (const id of presetIds) {
      const preset = this.looks.presets.find((candidate) => candidate.id === id);

      if (!preset) {
        continue;
      }

      const presetColors = preset.colorGradient
        ? preset.colorGradient.colors
        : preset.colorSequence
        ? preset.colorSequence.colors
        : preset.color
        ? [preset.color]
        : preset.pixel && preset.pixel.colors.length > 0
        ? preset.pixel.colors
        : [];

      for (const color of presetColors) {
        if (colors.indexOf(color) < 0 && colors.length < 6) {
          colors.push(color);
        }
      }
    }

    return colors;
  }

  design() {
    this.request(undefined, undefined);
  }

  setScope(scope: AiLooksScope) {
    this.scope = scope;
  }

  // the name of the scene on the stage, which the AI changes when it is asked for this scene
  get playingName(): string {
    return this.compiled && this.compiled.sources[this.playing] ? this.compiled.sources[this.playing].name : '';
  }

  // have the AI change the scene on the stage, all of the looks, or add one more scene, as the user says
  ask() {
    if (!this.canAsk) {
      return;
    }

    const instruction = this.instruction.trim();

    if (this.scope === 'all') {
      this.request(this.looks, instruction);
    } else {
      this.requestScene(this.scope === 'scene' ? this.playing : 'add', instruction);
    }
  }

  private request(current: AiLooks, instruction: string) {
    if (!this.canDesign) {
      return;
    }

    const from = this.view;
    this.view = 'designing';
    this.errorKey = undefined;
    this.remember();

    this.aiLooksService.design(this.aiLooksService.getRequest(this.rig, this.settings, this.prompt, current, instruction)).subscribe({
      next: (response) => {
        this.answered(response);

        // closed meanwhile: the looks are there the next time it opens
        if (!this.destroyed) {
          this.showLooks();
        }
      },
      error: (error) => {
        this.view = from;
        this.showError(error);
      },
    });
  }

  // The AI changes one scene of the looks (its index) or adds one: the stage plays the looks on meanwhile. The other
  // scenes stay as they are, and so do the ones the user left out. The stage plays the scene changed or added then.
  private requestScene(scene: number | 'add', instruction: string) {
    this.working = scene;
    this.errorKey = undefined;
    this.remember();

    const change = scene === 'add' ? { add: true } : { scene };
    const request = this.aiLooksService.getRequest(this.rig, this.settings, this.prompt, this.looks, instruction, change);

    this.aiLooksService.design(request).subscribe({
      next: (response) => {
        this.working = undefined;
        const left = this.scenes.map((added) => this.left.has(added));
        this.answered(response);

        if (this.destroyed) {
          return;
        }

        this.compiled = this.aiLooksService.compile(this.looks, this.rig, this.settings.bpm);
        this.left = new Set(this.scenes.filter((added, index) => left[index]));
        this.play(scene === 'add' ? this.scenes.length - 1 : scene);
      },
      error: (error) => {
        this.working = undefined;
        this.showError(error);
      },
    });
  }

  // the looks the AI answered with, and how many requests the user has left
  private answered(response: AiLooksResponse) {
    this.looks = response.looks;
    this.instruction = '';
    this.status = {
      available: true,
      requestsLast24Hours: response.requestsLast24Hours,
      requestsPerUserPerDay: response.requestsPerUserPerDay,
    };
    this.remember();
  }

  private remember() {
    this.aiLooksService.last = {
      settings: { ...this.settings, colors: [...this.settings.colors] },
      prompt: this.prompt,
      looks: this.looks,
    };
  }

  private showError(error: any) {
    if (this.userEnsureLoginService.isRefused(error)) {
      // the session ran out and the user has to log in again, or the device isn't linked with an account
      this.errorKey = this.userEnsureLoginService.refused('designer.ai.error.unauthorized');
      return;
    }

    // a device couldn't forward the request to the online designer
    if (getForwardingErrorKey(error)) {
      this.errorKey = getForwardingErrorKey(error);
      return;
    }

    const code =
      error instanceof HttpErrorResponse && error.error && typeof error.error.error === 'string' ? error.error.error : 'ai-failed';

    const known = [
      'invalid-request',
      'ai-unavailable',
      'ai-user-limit-reached',
      'ai-limit-reached',
      'ai-busy',
      'ai-refused',
      'ai-incomplete',
    ];
    this.errorKey = 'designer.ai.error.' + (known.indexOf(code) >= 0 ? code : 'ai-failed');
  }

  // ---- the looks on the stage ----

  // the looks made into presets and scenes, all of them to add, the first one on the stage
  private showLooks() {
    this.compiled = this.aiLooksService.compile(this.looks, this.rig, this.settings.bpm);
    this.left.clear();
    this.view = 'looks';
    this.play(0);
  }

  get scenes(): Scene[] {
    return this.compiled ? this.compiled.scenes : [];
  }

  // the scene of the looks a scene to add is made of: its section, its energy and its presets
  sourceOf(index: number): AiScene {
    return this.compiled.sources[index];
  }

  // the stage plays the scene at the passed place, as if it was triggered now
  play(index: number) {
    const scene = this.scenes[index];

    if (!scene) {
      this.previewService.endAiPreview();
      return;
    }

    this.playing = index;
    this.previewService.previewAiScene(scene, this.aiLooksService.getScenePresets(this.compiled, scene), this.animationService.timeMillis);
    this.restartAutoplay();
  }

  previous() {
    this.play((this.playing + this.scenes.length - 1) % this.scenes.length);
  }

  next() {
    this.play((this.playing + 1) % this.scenes.length);
  }

  // the stage plays one scene after the other, each for some bars at the tempo of the looks
  setAutoplay(autoplay: boolean) {
    this.autoplay = autoplay;
    this.restartAutoplay();
  }

  private restartAutoplay() {
    clearInterval(this.autoplayTimer);
    this.autoplayTimer = undefined;

    if (this.autoplay && this.scenes.length > 1) {
      const millis = (AiLooksComponent.autoplayBars * 4 * 60000) / this.settings.bpm;
      this.autoplayTimer = setInterval(() => this.play((this.playing + 1) % this.scenes.length), millis);
    }
  }

  isPicked(scene: Scene): boolean {
    return !this.left.has(scene);
  }

  // a scene to add to the project, or to leave out
  setPicked(scene: Scene, picked: boolean) {
    if (picked) {
      this.left.delete(scene);
    } else {
      this.left.add(scene);
    }
  }

  get pickedScenes(): Scene[] {
    return this.scenes.filter((scene) => this.isPicked(scene));
  }

  private endPreview() {
    clearInterval(this.autoplayTimer);
    this.autoplayTimer = undefined;
    this.previewService.endAiPreview();
  }

  back() {
    this.endPreview();
    this.view = 'settings';
    this.errorKey = undefined;
  }

  // the scenes picked, with the presets they play, added to the project: the one on the stage plays on
  add() {
    const added = this.aiLooksService.addCompiled(this.compiled, this.looks.name, this.pickedScenes, this.scenes[this.playing]);

    this.translateService
      .get('designer.ai.added', { scenes: added.scenes.length, presets: added.presets.length })
      .subscribe((message) => this.toastrService.success(message));

    this.aiLooksService.last = undefined;
    this.close();
  }

  // the looks are let go of, the project stays as it is
  discard() {
    this.aiLooksService.last = undefined;
    this.close();
  }

  close() {
    this.endPreview();
    this.aiLooksService.closePanel();
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.endPreview();
  }
}
