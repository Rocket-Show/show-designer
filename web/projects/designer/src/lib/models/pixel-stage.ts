import { Positioning } from './fixture';
import { FixtureProfile } from './fixture-profile';
import { getRotationMatrix, StagePlacement } from './pan-tilt';
import { PixelContext } from './pixel-pattern';

// Where the pixels of the fixtures are on the stage, for a pixel effect spread across it: each LED on the front of the
// housing of its fixture (like the 3D preview shows it, see PixelHousing3d), the housing where the fixture hangs. Seen
// from the front or from above, the LEDs of a preset make up one picture. Rocket Show places them the very same way
// (PixelStage).

// the room a pixel takes on a fixture which does not say how large it is, and how deep such a fixture is (in cm)
export const DEFAULT_PIXEL_PITCH_CM = 8;
export const DEFAULT_PIXEL_DEPTH_CM = 7;

// how far the top of the housing of a fixture hanging from the truss is above where its group is placed, in cm
export const PIXEL_HOUSING_TOP_CM = 8;

// The width, height and depth of the housing of a fixture with pixels (in cm): as large as its profile says (in mm),
// or as large as its pixels need
export function pixelHousingSize(profile: FixtureProfile, columns: number, rows: number): number[] {
  const dimensions = profile.physical?.dimensions || [];

  return [
    dimensions[0] / 10 || columns * DEFAULT_PIXEL_PITCH_CM,
    dimensions[1] / 10 || rows * DEFAULT_PIXEL_PITCH_CM,
    dimensions[2] / 10 || DEFAULT_PIXEL_DEPTH_CM,
  ];
}

// where the housing is below the place its fixture is fastened at (in cm, y up): below the truss, on the floor above
// it (the fixture is turned upside down there, the housing not), in the middle of a fixture placed by hand
export function pixelHousingOffset(positioning: string, height: number): number {
  return positioning === Positioning.manual ? 0 : PIXEL_HOUSING_TOP_CM - height / 2;
}

export function isOnTheFloor(positioning: string): boolean {
  return positioning === Positioning.bottomFront || positioning === Positioning.bottomBack;
}

// Where the LED of a part of a fixture (at its place in the fixture, see FixtureService.getPixelPlace) is on the stage,
// in cm: on the front of the housing, the housing as the fixture hangs
export function pixelStagePosition(place: PixelContext, size: number[], placement: StagePlacement, positioning: string): number[] {
  const x = (place.x - 0.5) * size[0];
  const y = (0.5 - place.y) * size[1];
  const z = size[2] / 2;
  const offset = pixelHousingOffset(positioning, size[1]);

  // in the frame of the fixture, which is turned upside down on the floor
  const local = isOnTheFloor(positioning) ? [x, offset - y, -z] : [x, offset + y, z];
  const matrix = getRotationMatrix(placement.rotation);
  const position: number[] = [];

  for (let row = 0; row < 3; row++) {
    position.push(placement.position[row] + matrix[row][0] * local[0] + matrix[row][1] * local[1] + matrix[row][2] * local[2]);
  }

  return position;
}

// a coordinate rounded to a millimeter, which tells the columns and rows of the picture apart
function millimeters(value: number): number {
  return Math.floor(value * 10 + 0.5);
}

// The places of the LEDs in the picture they make up together, seen from the 'front' (x to the right, y up) or from
// above ('top', the back of the stage up): the picture framed around them, each one in a column and a row of its own,
// the columns being the places they are at from the left (a millimeter apart at least) and the rows the ones from the
// top. A picture with one column (or row) has it in the middle. The aspect is the one of the picture, a pixel more on
// each axis.
export function stagePixelPlaces(positions: number[][], view: string): PixelContext[] {
  const points = positions.map((position) => (view === 'top' ? [position[0], -position[2]] : [position[0], position[1]]));
  const columns = distinct(points.map((point) => millimeters(point[0])));
  const rows = distinct(points.map((point) => -millimeters(point[1])));

  let minX = Number.MAX_VALUE;
  let maxX = -Number.MAX_VALUE;
  let minY = Number.MAX_VALUE;
  let maxY = -Number.MAX_VALUE;

  for (const point of points) {
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]);
    maxY = Math.max(maxY, point[1]);
  }

  const columnOf = new Map(columns.map((value, index) => [value, index] as [number, number]));
  const rowOf = new Map(rows.map((value, index) => [value, index] as [number, number]));
  const width = columns.length > 1 ? ((maxX - minX) * columns.length) / (columns.length - 1) : 0;
  const height = rows.length > 1 ? ((maxY - minY) * rows.length) / (rows.length - 1) : 0;
  const longest = Math.max(width, height);

  return points.map((point) => {
    const context = new PixelContext();
    context.column = columnOf.get(millimeters(point[0]));
    context.row = rowOf.get(-millimeters(point[1]));
    context.columns = columns.length;
    context.rows = rows.length;
    context.x = columns.length > 1 ? (0.5 + ((point[0] - minX) / (maxX - minX)) * (columns.length - 1)) / columns.length : 0.5;
    context.y = rows.length > 1 ? (0.5 + ((maxY - point[1]) / (maxY - minY)) * (rows.length - 1)) / rows.length : 0.5;
    context.aspectX = longest > 0 ? width / longest : 1;
    context.aspectY = longest > 0 ? height / longest : 1;

    return context;
  });
}

// the whole numbers, each once, from the lowest to the highest
function distinct(values: number[]): number[] {
  const sorted = values.slice().sort((a, b) => a - b);

  return sorted.filter((value, index) => index === 0 || value !== sorted[index - 1]);
}
