import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { CachedFixtureCapability } from '../../../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../../../models/cached-fixture-channel';
import { FixtureProfile } from '../../../models/fixture-profile';
import { PresetService } from '../../../services/preset.service';

@Component({
  selector: 'lib-app-fixture-capability-channel',
  templateUrl: './fixture-capability-channel.component.html',
  styleUrls: ['./fixture-capability-channel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class FixtureCapabilityChannelComponent implements OnInit {
  @ViewChild('sliderValue', { static: false }) sliderValue: ElementRef;

  selectedCapability: CachedFixtureCapability;
  _channel: CachedFixtureChannel;

  defaultValue = 0;
  value = 0;
  templateValue = 0;
  description: string;

  hasRange = false;
  rangeMin = 0;
  rangeMax = 0;
  descriptionStart: string;
  descriptionEnd: string;

  valueSetTimer: any;

  @Input()
  profile: FixtureProfile;

  @Input()
  set channel(value: CachedFixtureChannel) {
    this._channel = value;
    this.updateChannel();
  }

  @Input()
  capabilityIndex: number;

  constructor(private presetService: PresetService) {}

  private updateChannel() {
    this.selectedCapability = this._channel.capabilities[0];

    this.value = this.presetService.getChannelValue(this._channel.name, this.profile.uuid);
    this.calculateTemplateValue();

    if (this.value >= 0) {
      for (const capability of this._channel.capabilities) {
        if (
          capability.capability.dmxRange.length > 0 &&
          capability.capability.dmxRange[0] <= this.value &&
          this.value <= capability.capability.dmxRange[1]
        ) {
          this.selectedCapability = capability;
          break;
        }
      }
    }

    this.defaultValue = this.getDefaultValue();
    this.description = this.getDescription(this.selectedCapability);

    this.hasRange = this.capabilityHasRange();
    this.rangeMin = this.getRangeMin();
    this.rangeMax = this.getRangeMax();
    this.descriptionStart = this.getDescriptionStart(this.selectedCapability);
    this.descriptionEnd = this.getDescriptionEnd(this.selectedCapability);
  }

  capabilityHasRange(): boolean {
    if (this._channel?.capabilities?.length === 1) {
      // TODO does this work in all cases? if we have no option, it's always a range?
      return true;
    }

    if (
      this.selectedCapability?.capability.angleStart ||
      this.selectedCapability?.capability.speedStart ||
      this.selectedCapability?.capability.brightnessStart ||
      this.selectedCapability?.capability.durationStart ||
      this.selectedCapability?.capability.colorTemperatureStart ||
      this.selectedCapability?.capability.soundSensitivityStart ||
      this.selectedCapability?.capability.horizontalAngleStart ||
      this.selectedCapability?.capability.verticalAngleStart ||
      this.selectedCapability?.capability.distanceStart ||
      this.selectedCapability?.capability.openPercentStart ||
      this.selectedCapability?.capability.frostIntensityStart ||
      this.selectedCapability?.capability.fogOutputStart ||
      this.selectedCapability?.capability.timeStart ||
      this.selectedCapability?.capability.insertionStart ||
      this.selectedCapability?.capability.colorsStart
    ) {
      return true;
    }

    return false;
  }

  getDescriptionStart(capability: CachedFixtureCapability) {
    if (!capability || !capability.capability) {
      return '';
    }
    return (
      capability.capability.angleStart ||
      capability.capability.speedStart ||
      capability.capability.brightnessStart ||
      capability.capability.durationStart ||
      capability.capability.colorTemperatureStart ||
      capability.capability.soundSensitivityStart ||
      capability.capability.horizontalAngleStart ||
      capability.capability.verticalAngleStart ||
      capability.capability.distanceStart ||
      capability.capability.openPercentStart ||
      capability.capability.frostIntensityStart ||
      capability.capability.fogOutputStart ||
      capability.capability.timeStart ||
      capability.capability.insertionStart ||
      capability.capability.colorsStart
    )?.toString();
  }

  getDescriptionEnd(capability: CachedFixtureCapability) {
    if (!capability || !capability.capability) {
      return '';
    }
    return (
      capability.capability.angleEnd ||
      capability.capability.speedEnd ||
      capability.capability.brightnessEnd ||
      capability.capability.durationEnd ||
      capability.capability.colorTemperatureEnd ||
      capability.capability.soundSensitivityEnd ||
      capability.capability.horizontalAngleEnd ||
      capability.capability.verticalAngleEnd ||
      capability.capability.distanceEnd ||
      capability.capability.openPercentEnd ||
      capability.capability.frostIntensityEnd ||
      capability.capability.fogOutputEnd ||
      capability.capability.timeEnd ||
      capability.capability.insertionEnd ||
      capability.capability.colorsEnd
    )?.toString();
  }

  getDescription(capability: CachedFixtureCapability) {
    if (!capability || !capability.capability) {
      return '';
    }
    return (
      capability.capability.slotNumber ||
      capability.capability.shutterEffect ||
      capability.capability.angle ||
      capability.capability.speed ||
      capability.capability.brightness ||
      capability.capability.duration ||
      capability.capability.colorTemperature ||
      capability.capability.soundSensitivity ||
      capability.capability.horizontalAngle ||
      capability.capability.verticalAngle ||
      capability.capability.distance ||
      capability.capability.openPercent ||
      capability.capability.frostIntensity ||
      capability.capability.fogOutput ||
      capability.capability.time ||
      capability.capability.insertion
    )?.toString();
  }

  private getRangeMin(): number {
    if (this.selectedCapability.capability.dmxRange.length > 0) {
      return this.selectedCapability.capability.dmxRange[0];
    }

    return 0;
  }

  private getRangeMax(): number {
    if (this.selectedCapability.capability.dmxRange.length > 0) {
      return this.selectedCapability.capability.dmxRange[1];
    }

    return this._channel.maxValue;
  }

  ngOnInit() {}

  setValue(value: any, ignoreCapabilityRange: boolean = false) {
    if (isNaN(value)) {
      return;
    }

    if (!ignoreCapabilityRange && (value < this.rangeMin || value > this.rangeMax)) {
      return;
    }

    this.value = value;
    this.calculateTemplateValue();

    this.presetService.setChannelValue(this._channel.name, this.profile.uuid, value);
    if (this.sliderValue) {
      // update the value without change detector for performance reasons and only in a specific
      // interval. each value set will trigger a layout/reflow event and slow down the performance
      // TODO use the same technique in the dimmer/pan/tilt/color sliders
      if (!this.valueSetTimer) {
        this.valueSetTimer = setTimeout(() => {
          if (this.sliderValue) {
            this.sliderValue.nativeElement.value = this.value;
          }
          this.valueSetTimer = undefined;
        }, 30);
      }
    }
    this.presetService.previewLive();
  }

  private calculateTemplateValue() {
    this.templateValue = this.value ? this.value : this.getDefaultValue();
  }

  private getDefaultValue(): number {
    if (this._channel.defaultValue) {
      return this._channel.defaultValue;
    }

    return 0;
  }

  changeActive(active: boolean) {
    if (active) {
      this.setValue(this.getDefaultValue(), true);
    } else {
      this.presetService.deleteChannelValue(this._channel.name, this.profile.uuid);
      this.selectedCapability = this._channel.capabilities[0];
      this.value = undefined;
      this.calculateTemplateValue();
    }
    this.presetService.previewLive();
  }

  capabilitySelected() {
    // select the center value of the selected capability
    if (this.capabilityHasRange()) {
      this.setValue(this.selectedCapability.capability.dmxRange[0], true);
    } else {
      this.setValue(this.selectedCapability.centerValue, true);
    }
    this.updateChannel();
  }
}
