import { FixtureProfile } from './fixture-profile';

export class CachedFixturePixel {
  key: string;

  // index of the pixel for all dimensions
  x: number;
  y: number;
  z: number;

  // position of the beam
  positionX: number;
  positionY: number;
  positionZ: number;
}
