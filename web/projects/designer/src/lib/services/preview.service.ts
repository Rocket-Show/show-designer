import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import * as THREE from 'three';
import { CachedFixture } from '../models/cached-fixture';
import { EffectCurve } from '../models/effect-curve';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureChannelValue } from '../models/fixture-channel-value';
import { Preset } from '../models/preset';
import { getPresetTimes, getSceneTimes, PresetRegionScene } from '../models/preset-region-scene';
import { PresetStep } from '../models/preset-step';
import { PresetStepState } from '../models/preset-step-state';
import { applyTransitionCurve } from '../models/transition-curve';
import { isOverridingCapabilityType, isPositionedCapabilityType } from '../models/capability-position';
import { EffectPanTilt } from '../models/effect-pan-tilt';
import { EffectPixel } from '../models/effect-pixel';
import { CachedFixtureChannel } from '../models/cached-fixture-channel';
import { PixelPalette } from '../models/pixel-palette';
import { PixelContext, PixelPatternSettings, samplePixelPattern } from '../models/pixel-pattern';
import { toInt } from '../models/pixel-math';
import { pixelHousingSize, pixelStagePosition, stagePixelPlaces } from '../models/pixel-stage';
import { AudioFrames, PixelAudio } from '../models/pixel-audio';
import { demoAudioFrames } from '../models/pixel-audio-analysis';
import { getMaintenanceCapability, MaintenanceAction } from '../models/maintenance';
import {
  getAxisChannelValue,
  getAxisRange,
  getPresetPanTiltDegrees,
  getStagePlacements,
  isPanTilt,
  PanTiltContext,
  StagePlacement,
} from '../models/pan-tilt';
import { getFixtureCapabilityValues } from '../models/subtractive-color';
import { getIdentifyCapabilityValues } from '../models/identify';
import { FixtureService } from './fixture.service';
import { PresetService } from './preset.service';
import { PresetStepService } from './preset-step.service';
import { ProjectService } from './project.service';
import { SceneService } from './scene.service';
import { TimelineService } from './timeline.service';

// Colours for the 3d preview. These mirror the design tokens in
// lib/styles/_tokens.scss, which SCSS cannot hand to three.js.
export const PREVIEW_BACKGROUND_COLOR = 0x131519; // --sd-bg
export const PREVIEW_STAGE_COLOR = 0x0f1115;
export const PREVIEW_FIXTURE_COLOR = 0x0f1115;
export const PREVIEW_FIXTURE_EMISSIVE = 0x0d0e11;
export const PREVIEW_FIXTURE_SELECTED_COLOR = 0x7a3a05; // --sd-primary, darkened
export const PREVIEW_FIXTURE_SELECTED_EMISSIVE = 0xfd7e14; // --sd-primary

// remembers whether the lights of the 3d preview glow, across sessions
const PREVIEW_GLOW_STORAGE_KEY = 'previewGlow';

// the layer of the scene the lights which glow are on as well (the LEDs and the lenses), see PreviewComponent.render
export const PREVIEW_GLOW_LAYER = 1;

@Injectable({
  providedIn: 'root',
})
export class PreviewService implements OnDestroy {
  public doUpdateFixtureSetup: Subject<void> = new Subject();
  public doUpdateStageAndPositions: Subject<void> = new Subject();

  private updateStageAndPositionsSubscription: Subscription;
  public stageAndPositionsDirty: boolean = true;

  public scene: THREE.Scene;

  // what a frame knows while it is worked out: where the fixtures hang and the place of each part in the chase of each
  // preset
  private framePlacements = new Map<string, StagePlacement>();
  private frameFixtureIndices = new Map<Preset, Map<string, number>>();
  private frameTimeMillis = 0;

  // Where the fixtures hang, and what it was worked out from (see getPlacements): the size of the stage, where each
  // fixture is put and the order of the fixtures of the project
  private placements: Map<string, StagePlacement>;
  private placementInputs: any[] = [];

  // The places of the parts of a preset in a picture of the stage, for each view (for the pixel effects spread across
  // it): worked out again once the placements, the parts or the chase of the preset changed
  private stagePlaces = new WeakMap<
    Preset,
    {
      placements: Map<string, StagePlacement>;
      indices: Map<string, number>;
      parts: CachedFixture[];
      views: Map<string, Map<CachedFixture, PixelContext>>;
    }
  >();
  private frameAudio = new Map<EffectPixel, PixelAudio>();
  private frameSizedSettings = new Map<EffectPixel, PixelPatternSettings>();

  // The frames of the audio the pixel effects follow, if they are given (e.g. by a test). Otherwise the ones of the
  // composition while the timeline plays it, and a beat to show what they do while it doesn't.
  public audioFrames: AudioFrames;

  // the dimmer channel of each part of a fixture (see getDimmerChannel)
  private dimmerChannels = new WeakMap<CachedFixture, CachedFixtureChannel>();

  // Whether the lights glow in the 3d preview, the way they do in the dark (it costs a bit of performance). On unless
  // it was turned off.
  public glow = localStorage.getItem(PREVIEW_GLOW_STORAGE_KEY) !== 'false';

  // the glow left out while the designer is open, because the preview got too slow with it (see
  // PreviewComponent.watchGlow), until it is switched on again
  public glowSuspended = false;

  // switched on again after that: it stays on, however slow the preview is
  public glowKept = false;

  // do the lights glow right now?
  get glowing(): boolean {
    return this.glow && !this.glowSuspended;
  }

  private stageMeshes: THREE.Mesh[] = [];

  // a spot on the stage being picked with a click into the 3D preview (e.g. to aim the moving heads at), and the spot
  // picked, in cm
  public pickingSpot = false;
  public spotPicked = new Subject<number[]>();
  private stageMaterial: THREE.MeshStandardMaterial;
  fixtureMaterial: THREE.MeshStandardMaterial;
  fixtureSelectedMaterial: THREE.MeshLambertMaterial;

  public setGlow(glow: boolean) {
    this.glowKept = glow && this.glowSuspended;
    this.glowSuspended = false;
    this.glow = glow;
    localStorage.setItem(PREVIEW_GLOW_STORAGE_KEY, glow ? 'true' : 'false');
  }

  constructor(
    private presetService: PresetService,
    private presetStepService: PresetStepService,
    private fixtureService: FixtureService,
    private sceneService: SceneService,
    private timelineService: TimelineService,
    private projectService: ProjectService
  ) {
    this.stageMaterial = new THREE.MeshStandardMaterial({
      color: PREVIEW_STAGE_COLOR,
      // roughness: 0.5,
      // metalness: 0.5,
    });
    this.fixtureMaterial = new THREE.MeshLambertMaterial({
      color: PREVIEW_FIXTURE_COLOR,
      emissive: PREVIEW_FIXTURE_EMISSIVE,
    });
    this.fixtureSelectedMaterial = new THREE.MeshLambertMaterial({
      color: PREVIEW_FIXTURE_SELECTED_COLOR,
      emissive: PREVIEW_FIXTURE_SELECTED_EMISSIVE,
      emissiveIntensity: 0.000000000000000000001,
    });
    this.updateStageAndPositionsSubscription = this.doUpdateStageAndPositions.subscribe(() => {
      this.stageAndPositionsDirty = true;
    });
  }

