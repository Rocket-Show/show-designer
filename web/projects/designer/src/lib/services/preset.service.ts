import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { CachedFixtureCapability } from '../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../models/cached-fixture-channel';
import { Fixture } from '../models/fixture';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { FixtureChannelValue } from '../models/fixture-channel-value';
import { FixtureProfile } from '../models/fixture-profile';
import { EffectCurve } from '../models/effect-curve';
import { Preset } from '../models/preset';
import { PresetStep } from '../models/preset-step';
import { EffectService } from './effect.service';
import { PresetStepService } from './preset-step.service';
import { FixtureService } from './fixture.service';
import { ProjectService } from './project.service';
import { UuidService } from './uuid.service';
import { PresetFixture } from '../models/preset-fixture';
import { LivePreviewService } from './live-preview.service';
import { AnimationService } from './animation.service';

@Injectable({
  providedIn: 'root',
})
export class PresetService {
  selectedPreset: Preset;

  // the step of the selected preset the capability, channel and effect panels edit. It
  // is also what the preview shows while nothing is playing.
  selectedStep: PresetStep;

  // the fixtures of a preset indexed by fixture uuid (see getPresetFixturesByUuid)
  private presetFixtureIndex = new WeakMap<Preset, { list: PresetFixture[]; length: number; byUuid: Map<string, PresetFixture[]> }>();

  // fires, when the current preview element has changed (scene/preset)
  previewSelectionChanged: Subject<void> = new Subject<void>();

  // fires, when presets have been added or removed
  presetsChanged: Subject<void> = new Subject<void>();

  // fires, when the steps of the selected preset have changed or another one of them
  // has been selected
  stepsChanged: Subject<void> = new Subject<void>();

  // fires, when the fixture selection has changed
  fixtureSelectionChanged: Subject<void> = new Subject<void>();

  // fires, when the fixture selection has changed for settings
  fixtureSelectionSettingsChanged: Subject<void> = new Subject<void>();

  // fires, when the selected color has changed. This is required,
  // because detectChanges is not enough to trigger different components.
  fixtureColorChanged: Subject<void> = new Subject<void>();

  // fires, when a capability value has been set or deleted (dimmer, color, pan/tilt,
  // wheel slot). The channels driven by these capabilities show what they do to them.
  capabilityValuesChanged: Subject<void> = new Subject<void>();

  constructor(
    private effectService: EffectService,
    private presetStepService: PresetStepService,
    private uuidService: UuidService,
    private projectService: ProjectService,
    private fixtureService: FixtureService,
    private livePreviewService: LivePreviewService,
    private animationService: AnimationService
  ) {}

  getPresetByUuid(uuid: string): Preset {
    for (const preset of this.projectService.project.presets) {
      if (preset.uuid === uuid) {
        return preset;
      }
    }
  }

  fixtureUuidAndPixelKeyEquals(fixtureUuid1: string, fixtureUuid2: string, pixelKey1: string, pixelKey2: string): boolean {
    return fixtureUuid1 === fixtureUuid2 && ((!pixelKey1 && !pixelKey2) || pixelKey1 === pixelKey2);
  }

  getPresetFixture(preset: Preset, fixtureUuid: string, pixelKey?: string): PresetFixture {
    // only the fixtures of this uuid can match, which are the fixture itself and its pixels
    for (const fixture of this.getPresetFixturesByUuid(preset, fixtureUuid)) {
      if (this.fixtureUuidAndPixelKeyEquals(fixture.fixtureUuid, fixtureUuid, fixture.pixelKey, pixelKey)) {
        return fixture;
      }
    }

    return null;
  }

  // getPresetFixture() is called from templates and therefore runs for every fixture on every
  // change detection cycle, which a slider being dragged triggers with each mouse move. Walking
  // all fixtures of the preset each time makes that quadratic, so index them by uuid instead.
  // A preset only ever gets fixtures added, removed or reordered, never exchanged in place, so
  // the list itself together with its length tells us whether the index is still valid.
  // Reordering leaves it valid, because a preset holds at most one entry per fixture and pixel.
  private getPresetFixturesByUuid(preset: Preset, fixtureUuid: string): PresetFixture[] {
    let index = this.presetFixtureIndex.get(preset);

    if (!index || index.list !== preset.fixtures || index.length !== preset.fixtures.length) {
      const byUuid = new Map<string, PresetFixture[]>();

      for (const fixture of preset.fixtures) {
        const fixturesOfUuid = byUuid.get(fixture.fixtureUuid);

        if (fixturesOfUuid) {
          fixturesOfUuid.push(fixture);
        } else {
          byUuid.set(fixture.fixtureUuid, [fixture]);
        }
      }

      index = { list: preset.fixtures, length: preset.fixtures.length, byUuid };
      this.presetFixtureIndex.set(preset, index);
    }

    return index.byUuid.get(fixtureUuid) || [];
  }

