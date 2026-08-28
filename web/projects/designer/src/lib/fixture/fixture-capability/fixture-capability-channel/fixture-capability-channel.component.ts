import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { CachedFixtureCapability } from '../../../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../../../models/cached-fixture-channel';
import { FixtureProfile } from '../../../models/fixture-profile';
import { PresetService } from '../../../services/preset.service';
import { EffectService } from '../../../services/effect.service';
import { LivePreviewService } from '../../../services/live-preview.service';

@Component({
  selector: 'lib-app-fixture-capability-channel',
  templateUrl: './fixture-capability-channel.component.html',
  styleUrls: ['./fixture-capability-channel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class FixtureCapabilityChannelComponent implements OnInit, OnDestroy {
  @ViewChild('sliderValue', { static: false }) sliderValue: ElementRef;

  selectedCapability: CachedFixtureCapability;
  _channel: CachedFixtureChannel;

  defaultValue = 0;
  value = 0;
  // the value the capabilities of the preset (dimmer, color, pan/tilt, wheel slot) drive this
  // channel to, if any. It is shown as long as the channel carries no value of its own.
  capabilityValue: number;
  // an effect of the preset drives this channel. Its value moves and, while the effect is
  // chasing, differs from fixture to fixture, so the channel only says that it is driven.
  drivenByEffect = false;
  templateValue = 0;
  description: string;

  hasRange = false;
  rangeMin = 0;
  rangeMax = 0;
  descriptionStart: string;
  descriptionEnd: string;

  valueSetTimer: any;
  private updateTimer: any;
  private capabilityValuesChangedSubscription: Subscription;
  private effectsChangedSubscription: Subscription;
  private stepsChangedSubscription: Subscription;

  @Input()
  profile: FixtureProfile;

  @Input()
  set channel(value: CachedFixtureChannel) {
    this._channel = value;
    this.updateChannel();
  }

  @Input()
  capabilityIndex: number;

  constructor(
    private presetService: PresetService,
    private effectService: EffectService,
    private livePreviewService: LivePreviewService,
    private changeDetectorRef: ChangeDetectorRef
  ) {
    this.capabilityValuesChangedSubscription = this.presetService.capabilityValuesChanged.subscribe(() => {
      this.scheduleUpdate();
    });

    this.effectsChangedSubscription = this.effectService.effectsChanged.subscribe(() => {
      this.scheduleUpdate();
    });

    // the channels carry their values per step as well, so they follow the selection
    this.stepsChangedSubscription = this.presetService.stepsChanged.subscribe(() => {
      this.scheduleUpdate();
    });
  }

  // the preset has been changed somewhere else -> show what it does to this channel. This
  // happens while a capability slider is being dragged, so don't redraw on every single step.
  private scheduleUpdate() {
    if (this.updateTimer) {
      return;
    }

    this.updateTimer = setTimeout(() => {
      this.updateTimer = undefined;

      if (!this._channel || !this.profile || !this.presetService.selectedPreset || !this.presetService.selectedStep) {
        return;
      }

      this.updateChannel();
      this.changeDetectorRef.detectChanges();
    }, 30);
  }

  private updateChannel() {
    this.selectedCapability = this._channel.capabilities[0];

    this.value = this.presetService.getChannelValue(this._channel.name, this.profile.uuid);

    const capabilityValue = this.presetService.getChannelValueFromCapabilities(
      this.presetService.selectedStep.fixtureCapabilityValues,
      this._channel,
      this.profile.uuid
    );
    // the capabilities calculate in percentages, the channels show dmx values
    this.capabilityValue = capabilityValue === undefined ? undefined : Math.round(capabilityValue);

    this.drivenByEffect = this.presetService.channelIsDrivenByEffect(this.presetService.selectedPreset, this._channel, this.profile.uuid);

    this.calculateTemplateValue();

    // whatever the channel shows also decides which of its capabilities is the current one
    const shownValue = this.value === undefined ? this.capabilityValue : this.value;

    if (shownValue >= 0) {
      for (const capability of this._channel.capabilities) {
        if (
          capability.capability.dmxRange.length > 0 &&
          capability.capability.dmxRange[0] <= shownValue &&
          shownValue <= capability.capability.dmxRange[1]
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

  ngOnDestroy() {
    this.capabilityValuesChangedSubscription.unsubscribe();
    this.effectsChangedSubscription.unsubscribe();
    this.stepsChangedSubscription.unsubscribe();
    clearTimeout(this.updateTimer);
    clearTimeout(this.valueSetTimer);
  }

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
    this.livePreviewService.previewLive();
  }

  private calculateTemplateValue() {
    if (this.value !== undefined) {
      this.templateValue = this.value;
    } else if (this.capabilityValue !== undefined) {
      // the channel is deactivated, but a capability of the preset drives it
      this.templateValue = this.capabilityValue;
    } else {
      this.templateValue = this.getDefaultValue();
    }
  }

  private getDefaultValue(): number {
    if (this._channel.defaultValue) {
      return this._channel.defaultValue;
    }

    return 0;
  }

  changeActive(active: boolean) {
    if (active) {
      // keep what the channel was showing: the value a capability drives it to, or the
      // default value of the channel, if no capability reaches it
      this.setValue(this.templateValue, true);
    } else {
      this.presetService.deleteChannelValue(this._channel.name, this.profile.uuid);
      this.updateChannel();
    }
    this.livePreviewService.previewLive();
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
