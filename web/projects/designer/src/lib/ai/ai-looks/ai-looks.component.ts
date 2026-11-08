import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import {
  AiLooks,
  AiLooksStatus,
  aiMoods,
  aiMovements,
  aiOutputs,
  aiPalettes,
  AiRig,
  AiSettings,
  defaultAiSettings,
} from '../../models/ai-looks';
import { builtInPixelPalettes, pixelPaletteCss } from '../../models/pixel-palettes';
import { AiLooksService } from '../../services/ai-looks.service';
import { UserService } from '../../services/user.service';

// what the dialog shows: the settings, the wait for the AI, or the looks it designed
type AiLooksView = 'settings' | 'designing' | 'looks';

// The AI looks (see AiLooksService): the user describes the looks and picks colors, a mood, the energy, the tempo and
// how much the heads move, the AI designs presets and scenes for the fixtures of the project, and the user adds them
// to the project or has them changed.
@Component({
  selector: 'lib-ai-looks',
  templateUrl: './ai-looks.component.html',
  styleUrls: ['./ai-looks.component.css'],
  standalone: false,
})
export class AiLooksComponent implements OnInit {
  readonly outputs = aiOutputs;
  readonly moods = aiMoods;
  readonly movements = aiMovements;
  readonly palettes = aiPalettes;
  readonly energies = [1, 2, 3, 4, 5];
  readonly maxColors = 4;

  view: AiLooksView = 'settings';
  rig: AiRig;
  status: AiLooksStatus;
  loadingStatus = true;

  settings: AiSettings;
  prompt = '';
  looks: AiLooks;
  instruction = '';

  // the error of the last request, as a key of the translations
  errorKey: string;

  constructor(
    private bsModalRef: BsModalRef,
    private aiLooksService: AiLooksService,
    private userService: UserService,
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
    return this.available && this.hasFixtures && this.requestsLeft !== 0 && this.view !== 'designing';
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

  // have the AI change the looks as the user says
  change() {
    if (this.instruction.trim()) {
      this.request(this.looks, this.instruction.trim());
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
        this.looks = response.looks;
        this.instruction = '';
        this.status = {
          available: true,
          requestsLast24Hours: response.requestsLast24Hours,
          requestsPerUserPerDay: response.requestsPerUserPerDay,
        };
        this.view = 'looks';
        this.remember();
      },
      error: (error) => {
        this.view = from;
        this.showError(error);
      },
    });
  }

  private remember() {
    this.aiLooksService.last = {
      settings: { ...this.settings, colors: [...this.settings.colors] },
      prompt: this.prompt,
      looks: this.looks,
    };
  }

  private showError(error: any) {
    const code =
      error instanceof HttpErrorResponse && error.error && typeof error.error.error === 'string' ? error.error.error : 'ai-failed';

    if (code === 'unauthorized') {
      // the session ran out: the user has to log in again
      this.userService.logout();
    }

    const known = [
      'unauthorized',
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

  back() {
    this.view = 'settings';
    this.errorKey = undefined;
  }

  add() {
    const compiled = this.aiLooksService.addToProject(this.looks, this.rig, this.settings.bpm);

    this.translateService
      .get('designer.ai.added', { scenes: compiled.scenes.length, presets: compiled.presets.length })
      .subscribe((message) => this.toastrService.success(message));

    this.aiLooksService.last = undefined;
    this.bsModalRef.hide();
  }

  cancel() {
    this.bsModalRef.hide();
  }
}
