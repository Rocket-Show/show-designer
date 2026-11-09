import { FanStop } from './fan-stop';
import { FixtureCapabilityColor, FixtureCapabilityType } from './fixture-capability';

export class FixtureCapabilityValue {
  type: FixtureCapabilityType;
  profileUuid: string;

  // value between 0 and 1
  valuePercentage: number;

  color: FixtureCapabilityColor;
  wheel: string;
  slotNumber: number;

  // pan and tilt: the position in degrees from the middle of what a moving head reaches on the axis, towards the end
  // of its range above 0, which points every model the same way (see pan-tilt). A value of a project before it is
  // given as a percentage of the range instead.
  valueDegrees: number;

  // pan and tilt: the degrees the fixtures of the preset are fanned out over, from the first to the last of them, or
  // from the one in the middle out to both ends ('center' as the shape of the fan, see fan)
  spreadDegrees: number;
  fanShape: string;

  // A value with a percentage fanned out over the fixtures of the preset: the value of each fixture by its place along
  // the fan (see fan). The percentage is the one in between, which a player not knowing the fans plays. Red, green and
  // blue fanned with stops at the same places make up a gradient of colors.
  fan: FanStop[];

  // how a fan goes from one stop to the next: blended (none given), or 'steps', each fixture taking the value of a stop
  // as it is (the stops sharing the fan evenly, e.g. every other fixture in another color of a gradient of two)
  fanBetween: string;

  // pan and tilt: the spot on the stage (in cm) every moving head of the preset points at, from wherever it hangs
  aimX: number;
  aimY: number;
  aimZ: number;

  // the blade of a framing shutter: Top, Right, Bottom or Left
  blade: string;

  // the strobe: the effect it flashes in (see capability-position), a plain strobe if none is given
  shutterEffect: string;

  // a program the fixture runs on its own (see program): its number (0 for none), whether it runs to the sound
  programNumber: number;
  soundControlled: boolean;

  // what a fixture is asked to do for as long as the preset plays: reset itself, switch its lamp on or off (see
  // maintenance)
  maintenanceAction: string;

  // pan and tilt, while a preset travels from one step into the next: the value of the step it travels from and how
  // far it has come (between 0 and 1). Each moving head travels from where the one value points it to where the other
  // does, so the heads fan in and out, follow a spot moving over the stage and turn from a spot to a position alike
  // (see pan-tilt). Only the values a preset shows between two of its steps hold this, it is never saved.
  transitionFrom: FixtureCapabilityValue;
  transitionPosition: number;

  // turned off in the preset editor: kept with all it says, to be turned on again, but not played (see played-values)
  deactivated: boolean;

  constructor(data?: any) {
    if (!data) {
      return;
    }
    this.type = FixtureCapabilityType[data.type as string];
    this.profileUuid = data.profileUuid;

    // null is no value, like a missing one (and like in Rocket Show)
    this.valuePercentage = data.valuePercentage ?? undefined;
    this.color = FixtureCapabilityColor[data.color as string];
    this.wheel = data.wheel;
    this.slotNumber = data.slotNumber ?? undefined;
    this.valueDegrees = data.valueDegrees ?? undefined;
    this.spreadDegrees = data.spreadDegrees ?? undefined;
    this.fanShape = data.fanShape ?? undefined;
    this.fan = Array.isArray(data.fan) && data.fan.length > 0 ? data.fan.map((stop: any) => new FanStop(stop)) : undefined;
    this.fanBetween = data.fanBetween ?? undefined;
    this.aimX = data.aimX ?? undefined;
    this.aimY = data.aimY ?? undefined;
    this.aimZ = data.aimZ ?? undefined;
    this.blade = data.blade ?? undefined;
    this.shutterEffect = data.shutterEffect ?? undefined;
    this.programNumber = data.programNumber ?? undefined;
    this.soundControlled = data.soundControlled ?? undefined;
    this.maintenanceAction = data.maintenanceAction ?? undefined;
    this.deactivated = data.deactivated === true ? true : undefined;
  }
}