  // all fixtures of a preset in the order they are chased in: either the global
  // order of the project or the preset's own one
  getOrderedPresetFixtures(preset: Preset): PresetFixture[] {
    if (!preset.useGlobalFixtureOrder) {
      return preset.fixtures;
    }

    return this.projectService.project.presetFixtures.filter((projectFixture) =>
      this.getPresetFixture(preset, projectFixture.fixtureUuid, projectFixture.pixelKey)
    );
  }

  // the number of chase steps of a preset: fixtures sharing a DMX universe, address
  // and pixel key are the same lamp and therefore count only once
  getPresetFixtureCount(preset: Preset): number {
    let count = 0;
    const countedFirstDmxChannelPixelKey: any[] = [];

    for (const presetFixture of preset.fixtures) {
      const fixture = this.fixtureService.getFixtureByUuid(presetFixture.fixtureUuid);

      if (!fixture) {
        continue;
      }

      const firstDmxChannelAndFixtureUuid = {
        dmxUniverseUuid: fixture.dmxUniverseUuid,
        firstDmxChannel: fixture.dmxFirstChannel,
        pixelKey: presetFixture.pixelKey,
      };

      const exists = countedFirstDmxChannelPixelKey.some(
        (item) =>
          item.dmxUniverseUuid === firstDmxChannelAndFixtureUuid.dmxUniverseUuid &&
          item.firstDmxChannel === firstDmxChannelAndFixtureUuid.firstDmxChannel &&
          ((!item.pixelKey && !firstDmxChannelAndFixtureUuid.pixelKey) || item.pixelKey === firstDmxChannelAndFixtureUuid.pixelKey)
      );

      if (!exists) {
        count++;
        countedFirstDmxChannelPixelKey.push(firstDmxChannelAndFixtureUuid);
      }
    }

    return count;
  }

  setUseGlobalFixtureOrder(preset: Preset, useGlobalFixtureOrder: boolean) {
    if (!useGlobalFixtureOrder) {
      // start from the order which has been in effect so far, so the chasing does
      // not change just because the preset got its own order
      preset.fixtures = this.getOrderedPresetFixtures(preset).map((presetFixture) => new PresetFixture(presetFixture));
    }

    preset.useGlobalFixtureOrder = useGlobalFixtureOrder;
    this.livePreviewService.previewLive();
  }

  fixtureIsSelected(fixture: Fixture, pixelKey: string, preset?: Preset): boolean {
    // is the passed fixture selected in the passed/currently selected preset?
    if (!preset) {
      if (this.selectedPreset) {
        preset = this.selectedPreset;
      } else {
        return false;
      }
    }

    const presetFixture = this.getPresetFixture(preset, fixture.uuid, pixelKey);

    if (presetFixture) {
      return true;
    }

    return false;
  }

  switchFixtureSelection(fixture: Fixture, pixelKey: string) {
    if (!this.selectedPreset) {
      return;
    }

    // select all fixtures at the specified start channel or unselect them,
    // if already selected
    if (this.fixtureIsSelected(fixture, pixelKey)) {
      for (let i = this.selectedPreset.fixtures.length - 1; i >= 0; i--) {
        const projectFixture = this.fixtureService.getFixtureByUuid(this.selectedPreset.fixtures[i].fixtureUuid);
        if (
          projectFixture.dmxFirstChannel === fixture.dmxFirstChannel &&
          projectFixture.dmxUniverseUuid === fixture.dmxUniverseUuid &&
          ((!this.selectedPreset.fixtures[i].pixelKey && !pixelKey) || this.selectedPreset.fixtures[i].pixelKey === pixelKey)
        ) {
          this.selectedPreset.fixtures.splice(i, 1);
        }
      }
    } else {
      for (const projectPresetFixture of this.projectService.project.presetFixtures) {
        if ((!projectPresetFixture.pixelKey && !pixelKey) || projectPresetFixture.pixelKey === pixelKey) {
          const projectFixture = this.fixtureService.getFixtureByUuid(projectPresetFixture.fixtureUuid);
          if (projectFixture.dmxFirstChannel === fixture.dmxFirstChannel && projectFixture.dmxUniverseUuid === fixture.dmxUniverseUuid) {
            const presetFixture = new PresetFixture();
            presetFixture.fixtureUuid = projectPresetFixture.fixtureUuid;
            presetFixture.pixelKey = pixelKey;
            this.selectedPreset.fixtures.push(presetFixture);
          }
        }
      }
    }
  }

