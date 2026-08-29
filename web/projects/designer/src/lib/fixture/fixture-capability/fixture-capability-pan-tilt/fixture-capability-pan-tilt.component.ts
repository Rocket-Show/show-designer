import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FixtureCapabilityType } from '../../../models/fixture-capability';
import { PresetService } from '../../../services/preset.service';
import { LivePreviewService } from '../../../services/live-preview.service';

@Component({
  selector: 'lib-app-fixture-capability-pan-tilt',
  templateUrl: './fixture-capability-pan-tilt.component.html',
  styleUrls: ['./fixture-capability-pan-tilt.component.css'],
  standalone: false,
})
export class FixtureCapabilityPanTiltComponent implements OnInit {
  constructor(
    private presetService: PresetService,
    private changeDetectorRef: ChangeDetectorRef,
    private livePreviewService: LivePreviewService
  ) {}

  ngOnInit() {}

  // the mirror belongs to the whole preset, not to the step being edited: it flips
  // everything the preset puts on that axis, its steps and its effects alike
  getMirrorPan(): boolean {
    return this.presetService.selectedPreset ? this.presetService.selectedPreset.mirrorPan : false;
  }

  setMirrorPan(mirror: boolean) {
    if (!this.presetService.selectedPreset) {
      return;
    }

    this.presetService.selectedPreset.mirrorPan = mirror;
    this.mirrorChanged();
  }

  getMirrorTilt(): boolean {
    return this.presetService.selectedPreset ? this.presetService.selectedPreset.mirrorTilt : false;
  }

  setMirrorTilt(mirror: boolean) {
    if (!this.presetService.selectedPreset) {
      return;
    }

    this.presetService.selectedPreset.mirrorTilt = mirror;
    this.mirrorChanged();
  }

  // the channels show what the capabilities put on them, so they follow the mirror
  private mirrorChanged() {
    this.presetService.capabilityValuesChanged.next();
    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  getValuePan(): number {
    const capabilityValue = this.presetService.getCapabilityValue(this.presetService.selectedStep, FixtureCapabilityType.Pan);
    if (capabilityValue) {
      return capabilityValue.valuePercentage;
    }
    return undefined;
  }

  getValueTextPan(): number {
    const value = this.getValuePan();
    if (value >= 0) {
      return Math.round(value * 100 * 100) / 100;
    }
    return undefined;
  }

  setValuePan(value: any) {
    if (isNaN(value)) {
      return;
    }

    if (value < 0 || value > 1) {
      return;
    }

    this.presetService.setCapabilityValue(this.presetService.selectedStep, FixtureCapabilityType.Pan, value);
    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  getValueTilt(): number {
    const capabilityValue = this.presetService.getCapabilityValue(this.presetService.selectedStep, FixtureCapabilityType.Tilt);
    if (capabilityValue) {
      return capabilityValue.valuePercentage;
    }
    return undefined;
  }

  getValueTextTilt(): number {
    const value = this.getValueTilt();
    if (value >= 0) {
      return Math.round(value * 100 * 100) / 100;
    }
    return undefined;
  }

  setValueTilt(value: any) {
    if (isNaN(value)) {
      return;
    }

    if (value < 0 || value > 1) {
      return;
    }

    this.presetService.setCapabilityValue(this.presetService.selectedStep, FixtureCapabilityType.Tilt, value);
    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  changeActive(active: boolean) {
    if (active) {
      this.setValuePan(0.5);
      this.setValueTilt(0.5);
    } else {
      this.presetService.deleteCapabilityValue(this.presetService.selectedStep, FixtureCapabilityType.Pan);
      this.presetService.deleteCapabilityValue(this.presetService.selectedStep, FixtureCapabilityType.Tilt);
      this.changeDetectorRef.detectChanges();
    }
    this.livePreviewService.previewLive();
  }
}
