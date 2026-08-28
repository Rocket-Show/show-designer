import { Effect } from './effect';
import { EffectCurve } from './effect-curve';
import { EffectPanTilt } from './effect-pan-tilt';
import { FixtureCapabilityValue } from './fixture-capability-value';
import { FixtureChannelValue } from './fixture-channel-value';
import { FolderPosition } from './folder-position';
import { PresetFixture } from './preset-fixture';
import { PresetStep } from './preset-step';
import { TransitionCurveType } from './transition-curve';

export class Preset {
  uuid: string;
  name: string;

  // the folder of the preset list this preset is in (undefined = top level) and its
  // position among the folders and presets of that folder
  folderUuid: string;
  sortIndex = 0;

  // how the preset is marked in the lists. While colorAuto is set, the color the preset
  // puts on its fixtures decides and the picked one is only what the preset falls back
  // to while it sets no color at all.
  color: string;
  colorAuto = true;

  // font awesome class of the icon shown in the preset list (undefined = the default one)
  icon: string;

  // all related fixtures
  // OBSOLETE: replaced with fixtures
  fixtureUuids: string[] = [];

  // all related fixtures, in the order they are chased in (only relevant, if
  // useGlobalFixtureOrder is false)
  fixtures: PresetFixture[] = [];

  // where this preset puts the project's fixture folders, when it brings its own
  // fixture order. A folder without an entry here sits where the project puts it.
  fixtureFolders: FolderPosition[] = [];

  // chase the fixtures in the global order (project.presetFixtures) instead of
  // this preset's own order
  useGlobalFixtureOrder = true;

  // the selected values
  // OBSOLETE: replaced with the values of the first step. Still written when a project
  // is saved, so that an older Rocket Show shows the first step instead of nothing.
  fixtureChannelValues: FixtureChannelValue[] = [];
  fixtureCapabilityValues: FixtureCapabilityValue[] = [];

  // the states this preset runs through over its playing time, in the order they are
  // reached. A preset always holds at least one step.
  steps: PresetStep[] = [];

  // start the sequence over instead of holding the last step
  stepsLoop = false;

  // the length of one pass (undefined = the last step holds as long as the one before
  // it lasted, see PresetStepService.getStepsLoopMillis)
  stepsLoopMillis: number;

  // how the sequence is shifted from one fixture to the next (chasing), following the
  // same rules as the effect curves: 'millis' shifts it by a fixed time, 'spread'
  // distributes stepsPhasingCycles full passes over all fixtures of the preset.
  // both values are signed: a negative one chases in the opposite direction.
  stepsPhasingMode = 'millis';
  stepsPhasingMillis = 0;
  stepsPhasingCycles = 1;

  // how many fixtures share the same chase step (1 = each fixture on its own)
  stepsPhasingGroupSize = 1;

  // all related effects. They stay on the preset instead of moving into the steps, so
  // that they keep their phase across a step transition: a step only opens or closes
  // them (see PresetStep.effectAmounts).
  effects: Effect[] = [];

  // position offset, relative to the scene start
  // (undefined = start/end of the scene itself)
  startMillis: number;
  endMillis: number;

  // fading times
  fadeInMillis = 0;
  fadeOutMillis = 0;

  // how the fades are shaped over their time (see transition-curve)
  fadeInCurve: TransitionCurveType = 'linear';
  fadeOutCurve: TransitionCurveType = 'linear';

  // fade in/out outside the start/end times?
  fadeInPre = false;
  fadeOutPost = false;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.uuid = data.uuid;
    this.name = data.name;
    this.folderUuid = data.folderUuid;
    this.sortIndex = data.sortIndex || 0;
    this.color = data.color;
    this.colorAuto = data.colorAuto !== false;
    this.icon = data.icon;

    // OBSOLETE
    this.fixtureUuids = data.fixtureUuids;

    if (data.fixtures) {
      for (const fixture of data.fixtures) {
        this.fixtures.push(new PresetFixture(fixture));
      }
    }

    if (data.fixtureFolders) {
      for (const folderPosition of data.fixtureFolders) {
        this.fixtureFolders.push(new FolderPosition(folderPosition));
      }
    }

    if (data.fixtureChannelValues) {
      for (const fixtureChannelValue of data.fixtureChannelValues) {
        this.fixtureChannelValues.push(new FixtureChannelValue(fixtureChannelValue));
      }
    }
    if (data.fixtureCapabilityValues) {
      for (const fixtureCapabilityValue of data.fixtureCapabilityValues) {
        this.fixtureCapabilityValues.push(new FixtureCapabilityValue(fixtureCapabilityValue));
      }
    }
    if (data.steps) {
      for (const step of data.steps) {
        this.steps.push(new PresetStep(step));
      }
    }

    this.stepsLoop = data.stepsLoop === true;
    this.stepsLoopMillis = data.stepsLoopMillis;
    this.stepsPhasingMode = data.stepsPhasingMode || 'millis';
    this.stepsPhasingMillis = data.stepsPhasingMillis || 0;
    this.stepsPhasingCycles = data.stepsPhasingCycles === undefined ? 1 : data.stepsPhasingCycles;
    this.stepsPhasingGroupSize = data.stepsPhasingGroupSize === undefined ? 1 : data.stepsPhasingGroupSize;

    if (data.effects) {
      for (const effect of data.effects) {
        switch (effect.type) {
          case 'curve':
            this.effects.push(new EffectCurve(effect));
            break;
          case 'pan-tilt':
            this.effects.push(new EffectPanTilt(effect));
            break;
        }
      }
    }
    this.startMillis = data.startMillis;
    this.endMillis = data.endMillis;
    this.fadeInMillis = data.fadeInMillis;
    this.fadeOutMillis = data.fadeOutMillis;

    // projects before version 7 only knew linear fades
    this.fadeInCurve = data.fadeInCurve || 'linear';
    this.fadeOutCurve = data.fadeOutCurve || 'linear';
    this.fadeInPre = data.fadeInPre;
    this.fadeOutPost = data.fadeOutPost;

    // projects before version 3 did not know a preset-specific fixture order
    this.useGlobalFixtureOrder = data.useGlobalFixtureOrder !== false;
  }
}