  selectAllFixtures() {
    if (!this.selectedPreset) {
      return;
    }

    for (const fixture of this.projectService.project.fixtures) {
      if (this.fixtureService.fixtureHasGeneralChannel(fixture)) {
        if (!this.fixtureIsSelected(fixture, null)) {
          const presetFixture = new PresetFixture();
          presetFixture.fixtureUuid = fixture.uuid;
          this.selectedPreset.fixtures.push(presetFixture);
        }
      }

      const pixels = this.fixtureService.fixtureGetUniquePixels(fixture);

      for (const pixel of pixels) {
        if (!this.fixtureIsSelected(fixture, pixel.key)) {
          const presetFixture = new PresetFixture();
          presetFixture.fixtureUuid = fixture.uuid;
          presetFixture.pixelKey = pixel.key;
          this.selectedPreset.fixtures.push(presetFixture);
        }
      }
    }
  }

  selectNoFixtures() {
    if (!this.selectedPreset) {
      return;
    }

    this.selectedPreset.fixtures = [];
  }

  private presetFixtueEquals(fixture1: PresetFixture, fixture2: PresetFixture): boolean {
    return (
      fixture1.fixtureUuid === fixture2.fixtureUuid &&
      ((!fixture2.pixelKey && !fixture1.pixelKey) || fixture2.pixelKey === fixture1.pixelKey)
    );
  }

  public removeDeletedFixtures() {
    // after changing the configuration in the fixture pool, we might need to
    // delete some fixtures
    for (const preset of this.projectService.project.presets) {
      for (let i = preset.fixtures.length - 1; i >= 0; i--) {
        const presetFixture = preset.fixtures[i];

        let found = false;
        for (let projectFixture of this.projectService.project.presetFixtures) {
          if (this.presetFixtueEquals(presetFixture, projectFixture)) {
            found = true;
            break;
          }
        }
        if (!found) {
          preset.fixtures.splice(i, 1);
        }
      }
    }
  }

  public updateFixtureSelection() {
    // after changing the configuration in the fixture pool, we might need to
    // select some more fixtures on the same channel as already selected ones
    for (const preset of this.projectService.project.presets) {
      for (let presetFixture of preset.fixtures) {
        const fixture = this.fixtureService.getFixtureByUuid(presetFixture.fixtureUuid);
        for (const projectFixture of this.projectService.project.fixtures) {
          if (
            projectFixture.dmxFirstChannel === fixture.dmxFirstChannel &&
            projectFixture.dmxUniverseUuid === fixture.dmxUniverseUuid &&
            !this.fixtureIsSelected(projectFixture, presetFixture.pixelKey, preset)
          ) {
            const newPresetFixture = new PresetFixture();
            newPresetFixture.fixtureUuid = projectFixture.uuid;
            newPresetFixture.pixelKey = presetFixture.pixelKey;
            preset.fixtures.push(newPresetFixture);
          }
        }
      }
    }
  }

  deleteCapabilityValue(
    step: PresetStep,
    capabilityType: FixtureCapabilityType,
    color?: FixtureCapabilityColor,
    wheel?: string,
    profileUuid?: string
  ) {
    this.removeCapabilityValue(step, capabilityType, color, wheel, profileUuid);
    this.capabilityValuesChanged.next();
  }

