import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { CachedFixtureCapability } from '../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../models/cached-fixture-channel';
import { Fixture } from '../models/fixture';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { FixtureChannelValue } from '../models/fixture-channel-value';
import { FixtureProfile } from '../models/fixture-profile';
import { Preset } from '../models/preset';
import { AnimationService } from './animation.service';
import { ConfigService } from './config.service';
import { EffectService } from './effect.service';
import { FixtureService } from './fixture.service';
import { ProjectService } from './project.service';
import { UuidService } from './uuid.service';
import { PresetFixture } from '../models/preset-fixture';

@Injectable({
  providedIn: 'root',
})
export class PresetService {
  selectedPreset: Preset;

  // fires, when the current preview element has changed (scene/preset)
  previewSelectionChanged: Subject<void> = new Subject<void>();

  // fires, when the fixture selection has changed
  fixtureSelectionChanged: Subject<void> = new Subject<void>();

  // fires, when the fixture selection has changed for settings
  fixtureSelectionSettingsChanged: Subject<void> = new Subject<void>();

  // fires, when the selected color has changed. This is required,
  // because detectChanges is not enough to trigger different components.
  fixtureColorChanged: Subject<void> = new Subject<void>();

  livePreviewTimer: any;
  liveChangePending = false;

  constructor(
    private effectService: EffectService,
    private uuidService: UuidService,
    private projectService: ProjectService,
    private fixtureService: FixtureService,
    private configService: ConfigService,
    private http: HttpClient,
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
    for (const fixture of preset.fixtures) {
      if (this.fixtureUuidAndPixelKeyEquals(fixture.fixtureUuid, fixtureUuid, fixture.pixelKey, pixelKey)) {
        return fixture;
      }
    }

    return null;
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
          ((!this.selectedPreset.fixtures[i].pixelKey && !pixelKey) || this.selectedPreset.fixtures[i].pixelKey === pixelKey)
        ) {
          this.selectedPreset.fixtures.splice(i, 1);
        }
      }
    } else {
      for (const projectPresetFixture of this.projectService.project.presetFixtures) {
        if ((!projectPresetFixture.pixelKey && !pixelKey) || projectPresetFixture.pixelKey === pixelKey) {
          const projectFixture = this.fixtureService.getFixtureByUuid(projectPresetFixture.fixtureUuid);
          if (projectFixture.dmxFirstChannel === fixture.dmxFirstChannel) {
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

      const pixelKeys = this.fixtureService.fixtureGetUniquePixelKeys(fixture);

      for (const pixelKey of pixelKeys) {
        if (!this.fixtureIsSelected(fixture, pixelKey)) {
          const presetFixture = new PresetFixture();
          presetFixture.fixtureUuid = fixture.uuid;
          presetFixture.pixelKey = pixelKey;
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

  public removeDeletedFixtures() {
    // after changing the configuration in the fixture pool, we might need to
    // delete some fixtures
    for (const preset of this.projectService.project.presets) {
      for (let i = preset.fixtures.length - 1; i >= 0; i--) {
        const presetFixture = preset.fixtures[i];

        let found = false;
        for (let projectFixture of this.projectService.project.presetFixtures) {
          if (
            presetFixture.fixtureUuid === projectFixture.fixtureUuid &&
            ((!projectFixture.pixelKey && !presetFixture.pixelKey) || projectFixture.pixelKey === presetFixture.pixelKey)
          ) {
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
    preset: Preset,
    capabilityType: FixtureCapabilityType,
    color?: FixtureCapabilityColor,
    wheel?: string,
    profileUuid?: string
  ) {
    for (let i = 0; i < preset.fixtureCapabilityValues.length; i++) {
      if (
        this.fixtureService.capabilitiesMatch(
          preset.fixtureCapabilityValues[i].type,
          capabilityType,
          preset.fixtureCapabilityValues[i].color,
          color,
          preset.fixtureCapabilityValues[i].wheel,
          wheel,
          preset.fixtureCapabilityValues[i].profileUuid,
          profileUuid
        )
      ) {
        preset.fixtureCapabilityValues.splice(i, 1);
        return;
      }
    }
  }

  setCapabilityValue(
    preset: Preset,
    capabilityType: FixtureCapabilityType,
    valuePercentage: number,
    slotNumber?: number,
    color?: FixtureCapabilityColor,
    wheel?: string,
    profileUuid?: string
  ) {
    // Delete existant properties with this type and set the new value
    this.deleteCapabilityValue(preset, capabilityType, color, wheel, profileUuid);

    const fixtureCapabilityValue = new FixtureCapabilityValue();
    fixtureCapabilityValue.type = capabilityType;
    fixtureCapabilityValue.color = color;
    fixtureCapabilityValue.wheel = wheel;
    fixtureCapabilityValue.valuePercentage = valuePercentage;
    fixtureCapabilityValue.slotNumber = slotNumber;
    fixtureCapabilityValue.profileUuid = profileUuid;

    preset.fixtureCapabilityValues.push(fixtureCapabilityValue);
  }

  getCapabilityValue(
    preset: Preset,
    capabilityType: FixtureCapabilityType,
    color?: FixtureCapabilityColor,
    wheel?: string,
    profileUuid?: string
  ): FixtureCapabilityValue {
    for (const capabilityValue of preset.fixtureCapabilityValues) {
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
    for (let i = 0; i < this.selectedPreset.fixtureChannelValues.length; i++) {
      if (
        this.selectedPreset.fixtureChannelValues[i].channelName === channelName &&
        this.selectedPreset.fixtureChannelValues[i].profileUuid === profileUuid
      ) {
        this.selectedPreset.fixtureChannelValues.splice(i, 1);
        return;
      }
    }
  }

  setChannelValue(channelName: string, profileUuid: string, value: number) {
    // Delete existant properties with this type and set the new value
    this.deleteChannelValue(channelName, profileUuid);

    const fixtureChannelValue = new FixtureChannelValue();
    fixtureChannelValue.channelName = channelName;
    fixtureChannelValue.profileUuid = profileUuid;
    fixtureChannelValue.value = value;

    this.selectedPreset.fixtureChannelValues.push(fixtureChannelValue);
  }

  getChannelValue(channelName: string, profileUuid: string): number {
    for (const channelValue of this.selectedPreset.fixtureChannelValues) {
      if (channelValue.channelName === channelName && channelValue.profileUuid === profileUuid) {
        return channelValue.value;
      }
    }
  }

  getApproximatedColorWheelCapability(preset: Preset, cachedChannel: CachedFixtureChannel): CachedFixtureCapability {
    // return an approximated wheel slot channel capability, if a color or a slot on a different
    // wheel has been selected
    let colorRed: number;
    let colorGreen: number;
    let colorBlue: number;
    let lowestDiff = Number.MAX_VALUE;
    let lowestDiffCapability: CachedFixtureCapability;
    let capabilityValue: FixtureCapabilityValue;

    capabilityValue = this.getCapabilityValue(preset, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Red);
    if (capabilityValue) {
      colorRed = 255 * capabilityValue.valuePercentage;
    }
    capabilityValue = this.getCapabilityValue(preset, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Green);
    if (capabilityValue) {
      colorGreen = 255 * capabilityValue.valuePercentage;
    }
    capabilityValue = this.getCapabilityValue(preset, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Blue);
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

  selectPreset(index: number) {
    this.effectService.selectedEffect = undefined;
    this.selectedPreset = this.projectService.project.presets[index];
    this.projectService.project.selectedPresetUuid = this.projectService.project.presets[index].uuid;
    this.autoOpenFirstEffect();
    this.previewSelectionChanged.next();
    this.previewLive();
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
    this.selectPreset(highestSelectedPresetIndex);
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
          if (
            projectFixture.fixtureUuid === presetFixture.fixtureUuid &&
            ((!projectFixture.pixelKey && !presetFixture.pixelKey) || projectFixture.pixelKey === presetFixture.pixelKey)
          ) {
            const fixture = this.fixtureService.getCachedFixtureByUuid(presetFixture.fixtureUuid, presetFixture.pixelKey);
            if (fixture.profile.uuid === profile.uuid) {
              const exists = modeAndPixelKeys.some(
                (item) => (item.mode === fixture.mode && !item.pixelKey && !fixture.pixelKey) || item.pixelKey === fixture.pixelKey
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

  previewLive(compositionName: string = '', positionMillis?: number) {
    if (!this.configService.livePreview) {
      return;
    }

    // collect all changes and delay them to not flood the backend
    // (except play events. they need to be delivered always)
    if (this.livePreviewTimer && !compositionName) {
      this.liveChangePending = true;
      return;
    }

    let position = positionMillis;

    if (position === undefined) {
      position = Math.round(this.animationService.timeMillis);
    }

    this.http
      .post('preview?positionMillis=' + position + '&compositionName=' + compositionName, JSON.stringify(this.projectService.project))
      .subscribe();

    this.liveChangePending = false;

    if (!compositionName) {
      this.livePreviewTimer = setTimeout(() => {
        this.livePreviewTimer = undefined;
        if (this.liveChangePending) {
          this.http
            .post('preview?positionMillis=' + position + '&compositionName=' + compositionName, JSON.stringify(this.projectService.project))
            .subscribe();
        }
      }, 50);
    }
  }

  stopPreviewPlay() {
    if (!this.configService.livePreview) {
      return;
    }

    this.http.post('stop-preview-play', null).subscribe();
  }
}
