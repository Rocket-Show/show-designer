export class FixtureMatrixPixelGroupConstraints {
  // constraint the pixel keys directly
  keys: string[] = [];

  // constraints by coordinates
  x: string[] = [];
  y: string[] = [];
  z: string[] = [];

  // a name regexp-constraint
  name: string[] = [];

  constructor(data?: any) {
    if (!data) {
      return;
    }

    if (Array.isArray(data)) {
      // an array of pixel keys
      this.keys = data;
    } else {
      // an object of constraints (designers before also stored the empty keys)
      this.x = data.x || [];
      this.y = data.y || [];
      this.z = data.z || [];
      this.name = data.name || [];
      if (data.keys && data.keys.length > 0) {
        this.keys = data.keys;
      }
    }
  }

  toJSON(): any {
    if (this.keys && this.keys.length > 0) {
      return this.keys;
    }

    const result: any = {};

    for (const property of ['x', 'y', 'z', 'name']) {
      if (this[property] && this[property].length > 0) {
        result[property] = this[property];
      }
    }

    return result;
  }
}
