import { FixtureMatrixPixelGroup } from './fixture-matrix-pixel-group';

export class FixtureMatrix {
  // the pixel keys by Z, Y and X like in the fixture library (null for a hole)
  pixelKeys: string[][][];
  pixelCount: number[] = [];
  pixelGroups: { [name: string]: FixtureMatrixPixelGroup } = {};

  constructor(data?: any) {
    if (!data) {
      return;
    }

    if (data.pixelKeys) {
      this.pixelKeys = data.pixelKeys;
    }
    if (data.pixelCount) {
      for (const pixelCountEntry of data.pixelCount) {
        this.pixelCount.push(pixelCountEntry);
      }
    }
    if (data.pixelGroups) {
      for (const property of Object.keys(data.pixelGroups)) {
        this.pixelGroups[property] = new FixtureMatrixPixelGroup(data.pixelGroups[property]);
      }
    }
  }
}
