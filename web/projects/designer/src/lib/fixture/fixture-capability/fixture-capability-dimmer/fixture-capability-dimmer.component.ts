import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { getFanStops } from '../../../models/fan';
import { FixtureCapabilityType } from '../../../models/fixture-capability';
import { PresetService } from '../../../services/preset.service';
import { LivePreviewService } from '../../../services/live-preview.service';

@Component({
  selector: 'lib-app-fixture-capability-dimmer',
  templateUrl: './fixture-capability-dimmer.component.html',
  styleUrls: ['./fixture-capability-dimmer.component.css'],
  standalone: false,
})
export class FixtureCapabilityDimmerComponent implements OnInit {
  constructor(
    private presetService: PresetService,
    private changeDetectorRef: ChangeDetectorRef,
    private livePreviewService: LivePreviewService
  ) {}

  ngOnInit() {}

  getValue(): number {
    const capabilityValue = this.presetService.getCapabilityValue(this.presetService.selectedStep, FixtureCapabilityType.Intensity);
    if (capabilityValue) {
      return capabilityValue.valuePercentage;
    }
    return undefined;
  }

  getValueText(): number {
    const value = this.getValue();
    if (value >= 0) {
      return Math.round(value * 100 * 100) / 100;
    }
    return undefined;
  }

  setValue(value: any) {
    if (isNaN(value)) {
      return;
    }

    if (value < 0 || value > 1) {
      return;
    }

    this.presetService.setCapabilityValue(this.presetService.selectedStep, FixtureCapabilityType.Intensity, value);
    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  readonly types = [FixtureCapabilityType.Intensity];

  // is the dimmer fanned out over the fixtures of the preset (see fan)?
  isFanned(): boolean {
    return !!this.presetService.getCapabilityFan(this.presetService.selectedStep, FixtureCapabilityType.Intensity);
  }

  // fan the dimmer out from none on the first fixture to what it is on the last one (all of them at full, if it's
  // off), or bring all of them to the one in the middle again
  toggleFan() {
    const value = this.getValue();
    const stops = this.isFanned() ? undefined : getFanStops('linear', 0, value > 0 ? value : 1);

    this.presetService.setCapabilityFan(this.presetService.selectedStep, FixtureCapabilityType.Intensity, stops);
    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  changeActive(active: boolean) {
    if (active) {
      this.setValue(1);
    } else {
      this.presetService.deleteCapabilityValue(this.presetService.selectedStep, FixtureCapabilityType.Intensity);
      this.changeDetectorRef.detectChanges();
    }
    this.livePreviewService.previewLive();
  }
}
