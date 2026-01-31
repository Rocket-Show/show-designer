import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { CachedFixtureCapability } from '../../../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../../../models/cached-fixture-channel';
import { FixtureCapabilityType } from '../../../models/fixture-capability';
import { FixtureProfile } from '../../../models/fixture-profile';
import { FixtureWheel } from '../../../models/fixture-wheel';
import { FixtureService } from '../../../services/fixture.service';
import { PresetService } from '../../../services/preset.service';

@Component({
  selector: 'lib-app-fixture-capability-color-wheel',
  templateUrl: './fixture-capability-color-wheel.component.html',
  styleUrls: ['./fixture-capability-color-wheel.component.css'],
  standalone: false,
})
export class FixtureCapabilityColorWheelComponent implements OnInit, OnDestroy {
  _fixtureProfile: FixtureProfile;
  _channel: CachedFixtureChannel;
  wheelName: string;
  wheel: FixtureWheel;
  slotCapabilities: CachedFixtureCapability[];

  private colorChangeSubscription: Subscription;

  @Input()
  set profile(value: FixtureProfile) {
    this._fixtureProfile = value;
    this.update();
  }

  @Input()
  set channel(value: CachedFixtureChannel) {
    this._channel = value;
    this.update();
  }

  @Input()
  wheelIndex: number;

  @Input()
  showContainer = false;

  constructor(public presetService: PresetService, private changeDetectorRef: ChangeDetectorRef, private fixtureService: FixtureService) {}

  ngOnInit() {
    this.colorChangeSubscription = this.presetService.fixtureColorChanged.subscribe(() => {
      this.changeDetectorRef.detectChanges();
    });
  }

  ngOnDestroy() {
    this.colorChangeSubscription.unsubscribe();
  }

  private update() {
    if (this._fixtureProfile && this._channel) {
      this.wheelName = undefined;
      this.slotCapabilities = [];

      // get the wheel name
      for (const capability of this._channel.capabilities) {
        if (capability.wheel) {
          this.wheelName = capability.wheelName;
          break;
        }
      }
      if (!this.wheelName) {
        this.wheelName = this._channel.name;
      }

      this.wheel = this.fixtureService.getWheelByName(this._fixtureProfile, this.wheelName);

      // calculate all available slots
      for (const capability of this._channel.capabilities) {
        if (capability.capability.type === FixtureCapabilityType.WheelSlot) {
          this.slotCapabilities.push(capability);
        }
      }
    }

    this.changeDetectorRef.detectChanges();
  }

  getCapabilityColorStyle(capability: CachedFixtureCapability): any {
    let property = 'background-color';
    let value = 'black';
    let colors: string[] = [];

    if (capability.wheelSlots) {
      for (const slot of capability.wheelSlots) {
        // calculate the color based on the color wheel slot
        if (slot.colors.length > 0) {
          colors = colors.concat(slot.colors);
        }
      }
    }

    if (colors.length > 1) {
      // mixed colors -> gradient
      let colorString: string;
      for (const color of colors) {
        if (colorString) {
          colorString += ', ';
        } else {
          colorString = '';
        }
        colorString += color;
      }
      property = 'background-image';
      value = 'linear-gradient(to bottom right, ' + colorString + ')';
    } else if (colors.length === 1) {
      value = colors[0];
    } else {
      value = '#fff';
    }

    const style = {};
    style[property] = value;
    return style;
  }

  getCurrentSlotNumber(): number {
    const capabilityValue = this.presetService.getCapabilityValue(
      this.presetService.selectedPreset,
      FixtureCapabilityType.WheelSlot,
      undefined,
      this.wheelName,
      this._fixtureProfile.uuid
    );

    if (capabilityValue) {
      return capabilityValue.slotNumber;
    }
    return undefined;
  }

  slotCapabilityIsSelected(slotNumber: number): boolean {
    const selectedSlotNumber = this.getCurrentSlotNumber();

    if (selectedSlotNumber >= 0) {
      // a slot is selected
      return selectedSlotNumber === slotNumber;
    } else {
      // no slot is selected and the capability is inactive
      // -> show the approx. color, if a color or a similar slot from a different wheel has been selected
      const approximatedCapability = this.presetService.getApproximatedColorWheelCapability(
        this.presetService.selectedPreset,
        this._channel
      );

      if (approximatedCapability) {
        return slotNumber === approximatedCapability.capability.slotNumber;
      } else {
        return false;
      }
    }
  }

  changeActive(active: boolean) {
    if (active) {
      this.presetService.setCapabilityValue(
        this.presetService.selectedPreset,
        FixtureCapabilityType.WheelSlot,
        undefined,
        1,
        undefined,
        this.wheelName,
        this._fixtureProfile.uuid
      );
    } else {
      this.presetService.deleteCapabilityValue(
        this.presetService.selectedPreset,
        FixtureCapabilityType.WheelSlot,
        undefined,
        this.wheelName,
        this._fixtureProfile.uuid
      );
    }

    this.presetService.previewLive();
  }

  selectSlotNumber(slotNumber: number) {
    this.presetService.setCapabilityValue(
      this.presetService.selectedPreset,
      FixtureCapabilityType.WheelSlot,
      undefined,
      slotNumber,
      undefined,
      this.wheelName,
      this._fixtureProfile.uuid
    );
    this.presetService.previewLive();
  }
}
