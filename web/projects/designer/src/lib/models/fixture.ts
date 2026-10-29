export enum Positioning {
  topFront = 'topFront',
  topBack = 'topBack',
  bottomFront = 'bottomFront',
  bottomBack = 'bottomBack',
  manual = 'manual',
}

export class Fixture {
  uuid: string;
  profileUuid: string;
  name: string;
  dmxUniverseUuid: string;
  dmxFirstChannel = 1;
  modeShortName: string;
  positioning: Positioning = Positioning.topFront;

  // Only relevant when positioning = manual
  // in CM
  positionX = 0;
  positionY = 0;
  positionZ = 0;

  // in DEG
  rotationX = 0;
  rotationY = 0;
  rotationZ = 0;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.uuid = data.uuid;
    this.profileUuid = data.profileUuid;
    this.name = data.name;
    this.dmxUniverseUuid = data.dmxUniverseUuid;
    this.dmxFirstChannel = data.dmxFirstChannel;
    this.modeShortName = data.modeShortName;
    // a fixture saved without a place hangs where a new one does
    this.positioning = data.positioning ?? this.positioning;
    this.positionX = data.positionX ?? this.positionX;
    this.positionY = data.positionY ?? this.positionY;
    this.positionZ = data.positionZ ?? this.positionZ;
    this.rotationX = data.rotationX ?? this.rotationX;
    this.rotationY = data.rotationY ?? this.rotationY;
    this.rotationZ = data.rotationZ ?? this.rotationZ;
  }
}