  // For each of the passed fixtures, the first one before it with the same universe, DMX address and pixel (the same
  // lamp, which it takes the values of), or undefined. Looking each of them up among the ones before took longer than
  // a frame with a few thousand pixels.
  private getSameLamps(fixtures: CachedFixture[]): CachedFixture[] {
    const firstOfLamp = new Map<string, CachedFixture>();

    return fixtures.map((cachedFixture) => {
      const key =
        cachedFixture.fixture.dmxUniverseUuid + '|' + cachedFixture.fixture.dmxFirstChannel + '|' + (cachedFixture.pixel?.key || '');
      const first = firstOfLamp.get(key);

      if (!first) {
        firstOfLamp.set(key, cachedFixture);
      }

      return first;
    });
  }

  public getPresets(timeMillis: number): PresetRegionScene[] {
    // Get relevant presets in correct order to process with their corresponding scene, if available
    let presets: PresetRegionScene[] = [];

    if (this.timelineService.playState === 'playing') {
      // Only use active presets in current regions
      presets = this.timelineService.getPresetsInTime(timeMillis);
    } else {
      // previewPreset = solo. Without a selected scene there is nothing else to show
      // than the selected preset anyway.
      if (this.projectService.project.previewPreset || this.sceneService.selectedScenes.length === 0) {
        // Only preview the selected preset
        if (this.presetService.selectedPreset) {
          presets.push(new PresetRegionScene(this.presetService.selectedPreset, undefined, undefined));
        }
      } else {
        // Preview the selected scenes
        for (let sceneIndex = this.projectService.project.scenes.length - 1; sceneIndex >= 0; sceneIndex--) {
          const scene = this.projectService.project.scenes[sceneIndex];

          if (!this.sceneService.sceneIsSelected(scene)) {
            continue;
          }

          // the presets are ordered inside their scene: the first one is the topmost
          // layer -> process it last, so it overwrites the ones below it
          const scenePresets = this.sceneService.getScenePresets(scene);

          for (let presetIndex = scenePresets.length - 1; presetIndex >= 0; presetIndex--) {
            presets.push(new PresetRegionScene(scenePresets[presetIndex], undefined, scene));
          }
        }
      }
    }

    return presets;
  }

  private mixChannelValue(
    existingChannelValues: FixtureChannelValue[],
    channelValue: FixtureChannelValue,
    intensityPercentage: number,
    defaultValue: number = 0
  ) {
    let newValue: number = channelValue.value;
    let existingValue: number = defaultValue;

    if (intensityPercentage < 1) {
      // We need to mix a possibly existing value (or the default value 0) with the new value (fading)

      // Get the existent value for this property
      for (const existingChannelValue of existingChannelValues) {
        if (
          existingChannelValue.channelName === channelValue.channelName &&
          existingChannelValue.profileUuid === channelValue.profileUuid
        ) {
          existingValue = existingChannelValue.value;
          break;
        }
      }

      // Mix the existing value with the new value
      newValue = existingValue * (1 - intensityPercentage) + newValue * intensityPercentage;
    }

    // Remove the existent value, if available
    for (let i = 0; i < existingChannelValues.length; i++) {
      if (
        existingChannelValues[i].channelName === channelValue.channelName &&
        existingChannelValues[i].profileUuid === channelValue.profileUuid
      ) {
        existingChannelValues.splice(i, 1);
        break;
      }
    }

    // Add the new value
    const fixtureChannelValue = new FixtureChannelValue();
    fixtureChannelValue.channelName = channelValue.channelName;
    fixtureChannelValue.profileUuid = channelValue.profileUuid;
    fixtureChannelValue.value = newValue;
    existingChannelValues.push(fixtureChannelValue);
  }

  // where the preset itself starts, which is what its steps are timed against. The
  // fades may reach outside it, but a step at 0 belongs to the preset's own start.
  private getPresetStartMillis(preset: PresetRegionScene): number {
    if (!preset.region) {
      return 0;
    }

    return preset.preset.startMillis === undefined ? preset.region.startMillis : preset.region.startMillis + preset.preset.startMillis;
  }

  // the values a preset applies at the passed time. While nothing is playing, the
  // panels are editing one step of the selected preset, so that is the one to show:
  // the sequence only runs on the timeline, or when the designer asks to watch it.
  private getPresetStepState(preset: PresetRegionScene, timeMillis: number): PresetStepState {
    if (preset.region) {
      return this.presetStepService.getStateAtMillis(preset.preset, timeMillis - this.getPresetStartMillis(preset));
    }

    if (this.presetService.stepPreviewRunning) {
      // the sequence was started by hand, so it runs from the point it was started at
      return this.presetStepService.getStateAtMillis(preset.preset, timeMillis - this.presetService.stepPreviewStartMillis);
    }

    if (preset.preset.steps.length === 0) {
      // an old project keeps its values on the preset itself (until it is given its first step),
      // like on the timeline and in Rocket Show
      return this.presetStepService.getStateAtMillis(preset.preset, 0);
    }

    return this.presetStepService.getStepState(this.presetService.getEditStep(preset.preset));
  }

  private getPresetIntensity(preset: PresetRegionScene, timeMillis: number): number {
    // When fading is in progress (on preset or scene-level), the current preset does not
    // fully cover underlying values.
    // -> 0 = no covering at all, 1 = fully cover (no fading)
    let intensityPercentageScene = 1;
    let intensityPercentagePreset = 1;

    if (preset.scene) {
      // the dimmer holds the scene below full for as long as it plays, whether it sits
      // on the timeline or is only being watched in the preview
      intensityPercentageScene = preset.scene.dimmer;
    }

    if (preset.region && preset.scene) {
      // Fade out is stronger than fade in (if they overlap)

      // Take away intensity for scene fading
      const sceneTimes = getSceneTimes(preset.scene, preset.region);
      const sceneStartMillis = sceneTimes.startMillis;
      const sceneEndMillis = sceneTimes.endMillis;

      // the curve maps how far the fade has come to how much of the intensity it has
      // already handed over, which shapes a fade out just as well as a fade in
      if (timeMillis > sceneEndMillis - preset.scene.fadeOutMillis && timeMillis < sceneEndMillis) {
        // Scene fades out
        intensityPercentageScene *= applyTransitionCurve(
          preset.scene.fadeOutCurve,
          (sceneEndMillis - timeMillis) / preset.scene.fadeOutMillis
        );
      } else if (timeMillis < sceneStartMillis + preset.scene.fadeInMillis && timeMillis > sceneStartMillis) {
        // Scene fades in
        intensityPercentageScene *= applyTransitionCurve(
          preset.scene.fadeInCurve,
          (timeMillis - sceneStartMillis) / preset.scene.fadeInMillis
        );
      }
    }

    if (preset.region && preset.preset) {
      // Take away intensity for preset fading. Without times of its own, the preset plays
      // as long as the scene, its fades outside the clip included.
      const presetTimes = getPresetTimes(preset.preset, preset.region, preset.scene);
      const presetStartMillis = presetTimes.startMillis;
      const presetEndMillis = presetTimes.endMillis;

      if (timeMillis > presetEndMillis - preset.preset.fadeOutMillis && timeMillis < presetEndMillis) {
        // Preset fades out
        intensityPercentagePreset = applyTransitionCurve(
          preset.preset.fadeOutCurve,
          (presetEndMillis - timeMillis) / preset.preset.fadeOutMillis
        );
      } else if (timeMillis < presetStartMillis + preset.preset.fadeInMillis && timeMillis > presetStartMillis) {
        // Preset fades in
        intensityPercentagePreset = applyTransitionCurve(
          preset.preset.fadeInCurve,
          (timeMillis - presetStartMillis) / preset.preset.fadeInMillis
        );
      }
    }

    return intensityPercentageScene * intensityPercentagePreset;
  }

