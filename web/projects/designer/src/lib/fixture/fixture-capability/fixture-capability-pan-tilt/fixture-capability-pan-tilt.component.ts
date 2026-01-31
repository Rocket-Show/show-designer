import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FixtureCapabilityType } from '../../../models/fixture-capability';
import { PresetService } from '../../../services/preset.service';

@Component({
  selector: 'lib-app-fixture-capability-pan-tilt',
  templateUrl: './fixture-capability-pan-tilt.component.html',
  styleUrls: ['./fixture-capability-pan-tilt.component.css'],
  standalone: false,
})
export class FixtureCapabilityPanTiltComponent implements OnInit {
  constructor(private presetService: PresetService, private changeDetectorRef: ChangeDetectorRef) {}

  ngOnInit() {}

  getValuePan(): number {
    const capabilityValue = this.presetService.getCapabilityValue(this.presetService.selectedPreset, FixtureCapabilityType.Pan);
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

    this.presetService.setCapabilityValue(this.presetService.selectedPreset, FixtureCapabilityType.Pan, value);
    this.changeDetectorRef.detectChanges();
    this.presetService.previewLive();
  }

  getValueTilt(): number {
    const capabilityValue = this.presetService.getCapabilityValue(this.presetService.selectedPreset, FixtureCapabilityType.Tilt);
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

    this.presetService.setCapabilityValue(this.presetService.selectedPreset, FixtureCapabilityType.Tilt, value);
    this.changeDetectorRef.detectChanges();
    this.presetService.previewLive();
  }

  changeActive(active: boolean) {
    if (active) {
      this.setValuePan(0.5);
      this.setValueTilt(0.5);
    } else {
      this.presetService.deleteCapabilityValue(this.presetService.selectedPreset, FixtureCapabilityType.Pan);
      this.presetService.deleteCapabilityValue(this.presetService.selectedPreset, FixtureCapabilityType.Tilt);
      this.changeDetectorRef.detectChanges();
    }
    this.presetService.previewLive();
  }
}
