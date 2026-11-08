import { ChangeDetectorRef, Component, Input } from '@angular/core';
import { FixtureCapabilityType } from '../../../models/fixture-capability';
import { FixtureCapabilityValue } from '../../../models/fixture-capability-value';
import { getMaintenanceCapability, MaintenanceAction, maintenanceActions } from '../../../models/maintenance';
import { getPrograms } from '../../../models/program';
import { FixtureService } from '../../../services/fixture.service';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';

// What the step being edited asks the fixtures to do besides a position, on every model: run one of their programs by
// its number at a speed, to the sound or not (kind "program", see program), or reset themselves and switch their lamp
// on or off for as long as the preset plays (kind "maintenance", see maintenance). Switched off, the step leaves it alone.
@Component({
  selector: 'lib-app-fixture-capability-command',
  templateUrl: './fixture-capability-command.component.html',
  styleUrls: ['./fixture-capability-command.component.css'],
  standalone: false,
})
export class FixtureCapabilityCommandComponent {
  @Input()
  kind: 'program' | 'maintenance' = 'program';

  constructor(
    private presetService: PresetService,
    private fixtureService: FixtureService,
    private changeDetectorRef: ChangeDetectorRef,
    private livePreviewService: LivePreviewService
  ) {}

  private get type(): FixtureCapabilityType {
    return this.kind === 'program' ? FixtureCapabilityType.Effect : FixtureCapabilityType.Maintenance;
  }

  get id(): string {
    return 'capabilityCommand' + this.kind;
  }

  getValue(): FixtureCapabilityValue {
    return this.presetService.getCapabilityValue(this.presetService.selectedStep, this.type);
  }

  // the channels of the fixtures of the preset
  private get fixtureChannels() {
    return (this.presetService.selectedPreset?.fixtures || [])
      .map((presetFixture) => this.fixtureService.getCachedFixtureByUuid(presetFixture.fixtureUuid, presetFixture.pixelKey))
      .filter((fixture) => !!fixture)
      .map((fixture) => fixture.channels.filter((channel) => channel.channel));
  }

  // ---- programs ----

  // the most programs a fixture of the preset has, to the sound or not
  get programCount(): number {
    const sound = !!this.getValue()?.soundControlled;
    let count = 0;

    for (const channels of this.fixtureChannels) {
      for (const channel of channels) {
        count = Math.max(count, getPrograms(channel, sound).length);
      }
    }

    return count;
  }

  get programNumbers(): number[] {
    return Array.from({ length: this.programCount }, (_, index) => index + 1);
  }

  private putProgram(change: (value: FixtureCapabilityValue) => void) {
    const step = this.presetService.selectedStep;

    if (!step) {
      return;
    }

    const existing = this.getValue();
    const value = new FixtureCapabilityValue(existing ? { ...existing } : { type: this.type, programNumber: 1, valuePercentage: 0.5 });
    change(value);
    this.presetService.putCapabilityValue(step, value);

    // the speed on a channel of its own as well
    if (this.kind === 'program' && value.valuePercentage >= 0) {
      this.presetService.setCapabilityValue(step, FixtureCapabilityType.EffectSpeed, value.valuePercentage);
    }

    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  setProgram(number: any) {
    const programNumber = Math.round(Number(number));

    if (isNaN(programNumber) || programNumber < 0) {
      return;
    }

    this.putProgram((value) => (value.programNumber = programNumber));
  }

  setSpeed(speed: any) {
    const number = Number(speed);

    if (isNaN(number) || number < 0 || number > 1) {
      return;
    }

    this.putProgram((value) => (value.valuePercentage = number));
  }

  setSound(sound: boolean) {
    this.putProgram((value) => (value.soundControlled = sound === true ? true : undefined));
  }

  // ---- maintenance ----

  // what the fixtures of the preset can be asked to do
  get actions(): MaintenanceAction[] {
    return maintenanceActions.filter((action) => this.fixtureChannels.some((channels) => !!getMaintenanceCapability(channels, action)));
  }

  setAction(action: string) {
    const step = this.presetService.selectedStep;

    if (!step || maintenanceActions.indexOf(action as MaintenanceAction) < 0) {
      return;
    }

    const value = new FixtureCapabilityValue({ type: this.type, valuePercentage: 1, maintenanceAction: action });
    this.presetService.putCapabilityValue(step, value);
    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  changeActive(active: boolean) {
    if (active) {
      if (this.kind === 'program') {
        this.putProgram(() => undefined);
      } else {
        this.setAction(this.actions[0] || 'reset');
      }

      return;
    }

    this.presetService.deleteCapabilityValue(this.presetService.selectedStep, this.type);

    if (this.kind === 'program') {
      this.presetService.deleteCapabilityValue(this.presetService.selectedStep, FixtureCapabilityType.EffectSpeed);
    }

    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }
}