  private removeCapabilityValue(
    step: PresetStep,
    capabilityType: FixtureCapabilityType,
    color?: FixtureCapabilityColor,
    wheel?: string,
    profileUuid?: string
  ) {
    for (let i = 0; i < step.fixtureCapabilityValues.length; i++) {
      if (
        this.fixtureService.capabilitiesMatch(
          step.fixtureCapabilityValues[i].type,
          capabilityType,
          step.fixtureCapabilityValues[i].color,
          color,
          step.fixtureCapabilityValues[i].wheel,
          wheel,
          step.fixtureCapabilityValues[i].profileUuid,
          profileUuid
        )
      ) {
        step.fixtureCapabilityValues.splice(i, 1);
        return;
      }
    }
  }

  setCapabilityValue(
    step: PresetStep,
    capabilityType: FixtureCapabilityType,
    valuePercentage: number,
    slotNumber?: number,
    color?: FixtureCapabilityColor,
    wheel?: string,
    profileUuid?: string
  ) {
    // Delete existant properties with this type and set the new value
    this.removeCapabilityValue(step, capabilityType, color, wheel, profileUuid);

    const fixtureCapabilityValue = new FixtureCapabilityValue();
    fixtureCapabilityValue.type = capabilityType;
    fixtureCapabilityValue.color = color;
    fixtureCapabilityValue.wheel = wheel;
    fixtureCapabilityValue.valuePercentage = valuePercentage;
    fixtureCapabilityValue.slotNumber = slotNumber;
    fixtureCapabilityValue.profileUuid = profileUuid;

    step.fixtureCapabilityValues.push(fixtureCapabilityValue);
    this.capabilityValuesChanged.next();
  }

  getCapabilityValue(
    step: PresetStep,
    capabilityType: FixtureCapabilityType,
    color?: FixtureCapabilityColor,
    wheel?: string,
    profileUuid?: string
  ): FixtureCapabilityValue {
    if (!step) {
      return undefined;
    }

    return this.getCapabilityValueOf(step.fixtureCapabilityValues, capabilityType, color, wheel, profileUuid);
  }

  // the same lookup on a set of values which is not stored on a step: while a
  // transition runs, the values shown are the ones interpolated between two steps
  getCapabilityValueOf(
    capabilityValues: FixtureCapabilityValue[],
    capabilityType: FixtureCapabilityType,
    color?: FixtureCapabilityColor,
    wheel?: string,
    profileUuid?: string
  ): FixtureCapabilityValue {
    for (const capabilityValue of capabilityValues) {
      if (
        this.fixtureService.capabilitiesMatch(
          capabilityValue.type,
          capabilityType,
          capabilityValue.color,
          color,
          capabilityValue.wheel,
          wheel,
          capabilityValue.profileUuid,
          profileUuid
        )
      ) {
        return capabilityValue;
      }
    }
    return undefined;
  }

  deleteChannelValue(channelName: string, profileUuid: string) {
    if (!this.selectedStep) {
      return;
    }

    for (let i = 0; i < this.selectedStep.fixtureChannelValues.length; i++) {
      if (
        this.selectedStep.fixtureChannelValues[i].channelName === channelName &&
        this.selectedStep.fixtureChannelValues[i].profileUuid === profileUuid
      ) {
        this.selectedStep.fixtureChannelValues.splice(i, 1);
        return;
      }
    }
  }

  setChannelValue(channelName: string, profileUuid: string, value: number) {
    if (!this.selectedStep) {
      return;
    }

    // Delete existant properties with this type and set the new value
    this.deleteChannelValue(channelName, profileUuid);

    const fixtureChannelValue = new FixtureChannelValue();
    fixtureChannelValue.channelName = channelName;
    fixtureChannelValue.profileUuid = profileUuid;
    fixtureChannelValue.value = value;

    this.selectedStep.fixtureChannelValues.push(fixtureChannelValue);
  }

  getChannelValue(channelName: string, profileUuid: string): number {
    if (!this.selectedStep) {
      return undefined;
    }

    for (const channelValue of this.selectedStep.fixtureChannelValues) {
      if (channelValue.channelName === channelName && channelValue.profileUuid === profileUuid) {
        return channelValue.value;
      }
    }
  }

