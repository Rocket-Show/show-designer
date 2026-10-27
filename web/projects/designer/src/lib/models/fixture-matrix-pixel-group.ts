import { FixtureMatrixPixelGroupConstraints } from './fixture-matrix-pixel-group-constraints';

export class FixtureMatrixPixelGroup {
  isAll: boolean = false;
  constraints: FixtureMatrixPixelGroupConstraints = null;

  // a group like the fixture library defines it: "all", an array of pixel keys or an object of
  // constraints. Projects of earlier designers stored the definition wrapped as
  // { isAll: <definition>, constraints: null } (also wrapped several times).
  constructor(data?: any) {
    while (data && typeof data === 'object' && !Array.isArray(data) && 'isAll' in data) {
      if (data.isAll === true) {
        break;
      }
      if (!data.isAll) {
        data = data.constraints;
        continue;
      }
      data = data.isAll;
    }

    if (!data) {
      return;
    }

    if (data === 'all' || data.isAll === true) {
      this.isAll = true;
    } else {
      this.constraints = new FixtureMatrixPixelGroupConstraints(data);
    }
  }

  // the group as the fixture library defines it, which is what Rocket Show reads
  toJSON(): any {
    if (this.isAll) {
      return 'all';
    }

    return this.constraints ? this.constraints.toJSON() : [];
  }
}
