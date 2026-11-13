import { FixtureChannel } from './fixture-channel';
import { FixtureMatrix } from './fixture-matrix';
import { FixtureMode } from './fixture-mode';
import { FixturePhysical } from './fixture-physical';
import { FixtureManual, FixtureModeState, FixtureOrigin, FixtureVersion, FixtureVersionState } from './fixture-version';
import { FixtureWheel } from './fixture-wheel';
import { MaintenanceAction } from './maintenance';

export enum FixtureCategory {
  Blinder = 'Blinder',
  'Color Changer' = 'Color Changer',
  Dimmer = 'Dimmer',
  Effect = 'Effect',
  Fan = 'Fan',
  Flower = 'Flower',
  Hazer = 'Hazer',
  Laser = 'Laser',
  Matrix = 'Matrix',
  'Moving Head' = 'Moving Head',
  'Pixel Bar' = 'Pixel Bar',
  Scanner = 'Scanner',
  Smoke = 'Smoke',
  Stand = 'Stand',
  Strobe = 'Strobe',
  Other = 'Other',
  'Barrel Scanner' = 'Barrel Scanner',
}

export class FixtureProfile implements FixtureVersion {
  uuid: string;
  name: string;

  // set to file, if the profile is not loaded from the backend
  source: string;
  createdFromFile = false;

  // What the library tells about the version the profile is (see fixture-version), kept with the copy in the project.
  // Where it comes from is its origin: the source above is something else. A profile from a file and the copy of a
  // project older than the versions know nothing of it.
  fixture: string;
  origin: FixtureOrigin;
  state: FixtureVersionState;
  confirmations: number;
  problems: number;
  usage: number;
  versions: number;
  best: boolean;
  bestUuid: string;
  currentOfl: boolean;
  hidden: boolean;
  retired: boolean;
  created: string;
  parentUuid: string;
  manual: FixtureManual;
  modeStates: FixtureModeState[];

  // What the fixture pool may ask the fixtures of this profile to do without asking the user first: they confirmed the
  // channel and the range it sends on, which a profile of the AI or a user may have wrong (see FixturePoolComponent).
  // Kept with the copy, so it asks once per project.
  confirmedMaintenance: MaintenanceAction[] = [];
  manufacturerShortName: string;
  manufacturerName: string;
  categories: FixtureCategory[] = [];
  physical: FixturePhysical;
  matrix: FixtureMatrix;
  availableChannels: any = {};
  templateChannels: any = {};
  shortName: string;
  wheels: any = {};

  // All available fixture modes
  modes: FixtureMode[] = [];

  constructor(data?: any) {
    if (!data) {
      return;
    }

    // metadata
    this.uuid = data.uuid;
    this.name = data.name;
    this.manufacturerName = data.manufacturerName;
    this.manufacturerShortName = data.manufacturerShortName;

    if (data.categories) {
      for (const category of data.categories) {
        this.categories.push(FixtureCategory[category as string]);
      }
    } else if (data.mainCategory) {
      this.categories.push(FixtureCategory[data.mainCategory as string]);
    }
    if (data.physical) {
      this.physical = new FixturePhysical(data.physical);
    }
    if (data.matrix) {
      this.matrix = new FixtureMatrix(data.matrix);
    }
    if (data.wheels) {
      for (const property of Object.keys(data.wheels)) {
        const wheel = new FixtureWheel(data.wheels[property]);
        this.wheels[property] = wheel;
      }
    }
    if (data.modes) {
      for (const mode of data.modes) {
        this.modes.push(new FixtureMode(mode));
      }
    }
    if (data.availableChannels) {
      for (const property of Object.keys(data.availableChannels)) {
        const fixtureChannel = new FixtureChannel(data.availableChannels[property]);
        this.availableChannels[property] = fixtureChannel;
      }
    }
    if (data.templateChannels) {
      for (const property of Object.keys(data.templateChannels)) {
        const templateChannel = new FixtureChannel(data.templateChannels[property]);
        this.templateChannels[property] = templateChannel;
      }
    }
    if (data.createdFromFile) {
      this.createdFromFile = data.createdFromFile;
    }

    this.fixture = data.fixture;
    this.origin = data.origin;
    this.state = data.state;
    this.confirmations = data.confirmations;
    this.problems = data.problems;
    this.usage = data.usage;
    this.versions = data.versions;
    this.best = data.best;
    this.bestUuid = data.bestUuid;
    this.currentOfl = data.currentOfl;
    this.hidden = data.hidden;
    this.retired = data.retired;
    this.created = data.created;
    this.parentUuid = data.parentUuid;
    this.manual = data.manual;
    this.modeStates = data.modeStates;

    if (Array.isArray(data.confirmedMaintenance)) {
      this.confirmedMaintenance = data.confirmedMaintenance;
    }
  }
}
