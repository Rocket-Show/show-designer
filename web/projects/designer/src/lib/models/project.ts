import { CompositionHold } from './composition-hold';
import { GoboPatternChoice } from './gobo-pattern-choice';
import { DmxOverride } from './dmx-override';
import { Composition } from './composition';
import { Fixture } from './fixture';
import { Folder } from './folder';
import { FixtureProfile } from './fixture-profile';
import { Preset } from './preset';
import { PresetFixture } from './preset-fixture';
import { Scene } from './scene';
import { UniverseConfig } from './universe-config';
import { ProjectPixelPalette } from './pixel-palette';

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

  // the step of the selected preset the panels are editing
  public selectedStepUuid: string;

  // watch the steps of the selected preset run instead of holding the one being edited,
  // and the point on the clock the run was started from. Both only travel to the live
  // preview, they are never loaded back from a project.
  public stepPreviewRunning = false;
  public stepPreviewStartMillis = 0;

  // the fixtures being identified from the fixture pool: they blink at full, whatever the
  // presets do with them (see PreviewService.getIdentifyValues). Only travels to the live
  // preview as well, it is never loaded back from a project.
  public identifyFixtureUuids: string[] = [];

  // the fixtures the fixture pool asks to reset themselves or to switch their lamp on, over what the presets do with
  // them (see maintenance). Like the identified fixtures, they only travel to the live preview.
  public resetFixtureUuids: string[] = [];
  public lampOnFixtureUuids: string[] = [];

  // the DMX channels held at a value by the faders of the DMX channels, over what the presets put on them. Like the
  // identified fixtures, they only travel to the live preview.
  public dmxOverrides: DmxOverride[] = [];

  // The hold points the timeline has held at since it has been played from the start or moved, with the time held at
  // each, and whether it stands at the last of them, waiting for GO (see TimelineService.holds). The live preview
  // holds along with it. Like the identified fixtures, they only travel to the live preview.
  public previewHolds: CompositionHold[] = [];
  public previewHolding = false;

  // true = play the selected preset on its own (solo), false = play the selected scenes
  public previewPreset = false;

  // Whether the dimmers of a fixture which lights in colors only (e.g. an RGB par or a pixel bar with a master dimmer)
  // start at full where its profile does not say where they start: a color is all it takes to light it, like a
  // fixture without a dimmer (see FixtureService.openColorDimmers). It stays dark while its colors are off. A project
  // of a version before 11 keeps its dimmers off, the way it was played then.
  public colorDimmersAtFull = true;

  public selectedCompositionUuid: string;

  public compositions: Composition[] = [];

  // the palettes of the pixel effects saved with the project, which any effect can be painted in: an effect keeps a
  // copy of the colors of the one it is painted in, so only the designer reads them
  public pixelPalettes: ProjectPixelPalette[] = [];
  // the patterns picked for the gobos of the fixture models, which the preview shows them with (see GoboPatternChoice)
  public goboPatterns: GoboPatternChoice[] = [];
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

  // the folders grouping the scenes, the presets and the fixtures
  public sceneFolders: Folder[] = [];
  public presetFolders: Folder[] = [];
  public fixtureFolders: Folder[] = [];

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.id = data.id;
    this.version = data.version;
    this.uuid = data.uuid;
    this.name = data.name;
    this.shareToken = data.shareToken;

    // the stage of a project which does not describe it is the default one, not one without a size
    this.stageWidthCm = data.stageWidthCm ?? this.stageWidthCm;
    this.stageHeightCm = data.stageHeightCm ?? this.stageHeightCm;
    this.stageDepthCm = data.stageDepthCm ?? this.stageDepthCm;

    this.stageFloorHeightCm = data.stageFloorHeightCm ?? this.stageFloorHeightCm;
    this.stageCeilingHeightCm = data.stageCeilingHeightCm ?? this.stageCeilingHeightCm;
    this.stagePillarWidthCm = data.stagePillarWidthCm ?? this.stagePillarWidthCm;

    this.masterDimmerValue = data.masterDimmerValue ?? 1;

    this.selectedPresetUuid = data.selectedPresetUuid;
    this.selectedSceneUuids = data.selectedSceneUuids ?? [];
    this.selectedStepUuid = data.selectedStepUuid;

    // never open a project watching the steps run (see stepPreviewRunning)
    this.stepPreviewRunning = false;
    this.stepPreviewStartMillis = 0;
    this.previewPreset = data.previewPreset;
    this.colorDimmersAtFull = data.colorDimmersAtFull ?? true;
    this.selectedCompositionUuid = data.selectedCompositionUuid;
    this.pixelPalettes = Array.isArray(data.pixelPalettes)
      ? data.pixelPalettes.map((palette: any) => new ProjectPixelPalette(palette))
      : [];
    this.goboPatterns = Array.isArray(data.goboPatterns) ? data.goboPatterns.map((choice: any) => new GoboPatternChoice(choice)) : [];

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

    for (const [source, target] of [
      [data.sceneFolders, this.sceneFolders],
      [data.presetFolders, this.presetFolders],
      [data.fixtureFolders, this.fixtureFolders],
    ] as [any[], Folder[]][]) {
      for (const folder of source ?? []) {
        target.push(new Folder(folder));
      }
    }
  }
}
