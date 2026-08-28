import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import * as THREE from 'three';
import { CachedFixture } from '../models/cached-fixture';
import { EffectCurve } from '../models/effect-curve';
import { FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureChannelValue } from '../models/fixture-channel-value';
import { Preset } from '../models/preset';
import { PresetRegionScene } from '../models/preset-region-scene';
import { PresetStep } from '../models/preset-step';
import { PresetStepState } from '../models/preset-step-state';
import { applyTransitionCurve } from '../models/transition-curve';
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

@Injectable({
  providedIn: 'root',
})
export class PreviewService implements OnDestroy {
  public doUpdateFixtureSetup: Subject<void> = new Subject();
  public doUpdateStageAndPositions: Subject<void> = new Subject();

  private updateStageAndPositionsSubscription: Subscription;
  public stageAndPositionsDirty: boolean = true;

  public scene: THREE.Scene;

  private stageMeshes: THREE.Mesh[] = [];
  private stageMaterial: THREE.MeshStandardMaterial;
  fixtureMaterial: THREE.MeshStandardMaterial;
  fixtureSelectedMaterial: THREE.MeshLambertMaterial;

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

  private getAlreadyCalculatedFixture(fixtures: CachedFixture[], fixtureIndex: number): CachedFixture {
    // Has this fixture already been calculated (same universe and dmx start address as a fixture before)
    // --> return it
    for (let i = 0; i < fixtureIndex; i++) {
      const calculatedFixture = fixtures[i];

      if (
        calculatedFixture.fixture.dmxUniverseUuid === fixtures[fixtureIndex].fixture.dmxUniverseUuid &&
        calculatedFixture.fixture.dmxFirstChannel === fixtures[fixtureIndex].fixture.dmxFirstChannel &&
        ((!calculatedFixture.pixel?.key && !fixtures[fixtureIndex].pixel?.key) ||
          calculatedFixture.pixel?.key === fixtures[fixtureIndex].pixel?.key)
      ) {
        return calculatedFixture;
      }
    }

    return undefined;
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

  // Get the fixture index inside the passed preset (used for chasing)
  private getFixtureIndex(preset: Preset, fixtureUuid: string, pixelKey: string): number {
    let index = 0;
    const countedFirstDmxChannelPixelKey: any[] = [];

    if (!this.presetService.getPresetFixture(preset, fixtureUuid, pixelKey)) {
      // fixture is not in preset
      return undefined;
    }

    // either the global fixture order of the project or the preset's own one defines
    // the order to chase in (avoid building up a list here, this runs for every
    // fixture of every active preset on every frame)
    const orderedFixtures = preset.useGlobalFixtureOrder ? this.projectService.project.presetFixtures : preset.fixtures;

    for (const orderedFixture of orderedFixtures) {
      // when using the global order, skip all fixtures which are not in this preset
      const presetFixture = preset.useGlobalFixtureOrder
        ? this.presetService.getPresetFixture(preset, orderedFixture.fixtureUuid, orderedFixture.pixelKey)
        : orderedFixture;

      if (!presetFixture) {
        continue;
      }

      if (this.presetService.fixtureUuidAndPixelKeyEquals(presetFixture.fixtureUuid, fixtureUuid, presetFixture.pixelKey, pixelKey)) {
        return index;
      }

      const fixture = this.fixtureService.getFixtureByUuid(presetFixture.fixtureUuid);
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

      // don't count fixtures on the same universe and channel as already counted ones
      if (!exists) {
        index++;
        countedFirstDmxChannelPixelKey.push(firstDmxChannelAndFixtureUuid);
      }
    }

    return undefined;
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

    return this.presetStepService.getStepState(this.presetService.getEditStep(preset.preset));
  }

  private getPresetIntensity(preset: PresetRegionScene, timeMillis: number): number {
    // When fading is in progress (on preset or scene-level), the current preset does not
    // fully cover underlying values.
    // -> 0 = no covering at all, 1 = fully cover (no fading)
    let intensityPercentageScene = 1;
    let intensityPercentagePreset = 1;
    let intensityPercentage = 1;

    if (preset.region && preset.scene) {
      // Fade out is stronger than fade in (if they overlap)

      // Take away intensity for scene fading
      const sceneStartMillis = preset.scene.fadeInPre ? preset.region.startMillis - preset.scene.fadeInMillis : preset.region.startMillis;
      const sceneEndMillis = preset.scene.fadeOutPost ? preset.region.endMillis + preset.scene.fadeOutMillis : preset.region.endMillis;

      // the curve maps how far the fade has come to how much of the intensity it has
      // already handed over, which shapes a fade out just as well as a fade in
      if (timeMillis > sceneEndMillis - preset.scene.fadeOutMillis && timeMillis < sceneEndMillis) {
        // Scene fades out
        intensityPercentageScene = applyTransitionCurve(
          preset.scene.fadeOutCurve,
          (sceneEndMillis - timeMillis) / preset.scene.fadeOutMillis
        );
      } else if (timeMillis < sceneStartMillis + preset.scene.fadeInMillis && timeMillis > sceneStartMillis) {
        // Scene fades in
        intensityPercentageScene = applyTransitionCurve(
          preset.scene.fadeInCurve,
          (timeMillis - sceneStartMillis) / preset.scene.fadeInMillis
        );
      }
    }

    if (preset.region && preset.preset) {
      // Take away intensity for preset fading
      let presetStartMillis =
        preset.preset.startMillis === undefined ? preset.region.startMillis : preset.region.startMillis + preset.preset.startMillis;

      let presetEndMillis =
        preset.preset.endMillis === undefined ? preset.region.endMillis : preset.region.startMillis + preset.preset.endMillis;

      // extend the running time, if fading is done outside the boundaries
      presetStartMillis -= preset.preset.fadeInPre ? preset.preset.fadeInMillis : 0;
      presetEndMillis += preset.preset.fadeOutPost ? preset.preset.fadeOutMillis : 0;

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

      intensityPercentage = intensityPercentageScene * intensityPercentagePreset;
    }

    return intensityPercentage;
  }

  private mixCapabilityValues(
    state: PresetStepState,
    cachedFixture: CachedFixture,
    values: FixtureChannelValue[],
    intensityPercentage: number
  ) {
    let hasColor = false;

    // mix the capability values of the state the preset is in
    for (const presetCapabilityValue of state.fixtureCapabilityValues) {
      for (const cachedChannel of cachedFixture.channels) {
        if (cachedChannel.channel) {
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
              const value = this.presetService.getCapabilityChannelValue(presetCapabilityValue, cachedChannel, channelCapability);

              if (value !== undefined) {
                const fixtureChannelValue = new FixtureChannelValue();
                fixtureChannelValue.channelName = cachedChannel.name;
                fixtureChannelValue.profileUuid = cachedFixture.profile.uuid;
                fixtureChannelValue.value = value;

                if (
                  presetCapabilityValue.type === FixtureCapabilityType.Intensity ||
                  presetCapabilityValue.type === FixtureCapabilityType.ColorIntensity
                ) {
                  // dimmer and color fade with the preset
                  this.mixChannelValue(values, fixtureChannelValue, intensityPercentage, 0);

                  if (presetCapabilityValue.type === FixtureCapabilityType.ColorIntensity) {
                    hasColor = true;
                  }
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

        // approximate the color from a color or a different color wheel, if necessary
        if (!hasColor && cachedChannel.colorWheel) {
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
    }
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

  // a preset that is not placed in a composition has no moment it starts at: the preview
  // clock has been running since the designer was opened, so a curve that stops after a
  // while would always be over already. repeat its run instead, the way the grid of the
  // effect shows it.
  private getCurveTimeMillis(curve: EffectCurve, effectTimeMillis: number, preset: PresetRegionScene, fixtureCount: number): number {
    if (preset.region) {
      return effectTimeMillis;
    }

    const loopMillis = curve.getRunLoopMillis(fixtureCount);

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
    state: PresetStepState
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
        // EffectCurve
        if (effect instanceof EffectCurve) {
          const effectCurve = effect as EffectCurve;
          const curveTimeMillis = this.getCurveTimeMillis(effectCurve, effectTimeMillis, preset, fixtureCount);

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
                  const value = effectCurve.getValueAtMillis(curveTimeMillis, fixtureIndex, fixtureCount);

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
          }

          // channels
          for (const channelProfile of effectCurve.channels) {
            if (channelProfile.profileUuid === cachedFixture.profile.uuid) {
              for (const channel of channelProfile.channels) {
                for (const cachedChannel of cachedFixture.channels) {
                  if (cachedChannel.name === channel) {
                    const value = effectCurve.getValueAtMillis(curveTimeMillis, fixtureIndex, fixtureCount);

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

        // TODO other effects (PanTilt, etc.)
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

    for (let i = 0; i < this.fixtureService.cachedFixtures.length; i++) {
      const cachedFixture = this.fixtureService.cachedFixtures[i];

      // all values of the current fixture channels
      let values: FixtureChannelValue[] = [];

      const alreadyCalculatedFixture = this.getAlreadyCalculatedFixture(this.fixtureService.cachedFixtures, i);

      if (alreadyCalculatedFixture) {
        // only relevant for the preview --> reuse all calculated values
        values = Object.assign([], calculatedFixtures.get(alreadyCalculatedFixture));
      } else {
        // apply the default values
        for (const cachedChannel of cachedFixture.channels) {
          if (cachedChannel.channel) {
            if (cachedChannel.channel.defaultValue) {
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
          const fixtureIndex = this.getFixtureIndex(preset.preset, cachedFixture.fixture.uuid, cachedFixture.pixel?.key);

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

            this.mixCapabilityValues(state, cachedFixture, values, intensityPercentage);
            this.mixChannelValues(state, cachedFixture, values, intensityPercentage);
            this.mixEffects(
              timeMillis,
              fixtureIndex,
              fixtureCounts.get(preset.preset),
              preset,
              cachedFixture,
              values,
              intensityPercentage,
              state
            );
          }
        }
      }

      // Store the calculated values for subsequent fixtures on the same DMX address
      calculatedFixtures.set(cachedFixture, values);
    }

    return calculatedFixtures;
  }

  public fixtureIsSelected(uuid: string, pixelKey: string, presets: PresetRegionScene[]): boolean {
    for (const preset of presets) {
      if (this.presetService.getPresetFixture(preset.preset, uuid, pixelKey)) {
        return true;
      }
    }

    return false;
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