  getApproximatedColorWheelCapability(
    capabilityValues: FixtureCapabilityValue[],
    cachedChannel: CachedFixtureChannel
  ): CachedFixtureCapability {
    // return an approximated wheel slot channel capability, if a color or a slot on a different
    // wheel has been selected
    let colorRed: number;
    let colorGreen: number;
    let colorBlue: number;
    let lowestDiff = Number.MAX_VALUE;
    let lowestDiffCapability: CachedFixtureCapability;
    let capabilityValue: FixtureCapabilityValue;

    capabilityValue = this.getCapabilityValueOf(capabilityValues, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Red);
    if (capabilityValue) {
      colorRed = 255 * capabilityValue.valuePercentage;
    }
    capabilityValue = this.getCapabilityValueOf(capabilityValues, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Green);
    if (capabilityValue) {
      colorGreen = 255 * capabilityValue.valuePercentage;
    }
    capabilityValue = this.getCapabilityValueOf(capabilityValues, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Blue);
    if (capabilityValue) {
      colorBlue = 255 * capabilityValue.valuePercentage;
    }

    if (!colorRed && !colorGreen && !colorBlue) {
      // no color found -> search the first color wheel
      // TODO
    }

    if (colorRed !== undefined && colorGreen !== undefined && colorBlue !== undefined) {
      for (const capability of cachedChannel.capabilities) {
        if (capability.capability.slotNumber) {
          const mixedColor = this.fixtureService.getMixedWheelSlotColor(capability.wheel, capability.capability.slotNumber);
          if (mixedColor) {
            const diff =
              Math.abs(mixedColor.red - colorRed) + Math.abs(mixedColor.green - colorGreen) + Math.abs(mixedColor.blue - colorBlue);

            if (diff < lowestDiff) {
              lowestDiff = diff;
              lowestDiffCapability = capability;
            }
          }
        }
      }
    }

    return lowestDiffCapability;
  }

  // the value a single capability value of a preset produces on a channel capability, or
  // undefined, if it does not reach that capability at all. This is what the preview and the
  // player make of a capability, and what the channels have to show while it is in effect.
  getCapabilityChannelValue(
    capabilityValue: FixtureCapabilityValue,
    channel: CachedFixtureChannel,
    channelCapability: CachedFixtureCapability
  ): number {
    if (
      (capabilityValue.type === FixtureCapabilityType.Intensity || capabilityValue.type === FixtureCapabilityType.ColorIntensity) &&
      capabilityValue.valuePercentage >= 0
    ) {
      // intensity and colorIntensity (dimmer and color)
      if (channel.capabilities.length === 1) {
        // the only capability in this channel -> it takes the whole channel
        return channel.maxValue * capabilityValue.valuePercentage;
      }

      // more than one capability in the channel -> only a brightness capability can be dimmed
      if (channelCapability.capability.brightness === 'off' && capabilityValue.valuePercentage === 0) {
        return channelCapability.centerValue;
      }

      if (
        (channelCapability.capability.brightnessStart === 'dark' || channelCapability.capability.brightnessStart === 'off') &&
        channelCapability.capability.brightnessEnd === 'bright'
      ) {
        return (
          (channelCapability.capability.dmxRange[1] - channelCapability.capability.dmxRange[0]) * capabilityValue.valuePercentage +
          channelCapability.capability.dmxRange[0]
        );
      }

      return undefined;
    }

    if (
      (capabilityValue.type === FixtureCapabilityType.Pan || capabilityValue.type === FixtureCapabilityType.Tilt) &&
      capabilityValue.valuePercentage >= 0
    ) {
      return channel.maxValue * capabilityValue.valuePercentage;
    }

    if (
      capabilityValue.type === FixtureCapabilityType.WheelSlot &&
      channelCapability.capability.slotNumber === capabilityValue.slotNumber
    ) {
      // wheel slot (color, gobo, etc.)
      return channelCapability.centerValue;
    }

    return undefined;
  }

  // the value a channel is driven to by the capability values of a preset, or undefined, if no
  // capability touches it. A channel value set on the channel itself wins over this one.
  getChannelValueFromCapabilities(capabilityValues: FixtureCapabilityValue[], channel: CachedFixtureChannel, profileUuid: string): number {
    let value: number;

    for (const capabilityValue of capabilityValues) {
      for (const channelCapability of channel.capabilities) {
        if (
          this.fixtureService.capabilitiesMatch(
            capabilityValue.type,
            channelCapability.capability.type,
            capabilityValue.color,
            channelCapability.capability.color,
            capabilityValue.wheel,
            channelCapability.wheelName,
            capabilityValue.profileUuid,
            profileUuid
          )
        ) {
          const capabilityChannelValue = this.getCapabilityChannelValue(capabilityValue, channel, channelCapability);

          if (capabilityChannelValue !== undefined) {
            // a later capability value overwrites an earlier one, just like in the preview
            value = capabilityChannelValue;
          }
        }
      }
    }

    if (value === undefined && channel.colorWheel) {
      // no slot has been picked on this wheel -> it shows the color approximated from a color
      // or from a slot on a different wheel
      const approximatedCapability = this.getApproximatedColorWheelCapability(capabilityValues, channel);

      if (approximatedCapability) {
        value = approximatedCapability.centerValue;
      }
    }

    return value;
  }

