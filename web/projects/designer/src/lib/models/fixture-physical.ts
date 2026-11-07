// the lens of a fixture: how wide its beam opens, the narrowest and the widest it zooms to (both the same for a fixture
// without a zoom), in degrees, like the fixture library writes it down
export class FixtureLens {
  degreesMinMax: number[];

  constructor(data?: any) {
    if (!data) {
      return;
    }

    if (Array.isArray(data.degreesMinMax)) {
      this.degreesMinMax = data.degreesMinMax.slice();
    }
  }
}

export class FixturePhysical {
  dimensions: number[] = [];
  // kept in the shape of the fixture library, so a profile saved with a project still reads the same
  lens: FixtureLens;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    if (data.dimensions) {
      for (const dimension of data.dimensions) {
        this.dimensions.push(dimension);
      }
    }

    if (data.lens) {
      this.lens = new FixtureLens(data.lens);
    }
  }
}
