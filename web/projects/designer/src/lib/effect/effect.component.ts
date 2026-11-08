import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs/operators';
import { Effect } from '../models/effect';
import { EffectCurve } from '../models/effect-curve';
import { EffectPanTilt } from '../models/effect-pan-tilt';
import { EffectPixel } from '../models/effect-pixel';
import { builtInPixelPalettes, pixelPaletteOf } from '../models/pixel-palettes';
import { EffectService } from '../services/effect.service';
import { PresetService } from '../services/preset.service';
import { UuidService } from '../services/uuid.service';
import { WarningDialogService } from '../services/warning-dialog.service';
import { LivePreviewService } from '../services/live-preview.service';

@Component({
  selector: 'lib-app-effect',
  templateUrl: './effect.component.html',
  styleUrls: ['./effect.component.css'],
  standalone: false,
})
export class EffectComponent implements OnInit {
  constructor(
    private uuidService: UuidService,
    public presetService: PresetService,
    public effectService: EffectService,
    private warningDialogService: WarningDialogService,
    public livePreviewService: LivePreviewService,
    private translateService: TranslateService
  ) {}

  ngOnInit() {}

  // a new effect runs in the step being edited only, once the preset has more than one
  private addEffect(effect: Effect) {
    this.effectService.addEffect(this.presetService.selectedPreset, effect, this.presetService.selectedStep);
  }

  // the effects follow the step being edited, once the preset runs through more than one
  get followsSteps(): boolean {
    return this.presetService.selectedPreset.steps.length > 1 && !!this.presetService.selectedStep;
  }

  runsInStep(effect: Effect): boolean {
    return this.effectService.runsInStep(this.presetService.selectedStep, effect);
  }

  // let the effect run in the step being edited, or silence it there
  toggleRunsInStep(effect: Effect) {
    this.effectService.setRunsInStep(this.presetService.selectedStep, effect, !this.runsInStep(effect));
    this.livePreviewService.previewLive();
  }

  // the step it runs in, and how much of it the step lets through, unless it is all of it
  runsInStepDescription(effect: Effect): string {
    const step = this.presetService.selectedStep;
    const stepNumber = this.presetService.selectedPreset.steps.indexOf(step) + 1;
    const amount = step.getEffectAmount(effect.uuid);
    let description = this.translateService.instant('designer.effect.runs-in-step', { step: stepNumber });

    if (amount > 0 && amount < 1) {
      description += ' (' + Math.round(amount * 100) + ' %)';
    }

    return description;
  }

  toggleVisible(effect: Effect) {
    effect.visible = !effect.visible;
    this.effectService.effectsChanged.next();
    this.livePreviewService.previewLive();
  }

  // a curve, moving the heads by the same degrees on every model (see EffectCurve.panTiltInDegrees)
  addCurveEffect() {
    const effect = new EffectCurve();
    effect.uuid = this.uuidService.getUuid();
    effect.panTiltInDegrees = true;
    this.addEffect(effect);
    this.livePreviewService.previewLive();
  }

  // a movement of the moving heads: all of them together, until a chase is set
  addPanTiltEffect() {
    const effect = new EffectPanTilt();
    effect.uuid = this.uuidService.getUuid();
    effect.phasingMode = 'spread';
    effect.phasingCycles = 0;
    this.addEffect(effect);
    this.livePreviewService.previewLive();
  }

  // a pixel effect, starting in all the colors of the rainbow, so it shows even on a preset without a color yet
  addPixelEffect() {
    const effect = new EffectPixel();
    effect.uuid = this.uuidService.getUuid();
    effect.palette = pixelPaletteOf(builtInPixelPalettes.find((palette) => palette.id === 'rainbow'));
    this.addEffect(effect);
    this.livePreviewService.previewLive();
  }

  openEffect(effect: Effect, event: any) {
    if (event) {
      this.effectService.selectedEffect = effect;
    } else {
      if (this.effectService.selectedEffect === effect) {
        this.effectService.selectedEffect = undefined;
      }
    }
  }

  duplicateEffect(effect: Effect) {
    if (!this.presetService.selectedPreset) {
      return;
    }

    this.effectService.duplicateEffect(this.presetService.selectedPreset, effect);
    this.livePreviewService.previewLive();
  }

  deleteEffect(effect: Effect) {
    this.warningDialogService
      .show('designer.effect.delete-warning')
      .pipe(
        map((result) => {
          if (result) {
            this.effectService.deleteEffect(this.presetService.selectedPreset, effect);
            this.livePreviewService.previewLive();
          }
        })
      )
      .subscribe();
  }
}
