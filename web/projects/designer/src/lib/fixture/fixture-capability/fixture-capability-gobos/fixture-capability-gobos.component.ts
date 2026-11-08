import { AfterViewChecked, ChangeDetectorRef, Component, ElementRef, Input, QueryList, ViewChildren } from '@angular/core';
import { CachedFixtureChannel } from '../../../models/cached-fixture-channel';
import { FixtureCapabilityType } from '../../../models/fixture-capability';
import { FixtureProfile } from '../../../models/fixture-profile';
import { FixtureWheelSlotType } from '../../../models/fixture-wheel-slot';
import { drawGoboPattern, getShownGoboPattern, GoboPattern } from '../../../preview/models/gobo';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { ProjectService } from '../../../services/project.service';

// a slot of a wheel of a model, which a gobo picked for all models is put on
interface WheelSlot {
  profileUuid: string;
  wheel: string;
  slotNumber: number;
}

// a gobo the gobo wheels of the models share: the pattern the preview shows it with (or the wheel open), and the slot
// showing it on each wheel having it
export interface SharedGobo {
  key: string;
  pattern: GoboPattern;
  slots: WheelSlot[];
}

// The gobo wheels of all models of the preset at once: a gobo picked is put on each wheel showing it (with the same
// pattern, matched to it by hand in the wheel of each model, or the one its name brings), the open slot opens all of
// them. A wheel without the gobo keeps what it has. Each model plays its own slot, so this picks for all of them only
// while the preset is edited.
@Component({
  selector: 'lib-app-fixture-capability-gobos',
  templateUrl: './fixture-capability-gobos.component.html',
  styleUrls: ['./fixture-capability-gobos.component.css'],
  standalone: false,
})
export class FixtureCapabilityGobosComponent implements AfterViewChecked {
  @Input()
  wheels: { profile: FixtureProfile; channel: CachedFixtureChannel }[] = [];

  @ViewChildren('goboCanvas') goboCanvases: QueryList<ElementRef<HTMLCanvasElement>>;

  constructor(
    private presetService: PresetService,
    private projectService: ProjectService,
    private changeDetectorRef: ChangeDetectorRef,
    private livePreviewService: LivePreviewService
  ) {}

  ngAfterViewChecked() {
    this.drawGobos();
  }

  private static keyOf(pattern: GoboPattern): string {
    return pattern.family + ':' + pattern.count + ':' + pattern.seed;
  }

  // the gobos of all the wheels, each once, in the order they come in: the open slot first
  get gobos(): SharedGobo[] {
    const gobos = new Map<string, SharedGobo>();
    const open: SharedGobo = { key: 'open', pattern: undefined, slots: [] };

    for (const { profile, channel } of this.wheels || []) {
      let wheelName: string;

      for (const capability of channel.capabilities) {
        if (capability.capability.type !== FixtureCapabilityType.WheelSlot || !capability.wheel || capability.wheelSlots.length !== 1) {
          continue;
        }

        wheelName = wheelName || capability.wheelName;

        if (capability.wheelName !== wheelName) {
          continue;
        }

        const slot = capability.wheelSlots[0];
        const wheelSlot = { profileUuid: profile.uuid, wheel: wheelName, slotNumber: capability.capability.slotNumber };

        if (slot.type === FixtureWheelSlotType.Open) {
          if (!open.slots.some((existing) => existing.profileUuid === profile.uuid && existing.wheel === wheelName)) {
            open.slots.push(wheelSlot);
          }

          continue;
        }

        if (slot.type !== FixtureWheelSlotType.Gobo && slot.type !== FixtureWheelSlotType.AnimationGoboStart) {
          continue;
        }

        const pattern = getShownGoboPattern(
          this.projectService.project?.goboPatterns,
          profile.uuid,
          wheelName,
          wheelSlot.slotNumber,
          slot.name
        );
        const key = FixtureCapabilityGobosComponent.keyOf(pattern);
        let gobo = gobos.get(key);

        if (!gobo) {
          gobo = { key, pattern, slots: [] };
          gobos.set(key, gobo);
        }

        // a wheel takes the first slot showing the gobo
        if (!gobo.slots.some((existing) => existing.profileUuid === profile.uuid && existing.wheel === wheelName)) {
          gobo.slots.push(wheelSlot);
        }
      }
    }

    return [...(open.slots.length > 0 ? [open] : []), ...Array.from(gobos.values())];
  }

  // how many of the models have the gobo
  get modelCount(): number {
    return new Set((this.wheels || []).map((wheel) => wheel.profile.uuid)).size;
  }

  getModelCount(gobo: SharedGobo): number {
    return new Set(gobo.slots.map((slot) => slot.profileUuid)).size;
  }

  // does every wheel having the gobo show it in the step being edited?
  isPicked(gobo: SharedGobo): boolean {
    return gobo.slots.every(
      (slot) =>
        this.presetService.getCapabilityValue(
          this.presetService.selectedStep,
          FixtureCapabilityType.WheelSlot,
          undefined,
          slot.wheel,
          slot.profileUuid
        )?.slotNumber === slot.slotNumber
    );
  }

  pick(gobo: SharedGobo) {
    const step = this.presetService.selectedStep;

    if (!step) {
      return;
    }

    for (const slot of gobo.slots) {
      this.presetService.setCapabilityValue(
        step,
        FixtureCapabilityType.WheelSlot,
        undefined,
        slot.slotNumber,
        undefined,
        slot.wheel,
        slot.profileUuid
      );
    }

    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  private drawGobos() {
    const gobos = new Map(this.gobos.map((gobo) => [gobo.key, gobo.pattern]));
    const pixelRatio = window.devicePixelRatio || 1;

    this.goboCanvases?.forEach((element) => {
      const canvas = element.nativeElement;
      const pattern = gobos.get(canvas.dataset.key);
      const size = Math.round((canvas.clientWidth || Number(canvas.getAttribute('width')) || 32) * pixelRatio);
      const drawn = canvas.dataset.key + '@' + size;

      if (!pattern || canvas.dataset.drawn === drawn) {
        return;
      }

      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');

      if (context) {
        drawGoboPattern(context, pattern, size);
      }

      canvas.dataset.drawn = drawn;
    });
  }
}
