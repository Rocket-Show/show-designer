import { Composition } from './composition';
import { Fixture } from './fixture';
import { Folder } from './folder';
import { FixtureProfile } from './fixture-profile';
import { Preset } from './preset';
import { PresetFixture } from './preset-fixture';
import { Scene } from './scene';
import { UniverseConfig } from './universe-config';

export class Project {
  public id: number;
  public version: number;
  public uuid: string;
  public name: string;
  public shareToken: string;

  public stageWidthCm = 600;
  public stageHeightCm = 350;
  public stageDepthCm = 600;

  public stageFloorHeightCm = 30;
  public stageCeilingHeightCm = 5;
  public stagePillarWidthCm = 20;

  public masterDimmerValue = 1;

  public selectedPresetUuid: string;
  public selectedSceneUuids: string[] = [];

  // true = play the selected preset on its own (solo), false = play the selected scenes
  public previewPreset = false;

  public selectedCompositionUuid: string;

  public compositions: Composition[] = [];
  public fixtureProfiles: FixtureProfile[] = [];

  // fixtures added to the project in a DMX universe
  public fixtures: Fixture[] = [];

  // the fixtures and pixel keys in order to be selectable
  public presetFixtures: PresetFixture[] = [];

  // the universes (name + uuid) the project's fixtures are assigned to
  // (used when the user manages universes freely, see freeUniverseEdit)
  public universes: UniverseConfig[] = [];

  public scenes: Scene[] = [];
  public presets: Preset[] = [];

  // the folders grouping the presets
  public presetFolders: Folder[] = [];

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.id = data.id;
    this.version = data.version;
    this.uuid = data.uuid;
    this.name = data.name;
    this.shareToken = data.shareToken;

    this.stageWidthCm = data.stageWidthCm;
    this.stageHeightCm = data.stageHeightCm;
    this.stageDepthCm = data.stageDepthCm;

    this.stageFloorHeightCm = data.stageFloorHeightCm;
    this.stageCeilingHeightCm = data.stageCeilingHeightCm;
    this.stagePillarWidthCm = data.stagePillarWidthCm;

    this.masterDimmerValue = data.masterDimmerValue;

    this.selectedPresetUuid = data.selectedPresetUuid;
    this.selectedSceneUuids = data.selectedSceneUuids;
    this.previewPreset = data.previewPreset;
    this.selectedCompositionUuid = data.selectedCompositionUuid;

    if (data.compositions) {
      for (const composition of data.compositions) {
        this.compositions.push(new Composition(composition));
      }
    }

    if (data.fixtureProfiles) {
      for (const fixtureProfile of data.fixtureProfiles) {
        this.fixtureProfiles.push(new FixtureProfile(fixtureProfile));
      }
    }

    if (data.fixtures) {
      for (const fixture of data.fixtures) {
        this.fixtures.push(new Fixture(fixture));
      }
    }

    if (data.presetFixtures) {
      for (const presetFixture of data.presetFixtures) {
        this.presetFixtures.push(new PresetFixture(presetFixture));
      }
    }

    if (data.universes) {
      for (const universe of data.universes) {
        this.universes.push({ uuid: universe.uuid, name: universe.name });
      }
    }

    if (data.scenes) {
      for (const scene of data.scenes) {
        this.scenes.push(new Scene(scene));
      }
    }

    if (data.presets) {
      for (const preset of data.presets) {
        this.presets.push(new Preset(preset));
      }
    }

    if (data.presetFolders) {
      for (const folder of data.presetFolders) {
        this.presetFolders.push(new Folder(folder));
      }
    }
  }
}
