import { ChangeDetectorRef, Component, Input } from '@angular/core';
import { CachedFixtureCapability } from '../../../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../../../models/cached-fixture-channel';
import { FixtureCapabilityType } from '../../../models/fixture-capability';
import { FixtureProfile } from '../../../models/fixture-profile';
import { FixtureWheelSlotType } from '../../../models/fixture-wheel-slot';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';

// The gobo wheel of a profile in the preset: the step being edited picks one of its slots, by its name (or its number)
// like the fixture library gives it. A gobo is the model's own, so it only plays on fixtures of this profile.
@Component({
  selector: 'lib-app-fixture-capability-gobo-wheel',
  templateUrl: './fixture-capability-gobo-wheel.component.html',
  styleUrls: ['./fixture-capability-gobo-wheel.component.css'],
  standalone: false,
})
export class FixtureCapabilityGoboWheelComponent {
  _fixtureProfile: FixtureProfile;
  _channel: CachedFixtureChannel;
  wheelName: string;
  slotCapabilities: CachedFixtureCapability[] = [];

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

  constructor(
    private presetService: PresetService,
    private changeDetectorRef: ChangeDetectorRef,
    private livePreviewService: LivePreviewService
  ) {}

  private update() {
    this.slotCapabilities = [];
    this.wheelName = undefined;

    if (!this._fixtureProfile || !this._channel) {
      return;
    }

    // the slots a position of the channel picks, one per slot (a split between two slots or a slot shaking is left out)
    for (const capability of this._channel.capabilities) {
      if (capability.capability.type === FixtureCapabilityType.WheelSlot && capability.wheel) {
        this.wheelName = this.wheelName || capability.wheelName;

        if (capability.wheelName === this.wheelName && capability.wheelSlots.length === 1) {
          this.slotCapabilities.push(capability);
        }
      }
    }
  }

  // what a slot is shown as: the name of its gobo, else what kind of slot it is, with its number
  getSlotName(capability: CachedFixtureCapability): string {
    const slot = capability.wheelSlots[0];

    return (
      capability.capability.slotNumber +
      (slot?.name ? ' ' + slot.name : slot?.type && slot.type !== FixtureWheelSlotType.Gobo ? ' ' + slot.type : '')
    );
  }

  getCurrentSlotNumber(): number {
    return this.presetService.getCapabilityValue(
      this.presetService.selectedStep,
      FixtureCapabilityType.WheelSlot,
      undefined,
      this.wheelName,
      this._fixtureProfile?.uuid
    )?.slotNumber;
  }

  selectSlotNumber(slotNumber: number) {
    this.presetService.setCapabilityValue(
      this.presetService.selectedStep,
      FixtureCapabilityType.WheelSlot,
      undefined,
      slotNumber,
      undefined,
      this.wheelName,
      this._fixtureProfile.uuid
    );
    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  changeActive(active: boolean) {
    if (active) {
      // the first slot, which is open on most wheels
      this.selectSlotNumber(this.slotCapabilities[0]?.capability.slotNumber ?? 1);
      return;
    }

    this.presetService.deleteCapabilityValue(
      this.presetService.selectedStep,
      FixtureCapabilityType.WheelSlot,
      undefined,
      this.wheelName,
      this._fixtureProfile.uuid
    );
    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }
}