  private getChannelValue(values: FixtureChannelValue[], channelName: string, profileUuid: string): FixtureChannelValue {
    return values.find((value) => value.channelName === channelName && value.profileUuid === profileUuid);
  }

  // how bright the dimmer of a fixture (its own or its virtual one) lights with the passed
  // values, or undefined for a fixture without one (e.g. a pixel of a bar with a master dimmer)
  private getDimmerBrightness(cachedFixture: CachedFixture, values: FixtureChannelValue[]): number {
    const channel = this.getDimmerChannel(cachedFixture);

    if (!channel) {
      return undefined;
    }

    const value = this.getChannelValue(values, channel.name, cachedFixture.profile.uuid);
    return value ? this.fixtureService.getDimmerBrightnessOfValue(channel, value.value) : 0;
  }

  // the first channel of a part of a fixture with a dimmer on it, none without: looked for once for each part (the
  // parts are made anew when the fixtures change)
  private getDimmerChannel(cachedFixture: CachedFixture): CachedFixtureChannel {
    if (!this.dimmerChannels.has(cachedFixture)) {
      this.dimmerChannels.set(
        cachedFixture,
        cachedFixture.channels.find((channel) =>
          channel.capabilities.some((capability) => capability.capability.type === FixtureCapabilityType.Intensity)
        )
      );
    }

    return this.dimmerChannels.get(cachedFixture);
  }

  // how bright a preset lets the dimmer of a fixture light: the dimmer it sets (a curve on the
  // dimmer counts as lighting it), or the one below, if the preset leaves the dimmer alone
  private getPresetDimmerBrightness(state: PresetStepState, cachedFixture: CachedFixture, preset: Preset, brightnessBelow: number): number {
    let brightness: number;

    for (const capabilityValue of state.fixtureCapabilityValues) {
      if (
        capabilityValue.type === FixtureCapabilityType.Intensity &&
        capabilityValue.valuePercentage >= 0 &&
        (!capabilityValue.profileUuid || capabilityValue.profileUuid === cachedFixture.profile.uuid)
      ) {
        // a later value overwrites an earlier one, like when they are mixed
        brightness = capabilityValue.valuePercentage;
      }
    }

    if (brightness !== undefined) {
      return brightness;
    }

    for (const effect of preset.effects) {
      if (
        effect instanceof EffectCurve &&
        effect.visible &&
        state.getEffectAmount(effect.uuid) > 0 &&
        effect.capabilities.some((capability) => capability.type === FixtureCapabilityType.Intensity)
      ) {
        return 1;
      }
    }

    return brightnessBelow;
  }

  // A color of a fading preset on a fixture with a dimmer (its own or a virtual one) doesn't fade
  // on its own: the dimmer carries the fade, or the fixture would get darker twice. The color
  // blends with the one below instead, each of them weighted by how bright it lights, so the
  // light is always the blend of the light below and the light of the preset. A color coming up
  // on a dark fixture is there at once while the dimmer fades it in, and one going dark keeps its
  // color. A fixture without a dimmer fades its colors, they are all there is to fade.
  // This follows the same rules as mixColorValue() in Rocket Show.
  private mixColorValue(
    values: FixtureChannelValue[],
    channelValue: FixtureChannelValue,
    intensityPercentage: number,
    brightnessBelow: number,
    presetBrightness: number
  ) {
    const weightBelow = brightnessBelow === undefined ? 0 : (1 - intensityPercentage) * brightnessBelow;
    const weight = intensityPercentage * presetBrightness;

    if (brightnessBelow === undefined || weightBelow + weight <= 0) {
      this.mixChannelValue(values, channelValue, intensityPercentage, 0);
      return;
    }

    if (weightBelow === 0) {
      // nothing to blend with (e.g. the preset doesn't fade)
      this.mixChannelValue(values, channelValue, 1);
      return;
    }

    const below = this.getChannelValue(values, channelValue.channelName, channelValue.profileUuid);
    const valueBelow = below ? below.value : 0;

    const blendedValue = new FixtureChannelValue();
    blendedValue.channelName = channelValue.channelName;
    blendedValue.profileUuid = channelValue.profileUuid;
    blendedValue.value = (valueBelow * weightBelow + channelValue.value * weight) / (weightBelow + weight);
    this.mixChannelValue(values, blendedValue, 1);
  }

