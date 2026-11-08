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

  // pan and tilt: the degrees the fixtures of the preset are fanned out over, from the first to the last of them
  spreadDegrees: number;

  // pan and tilt: the spot on the stage (in cm) every moving head of the preset points at, from wherever it hangs
  aimX: number;
  aimY: number;
  aimZ: number;

  // the blade of a framing shutter: Top, Right, Bottom or Left
  blade: string;

  // pan and tilt, while a preset travels from one step into the next: the value of the step it travels from and how
  // far it has come (between 0 and 1). Each moving head travels from where the one value points it to where the other
  // does, so the heads fan in and out, follow a spot moving over the stage and turn from a spot to a position alike
  // (see pan-tilt). Only the values a preset shows between two of its steps hold this, it is never saved.
  transitionFrom: FixtureCapabilityValue;
  transitionPosition: number;

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
    this.aimX = data.aimX ?? undefined;
    this.aimY = data.aimY ?? undefined;
    this.aimZ = data.aimZ ?? undefined;
    this.blade = data.blade ?? undefined;
  }
}