  // whether an effect of the preset drives a channel. An effect overwrites whatever the
  // capabilities and the channel itself say, but its value is a moving one and, as soon as the
  // effect is chasing, a different one for every fixture -> the channel can only tell that it is
  // in the hands of an effect, not which value it is at.
  // this follows the same rules as mixEffects() in the preview service.
  channelIsDrivenByEffect(preset: Preset, channel: CachedFixtureChannel, profileUuid: string): boolean {
    for (const effect of preset.effects) {
      if (!effect.visible || !(effect instanceof EffectCurve)) {
        continue;
      }

      // the capabilities of the effect reach this type of channel on every profile
      for (const capability of effect.capabilities) {
        for (const channelCapability of channel.capabilities) {
          if (
            this.fixtureService.capabilitiesMatch(
              capability.type,
              channelCapability.capability.type,
              capability.color,
              channelCapability.capability.color,
              null,
              null,
              null,
              null
            )
          ) {
            return true;
          }
        }
      }

      // the channels of the effect are named per profile
      for (const profileChannels of effect.channels) {
        if (profileChannels.profileUuid === profileUuid && profileChannels.channels.indexOf(channel.name) >= 0) {
          return true;
        }
      }
    }

    return false;
  }

  private hasCapabilityType(type: FixtureCapabilityType): boolean {
    // there is at least one channel with at least one intensity capability
    for (const presetFixture of this.selectedPreset.fixtures) {
      const fixture = this.fixtureService.getCachedFixtureByUuid(presetFixture.fixtureUuid, presetFixture.pixelKey);
      for (const channel of fixture.channels) {
        if (channel.channel) {
          for (const capability of channel.capabilities) {
            if (capability.capability.type === type) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  hasCapabilityDimmer(): boolean {
    return this.hasCapabilityType(FixtureCapabilityType.Intensity);
  }

  hasCapabilityColor(): boolean {
    // TODO optionally color temperature and color white (see stairville/mh-100)

    // one of the profiles has a color intensity
    if (this.hasCapabilityType(FixtureCapabilityType.ColorIntensity)) {
      return true;
    }

    return false;
  }

  hasCapabilityColorOrColorWheel(): boolean {
    // TODO optionally color temperature and color white (see stairville/mh-100)

    // one of the profiles has a color intensity
    if (this.hasCapabilityColor()) {
      return true;
    }

    // a color wheel is involved
    for (const projectFixture of this.selectedPreset.fixtures) {
      const fixture = this.fixtureService.getCachedFixtureByUuid(projectFixture.fixtureUuid, projectFixture.pixelKey);
      for (const channel of fixture.channels) {
        if (channel.colorWheel) {
          return true;
        }
      }
    }

    return false;
  }

  hasCapabilityPanTilt(): boolean {
    let hasPan = false;
    let hasTilt = false;

    // there is at least one pan and one tilt channel
    if (this.hasCapabilityType(FixtureCapabilityType.Pan)) {
      hasPan = true;
    }

    if (this.hasCapabilityType(FixtureCapabilityType.Tilt)) {
      hasTilt = true;
    }

    if (hasPan && hasTilt) {
      return true;
    }

    return false;
  }

  // switch between previewing the selected scenes and the preset being edited
  setPreviewPreset(previewPreset: boolean) {
    this.projectService.project.previewPreset = previewPreset;
    this.previewSelectionChanged.next();
    this.livePreviewService.previewLive();
  }

  selectPreset(index: number) {
    this.effectService.selectedEffect = undefined;
    this.selectedPreset = this.projectService.project.presets[index];
    this.projectService.project.selectedPresetUuid = this.projectService.project.presets[index].uuid;
    this.presetStepService.ensureStep(this.selectedPreset);
    this.selectStep(this.selectedPreset.steps[0]);
    this.autoOpenFirstEffect();
    this.previewSelectionChanged.next();
    this.livePreviewService.previewLive();
  }

  // the step the panels are editing, which is what the preview shows while nothing is
  // playing. The presets which are not being edited show what they start out with.
  getEditStep(preset: Preset): PresetStep {
    if (preset === this.selectedPreset && this.selectedStep && preset.steps.indexOf(this.selectedStep) >= 0) {
      return this.selectedStep;
    }

    return preset.steps[0];
  }

  selectStep(step: PresetStep) {
    this.selectedStep = step;
    this.projectService.project.selectedStepUuid = step ? step.uuid : undefined;
    this.stepsChanged.next();
    this.livePreviewService.previewLive();
  }

  // pick up the step the panels edit after a project has been loaded or migrated
  selectStepFromProject() {
    for (const preset of this.projectService.project.presets) {
      this.presetStepService.ensureStep(preset);
    }

    this.projectService.project.stepPreviewRunning = false;

    if (!this.selectedPreset) {
      this.selectedStep = undefined;
      this.stepsChanged.next();
      return;
    }

    const selectedStepUuid = this.projectService.project.selectedStepUuid;
    this.selectStep(this.selectedPreset.steps.find((step) => step.uuid === selectedStepUuid) || this.selectedPreset.steps[0]);
  }

  addStep(): PresetStep {
    if (!this.selectedPreset) {
      return undefined;
    }

    const step = this.presetStepService.addStep(this.selectedPreset, this.selectedStep);
    this.selectStep(step);

    return step;
  }

  deleteStep(step: PresetStep) {
    if (!this.selectedPreset) {
      return;
    }

    this.presetStepService.deleteStep(this.selectedPreset, step);

    if (this.selectedPreset.steps.indexOf(this.selectedStep) < 0) {
      this.selectStep(this.selectedPreset.steps[0]);
    } else {
      this.stepsChanged.next();
      this.livePreviewService.previewLive();
    }
  }

  // the steps of a preset only ever run in the order they are reached, so a step whose
  // time was changed takes its new place right away
  stepChanged() {
    if (this.selectedPreset) {
      this.presetStepService.sortSteps(this.selectedPreset);
    }

    this.stepsChanged.next();
    this.livePreviewService.previewLive();
  }

  // the step the selected preset is on while it plays, which is what its rail marks.
  // The preview works it out on every frame, outside of Angular, so the rail reads it
  // on a clock of its own rather than being told about it.
  activeStep: PresetStep;

  // how far the preset has come through that step, between 0 and 1
  activeStepProgress = 0;

  // Whether the steps are shown beside the panels which edit them. Left alone they
  // show themselves once a preset runs through more than one of them, since a single
  // step is the static look a preset has always been; switching them decides it by
  // hand from then on.
  private stepsVisibleOverride: boolean;

  get stepsVisible(): boolean {
    if (this.stepsVisibleOverride !== undefined) {
      return this.stepsVisibleOverride;
    }

    return !!this.selectedPreset && this.selectedPreset.steps.length > 1;
  }

  switchStepsVisible() {
    this.stepsVisibleOverride = !this.stepsVisible;
  }

  // run the steps of the selected preset in the preview instead of holding the step
  // being edited, so that the sequence can be watched without a composition
  get stepPreviewRunning(): boolean {
    return this.projectService.project && this.projectService.project.stepPreviewRunning === true;
  }

  setStepPreviewRunning(running: boolean) {
    // the run starts at the first step rather than wherever the clock happens to stand
    this.projectService.project.stepPreviewStartMillis = this.animationService.timeMillis;
    this.projectService.project.stepPreviewRunning = running;
    this.stepsChanged.next();
    this.livePreviewService.previewLive();
  }

  // A run which does not loop is over once it has reached the last step: there is
  // nothing left for it to travel to, so it stops instead of standing on that step.
  stepPreviewFinished(): boolean {
    const preset = this.selectedPreset;

    if (!preset || preset.stepsLoop || preset.steps.length === 0) {
      return false;
    }

    const lastStep = preset.steps[preset.steps.length - 1];

    return this.animationService.timeMillis - this.stepPreviewStartMillis >= lastStep.startMillis;
  }

  get stepPreviewStartMillis(): number {
    return this.projectService.project ? this.projectService.project.stepPreviewStartMillis : 0;
  }

  autoOpenFirstEffect() {
    // open the first effect, if the preset only has one
    if (this.selectedPreset && this.selectedPreset.effects.length === 1) {
      this.effectService.selectedEffect = this.selectedPreset.effects[0];
    }
  }

  addPreset(name?: string): void {
    const preset: Preset = new Preset();
    preset.uuid = this.uuidService.getUuid();
    preset.name = name || 'New Preset';

    // Insert the new preset before the highest currently selected preset
    let highestSelectedPresetIndex = 0;

    for (let i = 0; i < this.projectService.project.presets.length; i++) {
      if (this.selectedPreset === this.projectService.project.presets[i]) {
        highestSelectedPresetIndex = i;
        break;
      }
    }

    this.projectService.project.presets.splice(highestSelectedPresetIndex, 0, preset);
    this.presetsChanged.next();
    this.selectPreset(highestSelectedPresetIndex);
  }

  removePreset(preset: Preset): void {
    const index = this.projectService.project.presets.indexOf(preset);

    if (index < 0) {
      return;
    }

    this.projectService.project.presets.splice(index, 1);
    this.presetsChanged.next();

    if (this.projectService.project.presets.length > 0) {
      this.selectPreset(0);
    } else {
      this.selectedPreset = undefined;
      this.projectService.project.selectedPresetUuid = undefined;
      this.selectStep(undefined);
      this.previewSelectionChanged.next();
    }
  }

  // return all fixture profiles used in the current preset selection
  getSelectedProfiles() {
    const profiles: FixtureProfile[] = [];

    if (!this.selectedPreset) {
      return profiles;
    }

    for (const presetFixture of this.selectedPreset.fixtures) {
      const fixture = this.fixtureService.getFixtureByUuid(presetFixture.fixtureUuid);
      const profile = this.fixtureService.getProfileByUuid(fixture.profileUuid);

      if (profiles.indexOf(profile) < 0) {
        profiles.push(profile);
      }
    }

    return profiles;
  }

  // given a list of fixture profiles, return all available channels based on the currently selected fixtures in the preset
  getSelectedProfileChannels(selectedProfiles: FixtureProfile[]) {
    const calculatedProfileModes = new Map<FixtureProfile, any[]>();
    const availableChannels: Map<FixtureProfile, CachedFixtureChannel[]> = new Map<FixtureProfile, CachedFixtureChannel[]>();

    // calculate all modes for each profile
    for (const profile of selectedProfiles) {
      const modeAndPixelKeys: any[] = [];

      // loop over the project fixtures to keep the order
      for (let projectFixture of this.projectService.project.presetFixtures) {
        for (const presetFixture of this.selectedPreset.fixtures) {
          if (this.presetFixtueEquals(presetFixture, projectFixture)) {
            const fixture = this.fixtureService.getCachedFixtureByUuid(presetFixture.fixtureUuid, presetFixture.pixelKey);
            if (fixture.profile.uuid === profile.uuid) {
              const exists = modeAndPixelKeys.some(
                (item) => (item.mode === fixture.mode && !item.pixelKey && !fixture.pixel?.key) || item.pixelKey === fixture.pixel?.key
              );
              if (!exists) {
                modeAndPixelKeys.push({
                  mode: fixture.mode,
                  pixelKey: presetFixture.pixelKey,
                });
              }
            }
          }
        }

        calculatedProfileModes.set(profile, modeAndPixelKeys);
      }
    }

    // calculate all channels from the modes
    calculatedProfileModes.forEach((modeAndPixelKeys: any[], profile: FixtureProfile) => {
      const profileChannels: CachedFixtureChannel[] = [];
      for (const modeAndPixelKey of modeAndPixelKeys) {
        const channels = this.fixtureService.getCachedChannels(profile, modeAndPixelKey.mode, modeAndPixelKey.pixelKey);
        for (const channel of channels) {
          // only add the channel, if no channel with the same name has already been added
          // (e.g. a fine channel)
          if (channel.channel && !profileChannels.find((c) => c.name === channel.name)) {
            profileChannels.push(channel);
          }
        }
      }
      availableChannels.set(profile, profileChannels);
    });

    return availableChannels;
  }
}