  private mixCapabilityValues(
    state: PresetStepState,
    cachedFixture: CachedFixture,
    values: FixtureChannelValue[],
    intensityPercentage: number,
    preset: Preset,
    context: PanTiltContext
  ) {
    let hasColor = false;

    // how bright the fixture lights below this preset and how bright the preset lights it, to
    // blend the colors while the preset fades (see mixColorValue)
    const brightnessBelow = this.getDimmerBrightness(cachedFixture, values);
    const presetBrightness =
      brightnessBelow === undefined ? 0 : this.getPresetDimmerBrightness(state, cachedFixture, preset, brightnessBelow);

    // a fixture mixing its colors with filters is given the colors the other way round (see subtractive-color)
    const capabilityValues = getFixtureCapabilityValues(state.fixtureCapabilityValues, cachedFixture.channels);

    // mix the capability values of the state the preset is in
    for (const presetCapabilityValue of capabilityValues) {
      for (const cachedChannel of cachedFixture.channels) {
        if (cachedChannel.channel) {
          if (isOverridingCapabilityType(presetCapabilityValue.type)) {
            // played over the rest below
            continue;
          }

          if (isPanTilt(presetCapabilityValue.type)) {
            // a position of a moving head is played on the channel as a whole, by where the fixture is placed in its
            // preset and on the stage (see pan-tilt)
            const value = this.presetService.getPanTiltChannelValue(
              presetCapabilityValue,
              cachedChannel,
              cachedFixture.profile.uuid,
              preset,
              context
            );

            if (value !== undefined) {
              this.mixFixtureChannelValue(values, cachedFixture, cachedChannel.name, value);
            }

            continue;
          }

          if (isPositionedCapabilityType(presetCapabilityValue.type)) {
            // a position is played on the channel as a whole, by the capability of it doing it
            const value = this.presetService.getPositionedChannelValue(presetCapabilityValue, cachedChannel, cachedFixture.profile.uuid);

            if (value !== undefined) {
              const fixtureChannelValue = new FixtureChannelValue();
              fixtureChannelValue.channelName = cachedChannel.name;
              fixtureChannelValue.profileUuid = cachedFixture.profile.uuid;
              fixtureChannelValue.value = value;
              this.mixChannelValue(values, fixtureChannelValue, 1);
            }

            continue;
          }

          for (const channelCapability of cachedChannel.capabilities) {
            if (
              this.fixtureService.capabilitiesMatch(
                presetCapabilityValue.type,
                channelCapability.capability.type,
                presetCapabilityValue.color,
                channelCapability.capability.color,
                presetCapabilityValue.wheel,
                channelCapability.wheelName,
                presetCapabilityValue.profileUuid,
                cachedFixture.profile.uuid
              )
            ) {
              // the capabilities match -> apply the value, if possible
              const value = this.presetService.getCapabilityChannelValue(presetCapabilityValue, cachedChannel, channelCapability, preset);

              if (value !== undefined) {
                const fixtureChannelValue = new FixtureChannelValue();
                fixtureChannelValue.channelName = cachedChannel.name;
                fixtureChannelValue.profileUuid = cachedFixture.profile.uuid;
                fixtureChannelValue.value = value;

                if (presetCapabilityValue.type === FixtureCapabilityType.ColorIntensity) {
                  this.mixColorValue(values, fixtureChannelValue, intensityPercentage, brightnessBelow, presetBrightness);
                  hasColor = true;
                } else if (presetCapabilityValue.type === FixtureCapabilityType.Intensity) {
                  // the dimmer fades with the preset
                  this.mixChannelValue(values, fixtureChannelValue, intensityPercentage, 0);
                } else {
                  this.mixChannelValue(values, fixtureChannelValue, 1);

                  // check, whether we just set a color wheel value
                  if (presetCapabilityValue.type === FixtureCapabilityType.WheelSlot && channelCapability.wheelIsColor) {
                    hasColor = true;
                  }
                }
              }
            }
          }
        }
      }
    }

    // The pulse of an iris or a frost and the shake of a gobo play over what the rest puts on the same channel,
    // whatever order they come in
    for (const presetCapabilityValue of capabilityValues) {
      if (isOverridingCapabilityType(presetCapabilityValue.type)) {
        for (const cachedChannel of cachedFixture.channels) {
          if (cachedChannel.channel) {
            const value = this.presetService.getPositionedChannelValue(presetCapabilityValue, cachedChannel, cachedFixture.profile.uuid);

            if (value !== undefined) {
              this.mixFixtureChannelValue(values, cachedFixture, cachedChannel.name, value);
            }
          }
        }
      }
    }

    // A fixture which lights no color of its own (with its color channels or a slot of its color wheel) shows the
    // color on its color wheel, approximated from the colors set or from a slot of a different wheel. Only once all
    // the values are mixed, so that the order they come in doesn't decide whether the wheel turns as well.
    if (hasColor) {
      return;
    }

    for (const cachedChannel of cachedFixture.channels) {
      if (cachedChannel.colorWheel) {
        const capability = this.presetService.getApproximatedColorWheelCapability(state.fixtureCapabilityValues, cachedChannel);

        if (capability) {
          // we found an approximated color in the available wheel channel
          const fixtureChannelValue = new FixtureChannelValue();
          fixtureChannelValue.channelName = cachedChannel.name;
          fixtureChannelValue.profileUuid = cachedFixture.profile.uuid;
          fixtureChannelValue.value = capability.centerValue;
          this.mixChannelValue(values, fixtureChannelValue, 1);
        }
      }
    }

    // A fixture without a color wheel either shows the color on its color presets (e.g. the color macros of a par
    // lighting in nothing but them), approximated the same way. This follows the same rules as Rocket Show.
    if (cachedFixture.channels.some((cachedChannel) => cachedChannel.colorWheel)) {
      return;
    }

    for (const cachedChannel of cachedFixture.channels) {
      if (cachedChannel.channel) {
        const capability = this.presetService.getApproximatedColorPresetCapability(state.fixtureCapabilityValues, cachedChannel);

        if (capability) {
          const fixtureChannelValue = new FixtureChannelValue();
          fixtureChannelValue.channelName = cachedChannel.name;
          fixtureChannelValue.profileUuid = cachedFixture.profile.uuid;
          fixtureChannelValue.value = capability.centerValue;
          this.mixChannelValue(values, fixtureChannelValue, 1);
        }
      }
    }
  }

  // put a value on a channel of the fixture, over what is on it
  private mixFixtureChannelValue(values: FixtureChannelValue[], cachedFixture: CachedFixture, channelName: string, value: number) {
    const fixtureChannelValue = new FixtureChannelValue();
    fixtureChannelValue.channelName = channelName;
    fixtureChannelValue.profileUuid = cachedFixture.profile.uuid;
    fixtureChannelValue.value = value;
    this.mixChannelValue(values, fixtureChannelValue, 1);
  }

  private mixChannelValues(
    state: PresetStepState,
    cachedFixture: CachedFixture,
    values: FixtureChannelValue[],
    intensityPercentage: number
  ) {
    // mix the channel values of the state the preset is in
    for (const cachedChannel of cachedFixture.channels) {
      if (cachedChannel.channel) {
        for (const channelValue of state.fixtureChannelValues) {
          if (cachedFixture.profile.uuid === channelValue.profileUuid && cachedChannel.name === channelValue.channelName) {
            this.mixChannelValue(values, channelValue, intensityPercentage);
          }
        }
      }
    }
  }

  // the tempo the curves synced to the beat follow. a preset can be edited without a
  // composition being open, which leaves the curves on their default tempo.
  private getBeatsPerMinute(): number {
    return this.timelineService.selectedComposition?.beatsPerMinute ?? EffectCurve.defaultBeatsPerMinute;
  }

  // a preset that is not placed in a composition has no moment it starts at: the preview
  // clock has been running since the designer was opened, so a curve that stops after a
  // while would always be over already. repeat its run instead, the way the grid of the
  // effect shows it.
  private getCurveTimeMillis(
    curve: EffectCurve,
    effectTimeMillis: number,
    preset: PresetRegionScene,
    fixtureCount: number,
    beatsPerMinute: number
  ): number {
    if (preset.region) {
      return effectTimeMillis;
    }

    const loopMillis = curve.getRunLoopMillis(fixtureCount, beatsPerMinute);

    if (loopMillis === undefined) {
      return effectTimeMillis;
    }

    return ((effectTimeMillis % loopMillis) + loopMillis) % loopMillis;
  }

  private mixEffects(
    timeMillis: number,
    fixtureIndex: number,
    fixtureCount: number,
    preset: PresetRegionScene,
    cachedFixture: CachedFixture,
    values: FixtureChannelValue[],
    intensityPercentage: number,
    state: PresetStepState,
    context: PanTiltContext,
    wholeFixtureIndex: number,
    wholeFixtureCount: number
  ) {
    let effectTimeMillis = timeMillis;

    if (preset.region) {
      effectTimeMillis = timeMillis - preset.region.startMillis;
    }

    for (const effect of preset.preset.effects) {
      // the effect keeps running through the steps, they only open or close it
      const effectAmount = state.getEffectAmount(effect.uuid);
      const effectIntensityPercentage = intensityPercentage * effectAmount;

      if (effect.visible && effectAmount > 0) {
        if (effect instanceof EffectPanTilt) {
          this.mixPanTiltEffect(effect, effectTimeMillis, preset, cachedFixture, values, effectIntensityPercentage, state, context);
          continue;
        }

        // a pixel effect chases from one fixture to the next, with all of their pixels
        if (effect instanceof EffectPixel) {
          this.mixPixelEffect(
            effect,
            effectTimeMillis,
            preset,
            cachedFixture,
            values,
            effectIntensityPercentage,
            wholeFixtureIndex,
            wholeFixtureCount
          );
          continue;
        }

        // EffectCurve
        if (effect instanceof EffectCurve) {
          const effectCurve = effect as EffectCurve;
          const beatsPerMinute = this.getBeatsPerMinute();
          const curveTimeMillis = this.getCurveTimeMillis(effectCurve, effectTimeMillis, preset, fixtureCount, beatsPerMinute);

          // capabilities
          for (const capability of effectCurve.capabilities) {
            for (const cachedChannel of cachedFixture.channels) {
              for (const channelCapability of cachedChannel.capabilities) {
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
                  let value = effectCurve.getValueAtMillis(curveTimeMillis, fixtureIndex, fixtureCount, beatsPerMinute);

                  // the curve does not apply anymore after it has finished running
                  if (value !== undefined) {
                    // a preset which mirrors this axis mirrors the movement of its curves as well
                    value = preset.preset.getMirroredValuePercentage(capability.type, value);

                    const fixtureChannelValue = new FixtureChannelValue();
                    fixtureChannelValue.channelName = cachedChannel.name;
                    fixtureChannelValue.profileUuid = cachedFixture.profile.uuid;
                    fixtureChannelValue.value = cachedChannel.maxValue * value;
                    this.mixChannelValue(values, fixtureChannelValue, effectIntensityPercentage);
                  }
                }
              }
            }
          }

          // channels
          for (const channelProfile of effectCurve.channels) {
            if (channelProfile.profileUuid === cachedFixture.profile.uuid) {
              for (const channel of channelProfile.channels) {
                for (const cachedChannel of cachedFixture.channels) {
                  if (cachedChannel.name === channel) {
                    const value = effectCurve.getValueAtMillis(curveTimeMillis, fixtureIndex, fixtureCount, beatsPerMinute);

                    // the curve does not apply anymore after it has finished running
                    if (value !== undefined) {
                      const fixtureChannelValue = new FixtureChannelValue();
                      fixtureChannelValue.channelName = cachedChannel.name;
                      fixtureChannelValue.profileUuid = cachedFixture.profile.uuid;
                      fixtureChannelValue.value = cachedChannel.maxValue * value;
                      this.mixChannelValue(values, fixtureChannelValue, effectIntensityPercentage);
                    }
                  }
                }
              }

              break;
            }
          }
        }
      }
    }
  }

  // A pixel effect on a part of a fixture (a pixel, or a fixture without pixels): the color of its pattern where the part
  // is in its fixture, blended with the color the preset puts on it, on its red, green and blue. Its other channels keep
  // what the preset puts on them, its dimmer as well. This follows the same rules as Rocket Show.
  private mixPixelEffect(
    effect: EffectPixel,
    effectTimeMillis: number,
    preset: PresetRegionScene,
    cachedFixture: CachedFixture,
    values: FixtureChannelValue[],
    effectIntensityPercentage: number,
    fixtureIndex: number,
    fixtureCount: number
  ) {
    const channels = [FixtureCapabilityColor.Red, FixtureCapabilityColor.Green, FixtureCapabilityColor.Blue].map((color) =>
      this.getColorChannel(cachedFixture, color)
    );

    if (channels.every((channel) => !channel)) {
      return;
    }

    const beatsPerMinute = this.getBeatsPerMinute();
    const curveTimeMillis = this.getCurveTimeMillis(effect, effectTimeMillis, preset, fixtureCount, beatsPerMinute);
    const cycles = effect.getCyclesAtMillis(curveTimeMillis, fixtureIndex, fixtureCount, beatsPerMinute);

    // the effect does not apply anymore after it has finished running
    if (cycles === undefined) {
      return;
    }

    // the color the preset puts on the part, as red, green and blue between 0 and 1
    const base = channels.map((channel) => {
      const value = channel ? this.getChannelValue(values, channel.name, cachedFixture.profile.uuid) : undefined;
      return value ? value.value / channel.maxValue : 0;
    });

    // Where the part is in its fixture, every fixture starting the random looking patterns somewhere else. Spread
    // across the stage, where it is in the picture of the stage, which is one for all of them.
    const stage = effect.spread === 'stage';
    const context = Object.assign(
      new PixelContext(),
      stage ? this.getStagePixelPlace(preset.preset, effect.view, cachedFixture) : this.fixtureService.getPixelPlace(cachedFixture)
    );
    context.seed = toInt(effect.seed * 7919 + (stage ? 0 : fixtureIndex * 131));

    if (effect.mirror) {
      context.x = context.x < 0.5 ? context.x * 2 : (1 - context.x) * 2;
    }

    // The audio it follows: shown by the level meter and the wave of the audio, followed with its brightness or its size
    // by the other patterns
    const audio = this.getPixelAudio(effect);
    const showsAudio = effect.pattern === 'meter' || effect.pattern === 'scope';
    const audioLevel = audio && !showsAudio ? audio.level() : 1;
    const settings = audio && !showsAudio && effect.audioFollows === 'size' ? this.getSizedSettings(effect, audioLevel) : effect;

    // the color of the pixel through the palette, or the own one of an image
    const sample = samplePixelPattern(settings, cycles, context, audio);
    const level = sample[1] * (effect.audioFollows === 'size' ? 1 : audioLevel);
    const palette = effect.palette;
    const stops = palette.ref === 'preset' ? PixelPalette.shadesOf(base) : palette.stops;
    const color =
      sample.length > 2
        ? sample.slice(2, 5)
        : PixelPalette.colorOf(stops, palette.between, palette.repeat, sample[0], palette.ref !== 'preset');
    const lit = color.map((component) => component * level);

    // the white part of the light on the white LED, if it is to light it
    const white = effect.whiteLed ? this.getColorChannel(cachedFixture, FixtureCapabilityColor.White) : undefined;
    let litWhite = 0;

    if (white) {
      litWhite = Math.min(Math.min(lit[0], lit[1]), lit[2]);

      for (let i = 0; i < 3; i++) {
        lit[i] = lit[i] - litWhite;
      }
    }

    channels.forEach((channel, i) => {
      if (channel) {
        this.mixPixelValue(effect, cachedFixture, channel, base[i], lit[i], level, values, effectIntensityPercentage);
      }
    });

    if (white) {
      const value = this.getChannelValue(values, white.name, cachedFixture.profile.uuid);
      const baseWhite = value ? value.value / white.maxValue : 0;

      this.mixPixelValue(effect, cachedFixture, white, baseWhite, litWhite, level, values, effectIntensityPercentage);
    }
  }

  // A color of a pixel the effect lights, blended with the one the preset puts on it (base, between 0 and 1): the light
  // of the pattern (lit) in place of it, the base as bright as the pattern makes it (mask), the light added to it or the
  // brighter of both
  private mixPixelValue(
    effect: EffectPixel,
    cachedFixture: CachedFixture,
    channel: CachedFixtureChannel,
    base: number,
    lit: number,
    level: number,
    values: FixtureChannelValue[],
    effectIntensityPercentage: number
  ) {
    let target: number;

    switch (effect.blend) {
      case 'mask':
        target = base * level;
        break;
      case 'add':
        target = Math.min(base + lit, 1);
        break;
      case 'max':
        target = Math.max(base, lit);
        break;
      default:
        target = lit;
    }

    const fixtureChannelValue = new FixtureChannelValue();
    fixtureChannelValue.channelName = channel.name;
    fixtureChannelValue.profileUuid = cachedFixture.profile.uuid;
    fixtureChannelValue.value = channel.maxValue * target;
    this.mixChannelValue(values, fixtureChannelValue, effectIntensityPercentage);
  }

  // the audio a pixel effect follows at the moment of the frame, none for one which follows none
  private getPixelAudio(effect: EffectPixel): PixelAudio {
    if (effect.audioSource !== 'composition') {
      return undefined;
    }

    let audio = this.frameAudio.get(effect);

    if (!audio) {
      audio = new PixelAudio(this.getAudioFrames(effect), this.frameTimeMillis, effect);
      this.frameAudio.set(effect, audio);
    }

    return audio;
  }

  // the settings of a pixel effect with its size following the audio, once in a frame
  private getSizedSettings(effect: EffectPixel, audioLevel: number): PixelPatternSettings {
    let settings = this.frameSizedSettings.get(effect);

    if (!settings) {
      settings = { ...effect, size: effect.size * audioLevel };
      this.frameSizedSettings.set(effect, settings);
    }

    return settings;
  }

  // the audio of the buses the effect follows while the composition plays, a beat otherwise
  private getAudioFrames(effect: EffectPixel): AudioFrames {
    if (this.audioFrames) {
      return this.audioFrames;
    }

    const frames = this.timelineService.playState === 'playing' ? this.timelineService.audioFramesFor(effect.audioBuses) : undefined;

    return frames || demoAudioFrames;
  }

  // Where a part of a fixture is in the picture of the stage the parts of a preset make up (the ones lighting in
  // colors, see pixel-stage), seen from the front or from above. Worked out once in a frame for each preset and view.
  private getStagePixelPlace(preset: Preset, view: string, cachedFixture: CachedFixture): PixelContext {
    const indices = this.frameFixtureIndices.get(preset);
    let entry = this.stagePlaces.get(preset);

    if (
      !entry ||
      entry.placements !== this.framePlacements ||
      entry.indices !== indices ||
      entry.parts !== this.fixtureService.cachedFixtures
    ) {
      entry = { placements: this.framePlacements, indices, parts: this.fixtureService.cachedFixtures, views: new Map() };
      this.stagePlaces.set(preset, entry);
    }

    const views = entry.views;
    let places = views.get(view);

    if (!places) {
      places = new Map();
      const parts = this.fixtureService.cachedFixtures.filter(
        (part) =>
          indices?.get(this.presetService.getPresetFixtureKey(part.fixture.uuid, part.pixel?.key)) >= 0 &&
          [FixtureCapabilityColor.Red, FixtureCapabilityColor.Green, FixtureCapabilityColor.Blue].some((color) =>
            this.getColorChannel(part, color)
          )
      );
      const positions = parts.map((part) => {
        const partPlace = this.fixtureService.getPixelPlace(part);
        const placement = this.framePlacements.get(part.fixture.uuid) || { position: [0, 0, 0], rotation: [0, 0, 0] };

        return pixelStagePosition(
          partPlace,
          pixelHousingSize(part.profile, partPlace.columns, partPlace.rows),
          placement,
          part.fixture.positioning
        );
      });
      const contexts = stagePixelPlaces(positions, view);

      parts.forEach((part, i) => places.set(part, contexts[i]));
      views.set(view, places);
    }

    return places.get(cachedFixture) || this.fixtureService.getPixelPlace(cachedFixture);
  }

  // Where the fixtures hang (see getStagePlacements), worked out again only once what it depends on changed: the size
  // of the stage, where each fixture is put and the order of the fixtures of the project
  private getPlacements(): Map<string, StagePlacement> {
    const project = this.projectService.project;
    const inputs: any[] = [
      project.stageWidthCm,
      project.stageHeightCm,
      project.stageDepthCm,
      project.stageFloorHeightCm,
      project.fixtures.length,
    ];

    for (const fixture of project.fixtures) {
      inputs.push(
        fixture,
        fixture.positioning,
        fixture.positionX,
        fixture.positionY,
        fixture.positionZ,
        fixture.rotationX,
        fixture.rotationY,
        fixture.rotationZ
      );
    }

    for (const presetFixture of project.presetFixtures) {
      inputs.push(presetFixture.fixtureUuid);
    }

    const previous = this.placementInputs;

    if (!this.placements || inputs.length !== previous.length || inputs.some((input, i) => input !== previous[i])) {
      this.placementInputs = inputs;
      this.placements = getStagePlacements(project);
    }

    return this.placements;
  }

  // the channel of a part of a fixture which lights in a color, the first one if there are several
  private getColorChannel(cachedFixture: CachedFixture, color: FixtureCapabilityColor): CachedFixtureChannel {
    return cachedFixture.channels.find((channel) =>
      channel.capabilities.some(
        (channelCapability) =>
          channelCapability.capability.type === FixtureCapabilityType.ColorIntensity && channelCapability.capability.color === color
      )
    );
  }

  // A movement of the moving heads, around where the preset points each of them (or around the middle, if it doesn't),
  // mirrored with the preset. This follows the same rules as Rocket Show.
  private mixPanTiltEffect(
    effect: EffectPanTilt,
    effectTimeMillis: number,
    preset: PresetRegionScene,
    cachedFixture: CachedFixture,
    values: FixtureChannelValue[],
    effectIntensityPercentage: number,
    state: PresetStepState,
    context: PanTiltContext
  ) {
    const beatsPerMinute = this.getBeatsPerMinute();
    const curveTimeMillis = this.getCurveTimeMillis(effect, effectTimeMillis, preset, context.fixtureCount, beatsPerMinute);
    const offset = effect.getOffsetAtMillis(curveTimeMillis, context.fixtureIndex, context.fixtureCount, beatsPerMinute);

    // the movement does not apply anymore after it has finished running
    if (!offset) {
      return;
    }

    for (const cachedChannel of cachedFixture.channels) {
      if (!cachedChannel.channel) {
        continue;
      }

      for (const type of [FixtureCapabilityType.Pan, FixtureCapabilityType.Tilt]) {
        const range = getAxisRange(cachedChannel, type);

        if (range === undefined) {
          continue;
        }

        const mirror = preset.preset.mirrorsCapability(type);
        const center =
          getPresetPanTiltDegrees(state.fixtureCapabilityValues, type, cachedFixture.profile.uuid, range, mirror, context) ?? 0;
        const move = type === FixtureCapabilityType.Pan ? offset.pan : offset.tilt;

        const fixtureChannelValue = new FixtureChannelValue();
        fixtureChannelValue.channelName = cachedChannel.name;
        fixtureChannelValue.profileUuid = cachedFixture.profile.uuid;
        fixtureChannelValue.value = getAxisChannelValue(cachedChannel, range, center + (mirror ? -move : move));
        this.mixChannelValue(values, fixtureChannelValue, effectIntensityPercentage);
      }
    }
  }

  // return all fixture uuids with their corresponding channel values
  public getChannelValues(timeMillis: number, presets: PresetRegionScene[]): Map<CachedFixture, FixtureChannelValue[]> {
    // Loop over all relevant presets and calc the property values from the presets (capabilities, channels and effects)
    const calculatedFixtures = new Map<CachedFixture, FixtureChannelValue[]>();

    // the number of chase steps per preset (needed by the effects to spread themselves
    // over all fixtures of their preset)
    const fixtureCounts = new Map<Preset, number>();

    // the place of each fixture in the chase of each preset, worked out once per frame and
    // preset: looking it up for each fixture took most of the time of a frame with a few
    // dozen fixtures
    const fixtureIndices = new Map<Preset, Map<string, number>>();

    // the same for the fixtures with all of their pixels, which the pixel effects chase over
    const wholeFixtureChases = new Map<Preset, { indices: Map<string, number>; count: number }>();

    // which state each preset is in. The same preset can play in more than one region
    // at a time, each of them at a different point of its sequence, so the entry of the
    // playing preset is what this is keyed by.
    const presetStates = new Map<PresetRegionScene, PresetStepState>();

    // which step the preset being edited is on and how far into it, for its list to
    // mark and fill while it runs
    let activeStep: PresetStep;
    let activeStepProgress = 0;

    for (const preset of presets) {
      if (!fixtureCounts.has(preset.preset)) {
        fixtureCounts.set(preset.preset, this.presetService.getPresetFixtureCount(preset.preset));
        fixtureIndices.set(preset.preset, this.presetService.getPresetFixtureIndices(preset.preset));
        wholeFixtureChases.set(preset.preset, this.presetService.getPresetWholeFixtureChase(preset.preset));
      }

      // a preset chasing its steps over its fixtures is at a different point of the
      // sequence for each of them, so its state is worked out per fixture below
      if (!this.presetStepService.stepsArePhased(preset.preset)) {
        presetStates.set(preset, this.getPresetStepState(preset, timeMillis));
      }

      if (preset.preset === this.presetService.selectedPreset && (preset.region || this.presetService.stepPreviewRunning)) {
        const state = presetStates.get(preset) || this.getPresetStepState(preset, timeMillis);
        activeStep = state.currentStep;
        activeStepProgress = state.currentStepProgress;
      }
    }

    this.presetService.activeStep = activeStep;
    this.presetService.activeStepProgress = activeStepProgress;

    const identifyFixtureUuids = this.projectService.project.identifyFixtureUuids || [];
    const maintenance: { action: MaintenanceAction; fixtureUuids: string[] }[] = [
      { action: 'reset', fixtureUuids: this.projectService.project.resetFixtureUuids || [] },
      { action: 'lamp-on', fixtureUuids: this.projectService.project.lampOnFixtureUuids || [] },
    ];

    // where the fixtures hang, to aim the moving heads at a spot (and to spread the pixel effects across the stage)
    const placements = this.getPlacements();
    this.framePlacements = placements;
    this.frameFixtureIndices = fixtureIndices;
    this.frameTimeMillis = timeMillis;
    this.frameAudio = new Map();
    this.frameSizedSettings = new Map();
    const sameLamps = this.getSameLamps(this.fixtureService.cachedFixtures);

    for (let i = 0; i < this.fixtureService.cachedFixtures.length; i++) {
      const cachedFixture = this.fixtureService.cachedFixtures[i];

      // all values of the current fixture channels
      let values: FixtureChannelValue[] = [];

      const alreadyCalculatedFixture = sameLamps[i];

      if (alreadyCalculatedFixture) {
        // only relevant for the preview --> reuse all calculated values
        values = Object.assign([], calculatedFixtures.get(alreadyCalculatedFixture));
      } else {
        // apply the default values
        for (const cachedChannel of cachedFixture.channels) {
          if (cachedChannel.channel) {
            if (cachedChannel.defaultValue !== undefined) {
              const fixtureChannelValue = new FixtureChannelValue();
              fixtureChannelValue.channelName = cachedChannel.name;
              fixtureChannelValue.profileUuid = cachedFixture.profile.uuid;
              fixtureChannelValue.value = cachedChannel.defaultValue;
              this.mixChannelValue(values, fixtureChannelValue, 1);
            }
          }
        }

        for (const preset of presets) {
          // search for this fixture in the preset and get it's preset-specific index (for chasing effects)
          const fixtureIndex = fixtureIndices
            .get(preset.preset)
            .get(this.presetService.getPresetFixtureKey(cachedFixture.fixture.uuid, cachedFixture.pixel?.key));

          if (fixtureIndex >= 0) {
            // this fixture is also in the preset -> mix the required values (overwrite existing values,
            // if set multiple times)
            const intensityPercentage = this.getPresetIntensity(preset, timeMillis);
            const state =
              presetStates.get(preset) ||
              this.getPresetStepState(
                preset,
                timeMillis - this.presetStepService.getStepsPhasingMillis(preset.preset, fixtureIndex, fixtureCounts.get(preset.preset))
              );

            const context: PanTiltContext = {
              fixtureIndex,
              fixtureCount: fixtureCounts.get(preset.preset),
              placement: placements.get(cachedFixture.fixture.uuid),
            };

            this.mixCapabilityValues(state, cachedFixture, values, intensityPercentage, preset.preset, context);
            this.mixChannelValues(state, cachedFixture, values, intensityPercentage);
            const wholeFixtureChase = wholeFixtureChases.get(preset.preset);

            this.mixEffects(
              timeMillis,
              fixtureIndex,
              fixtureCounts.get(preset.preset),
              preset,
              cachedFixture,
              values,
              intensityPercentage,
              state,
              context,
              wholeFixtureChase.indices.get(cachedFixture.fixture.uuid) ?? 0,
              wholeFixtureChase.count
            );
          }
        }
      }

      // a fixture being identified from the fixture pool blinks, whatever the presets light it with
      if (identifyFixtureUuids.indexOf(cachedFixture.fixture.uuid) >= 0) {
        values = this.getIdentifyValues(cachedFixture, values, timeMillis);
      }

      // a fixture asked to reset itself or to switch its lamp on does it, whatever the presets do with it
      for (const entry of maintenance) {
        if (entry.fixtureUuids.indexOf(cachedFixture.fixture.uuid) >= 0) {
          const found = getMaintenanceCapability(cachedFixture.channels, entry.action);

          if (found && found.capability.centerValue !== undefined) {
            values = values.slice();
            this.mixFixtureChannelValue(values, cachedFixture, found.channel.name, found.capability.centerValue);
          }
        }
      }

      // Store the calculated values for subsequent fixtures on the same DMX address
      calculatedFixtures.set(cachedFixture, values);
    }

    return calculatedFixtures;
  }

  // the values of a fixture being identified: the ones the presets give it, with what identifies it on top (see
  // identify). It keeps everything else, e.g. where it points to.
  private getIdentifyValues(cachedFixture: CachedFixture, presetValues: FixtureChannelValue[], timeMillis: number): FixtureChannelValue[] {
    const values = presetValues.slice();
    const state = new PresetStepState();
    state.fixtureCapabilityValues = getIdentifyCapabilityValues(cachedFixture, timeMillis);
    this.mixCapabilityValues(state, cachedFixture, values, 1, new Preset(), { fixtureIndex: 0, fixtureCount: 1 });

    return values;
  }

  public fixtureIsSelected(uuid: string, pixelKey: string, presets: PresetRegionScene[]): boolean {
    for (const preset of presets) {
      if (this.presetService.getPresetFixture(preset.preset, uuid, pixelKey)) {
        return true;
      }
    }

    return false;
  }

  // the spot on the stage (or on the ground around it) the passed ray hits first, in cm, or undefined if it misses
  public getStageSpot(raycaster: THREE.Raycaster): number[] {
    const hits = raycaster.intersectObjects(this.stageMeshes, false);

    if (hits.length === 0) {
      return undefined;
    }

    const point = hits[0].point;

    return [Math.round(point.x), Math.round(point.y), Math.round(point.z)];
  }

  // pick a spot on the stage with the next click into the 3D preview, or stop picking it
  public pickSpot(picking: boolean) {
    this.pickingSpot = picking;
  }

  public updateFixtureSetup() {
    this.stageAndPositionsDirty = true;
    this.doUpdateFixtureSetup.next();
  }

  private prepareStageMesh(mesh: THREE.Mesh) {
    mesh.receiveShadow = false;
    mesh.castShadow = false;
  }

  public updateStage() {
    if (!this.scene) {
      return;
    }

    let geometry: any;
    let mesh: any;

    // Remove old meshes from the scene
    for (const existingMesh of this.stageMeshes) {
      this.scene.remove(existingMesh);
      existingMesh.geometry.dispose();
    }
    this.stageMeshes = [];

    // Ground
    geometry = new THREE.PlaneGeometry(5000, 5000);
    mesh = new THREE.Mesh(geometry, this.stageMaterial);
    this.prepareStageMesh(mesh);
    mesh.position.set(0, 0, 0);
    mesh.rotateX((Math.PI / 180) * -90);
    this.scene.add(mesh);
    this.stageMeshes.push(mesh);

    // Floor
    geometry = new THREE.BoxGeometry(
      this.projectService.project.stageWidthCm,
      this.projectService.project.stageFloorHeightCm,
      this.projectService.project.stageDepthCm
    );
    mesh = new THREE.Mesh(geometry, this.stageMaterial);
    this.prepareStageMesh(mesh);
    mesh.position.set(0, this.projectService.project.stageFloorHeightCm / 2, 0);
    this.scene.add(mesh);
    this.stageMeshes.push(mesh);

    // Pillar front left
    geometry = new THREE.BoxGeometry(
      this.projectService.project.stagePillarWidthCm,
      this.projectService.project.stageHeightCm,
      this.projectService.project.stagePillarWidthCm
    );
    mesh = new THREE.Mesh(geometry, this.stageMaterial);
    this.prepareStageMesh(mesh);
    mesh.position.set(
      -this.projectService.project.stageWidthCm / 2 + this.projectService.project.stagePillarWidthCm / 2,
      this.projectService.project.stageHeightCm / 2 + this.projectService.project.stageFloorHeightCm,
      this.projectService.project.stageDepthCm / 2 - this.projectService.project.stagePillarWidthCm / 2
    );
    this.scene.add(mesh);
    this.stageMeshes.push(mesh);

    // Pillar front right
    geometry = new THREE.BoxGeometry(
      this.projectService.project.stagePillarWidthCm,
      this.projectService.project.stageHeightCm,
      this.projectService.project.stagePillarWidthCm
    );
    mesh = new THREE.Mesh(geometry, this.stageMaterial);
    this.prepareStageMesh(mesh);
    mesh.position.set(
      this.projectService.project.stageWidthCm / 2 - this.projectService.project.stagePillarWidthCm / 2,
      this.projectService.project.stageHeightCm / 2 + this.projectService.project.stageFloorHeightCm,
      this.projectService.project.stageDepthCm / 2 - this.projectService.project.stagePillarWidthCm / 2
    );
    this.scene.add(mesh);
    this.stageMeshes.push(mesh);

    // Pillar back left
    geometry = new THREE.BoxGeometry(
      this.projectService.project.stagePillarWidthCm,
      this.projectService.project.stageHeightCm,
      this.projectService.project.stagePillarWidthCm
    );
    mesh = new THREE.Mesh(geometry, this.stageMaterial);
    this.prepareStageMesh(mesh);
    mesh.position.set(
      -this.projectService.project.stageWidthCm / 2 + this.projectService.project.stagePillarWidthCm / 2,
      this.projectService.project.stageHeightCm / 2 + this.projectService.project.stageFloorHeightCm,
      -this.projectService.project.stageDepthCm / 2 + this.projectService.project.stagePillarWidthCm / 2
    );
    this.scene.add(mesh);
    this.stageMeshes.push(mesh);

    // Pillar back right
    geometry = new THREE.BoxGeometry(
      this.projectService.project.stagePillarWidthCm,
      this.projectService.project.stageHeightCm,
      this.projectService.project.stagePillarWidthCm
    );
    mesh = new THREE.Mesh(geometry, this.stageMaterial);
    this.prepareStageMesh(mesh);
    mesh.position.set(
      this.projectService.project.stageWidthCm / 2 - this.projectService.project.stagePillarWidthCm / 2,
      this.projectService.project.stageHeightCm / 2 + this.projectService.project.stageFloorHeightCm,
      -this.projectService.project.stageDepthCm / 2 + this.projectService.project.stagePillarWidthCm / 2
    );
    this.scene.add(mesh);
    this.stageMeshes.push(mesh);

    // Ceiling
    geometry = new THREE.BoxGeometry(
      this.projectService.project.stageWidthCm,
      this.projectService.project.stageCeilingHeightCm,
      this.projectService.project.stageDepthCm
    );
    mesh = new THREE.Mesh(geometry, this.stageMaterial);
    this.prepareStageMesh(mesh);
    mesh.position.set(
      0,
      this.projectService.project.stageHeightCm +
        this.projectService.project.stageCeilingHeightCm / 2 +
        this.projectService.project.stageFloorHeightCm,
      0
    );
    this.scene.add(mesh);
    this.stageMeshes.push(mesh);
  }

  ngOnDestroy() {
    this.fixtureMaterial.dispose();
    this.fixtureSelectedMaterial.dispose();
  }
}
