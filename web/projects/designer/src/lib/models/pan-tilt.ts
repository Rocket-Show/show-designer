import { getPropertyRank, getWidest } from './capability-position';
import { CachedFixtureChannel } from './cached-fixture-channel';
import { arcTangent2 } from './arc-tangent';
import { cycleSine } from './cycle-sine';
import { Fixture, Positioning } from './fixture';
import { FixtureCapabilityType } from './fixture-capability';
import { FixtureCapabilityValue } from './fixture-capability-value';
import { PresetFixture } from './preset-fixture';

// Where a moving head points is set in degrees from the middle of what it reaches on each axis (pan and tilt), which
// points every model the same way: a head reaching 540° and one reaching 630° turn by the same angle, as far as they
// can. The fixtures of a preset can be fanned out over a number of degrees, or point at a spot on the stage from
// wherever they hang. Rocket Show plays them the very same way (PanTilt).

// what a moving head reaches on an axis, if its profile doesn't say (like in the 3D preview)
export const defaultPanRangeDegrees = 540;
export const defaultTiltRangeDegrees = 270;

// where the head of a moving head turns, below the place it is fastened at (see MovingHead3d)
const headOffsetCm = 5.4;

// where a fixture hangs: its place on the stage (in cm, y up) and how it is turned (in degrees, x, y and z one after
// the other, like in the 3D preview)
export interface StagePlacement {
  position: number[];
  rotation: number[];
}

// what places a fixture of a preset at a spot of its own: its place in the chase of the preset (to fan it out) and
// where it hangs (to aim it at a spot)
export interface PanTiltContext {
  fixtureIndex: number;
  fixtureCount: number;
  placement?: StagePlacement;
}

// the stage and the fixtures of a project, as far as they place the fixtures
export interface StageProject {
  stageWidthCm: number;
  stageHeightCm: number;
  stageDepthCm: number;
  stageFloorHeightCm: number;
  fixtures: Fixture[];
  presetFixtures: PresetFixture[];
}

export function isPanTilt(type: FixtureCapabilityType): boolean {
  return type === FixtureCapabilityType.Pan || type === FixtureCapabilityType.Tilt;
}

// does the value point the fixtures at a spot on the stage?
export function hasAim(value: FixtureCapabilityValue): boolean {
  return isNumber(value.aimX) && isNumber(value.aimY) && isNumber(value.aimZ);
}

// does a pan or tilt value say where to point at all?
export function hasPanTiltValue(value: FixtureCapabilityValue): boolean {
  return hasAim(value) || isNumber(value.valueDegrees) || value.valuePercentage >= 0;
}

function isNumber(value: number): boolean {
  return typeof value === 'number' && !isNaN(value);
}

// The degrees a channel turns its fixture over on the passed axis (from the start to the end of its range, negative
// for a range running the other way round), or undefined if the channel doesn't turn it on that axis
export function getAxisRange(channel: CachedFixtureChannel, type: FixtureCapabilityType): number {
  const axisCapabilities = channel.capabilities.filter((channelCapability) => channelCapability.capability.type === type);

  if (axisCapabilities.length === 0) {
    return undefined;
  }

  const fallback = type === FixtureCapabilityType.Pan ? defaultPanRangeDegrees : defaultTiltRangeDegrees;
  const capability = getWidest(channel, axisCapabilities).capability;
  const start = getPropertyRank(capability.angleStart) ?? 0;
  const end = getPropertyRank(capability.angleEnd) ?? fallback;
  const range = end - start;

  return range === 0 ? fallback : range;
}

// the value of a channel pointing its fixture at the passed degrees from the middle of its range, as far as it reaches
export function getAxisChannelValue(channel: CachedFixtureChannel, range: number, degrees: number): number {
  const position = Math.max(Math.min(0.5 + degrees / range, 1), 0);

  return channel.maxValue * position;
}

// the degrees the passed fixture of a preset is turned by to fan the fixtures out: the first one by half of them to
// one side, the last one by half of them to the other
export function getSpreadDegrees(spreadDegrees: number, context: PanTiltContext): number {
  if (!isNumber(spreadDegrees) || !context || context.fixtureCount < 2) {
    return 0;
  }

  return spreadDegrees * (context.fixtureIndex / (context.fixtureCount - 1) - 0.5);
}

// Where a pan or tilt value points a fixture on its axis, in degrees from the middle of its range, or undefined if it
// can't tell (e.g. a spot to aim at, but no idea where the fixture hangs). A spot is where the fixtures point,
// whatever the mirror of the preset says; everything else is mirrored around the middle.
export function getPanTiltDegrees(value: FixtureCapabilityValue, range: number, mirror: boolean, context: PanTiltContext): number {
  const spread = getSpreadDegrees(value.spreadDegrees, context);

  if (hasAim(value)) {
    if (!context || !context.placement) {
      return undefined;
    }

    const aim = getAimDegrees(context.placement, [value.aimX, value.aimY, value.aimZ]);

    return (value.type === FixtureCapabilityType.Pan ? aim.pan : aim.tilt) + spread;
  }

  let degrees: number;

  if (isNumber(value.valueDegrees)) {
    degrees = value.valueDegrees;
  } else if (value.valuePercentage >= 0) {
    degrees = (value.valuePercentage - 0.5) * range;
  } else {
    return undefined;
  }

  degrees += spread;

  return mirror ? -degrees : degrees;
}

// The value of a channel playing a pan or tilt value, or undefined if the channel doesn't turn the fixture on its axis
// or the value doesn't say where to. A percentage of the range (of a project before the degrees) is played like it
// always was, unless the fixtures are fanned out.
export function getPanTiltChannelValue(
  value: FixtureCapabilityValue,
  channel: CachedFixtureChannel,
  mirror: boolean,
  context: PanTiltContext
): number {
  const range = getAxisRange(channel, value.type);

  if (range === undefined) {
    return undefined;
  }

  if (
    !hasAim(value) &&
    !isNumber(value.valueDegrees) &&
    value.valuePercentage >= 0 &&
    getSpreadDegrees(value.spreadDegrees, context) === 0
  ) {
    return channel.maxValue * (mirror ? 1 - value.valuePercentage : value.valuePercentage);
  }

  const degrees = getPanTiltDegrees(value, range, mirror, context);

  return degrees === undefined ? undefined : getAxisChannelValue(channel, range, degrees);
}

// ---- where the fixtures hang ----

// the sine and the cosine of an angle in degrees, exact on the quarters, which the fixtures are mostly turned by, and
// worked out like Rocket Show does in between (see cycle-sine)
function sinDegrees(degrees: number): number {
  if (degrees % 90 === 0) {
    return [0, 1, 0, -1][(((degrees / 90) % 4) + 4) % 4];
  }

  return cycleSine(degrees / 360);
}

function cosDegrees(degrees: number): number {
  if (degrees % 90 === 0) {
    return [1, 0, -1, 0][(((degrees / 90) % 4) + 4) % 4];
  }

  return cycleSine(degrees / 360 + 0.25);
}

function multiply(a: number[][], b: number[][]): number[][] {
  return a.map((row) => [0, 1, 2].map((column) => row[0] * b[0][column] + row[1] * b[1][column] + row[2] * b[2][column]));
}

// the matrix turning a fixture by the passed degrees around x, y and z, one after the other (like the 3D preview)
export function getRotationMatrix(rotation: number[]): number[][] {
  const [sx, cx] = [sinDegrees(rotation[0]), cosDegrees(rotation[0])];
  const [sy, cy] = [sinDegrees(rotation[1]), cosDegrees(rotation[1])];
  const [sz, cz] = [sinDegrees(rotation[2]), cosDegrees(rotation[2])];

  const x = [
    [1, 0, 0],
    [0, cx, -sx],
    [0, sx, cx],
  ];
  const y = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy],
  ];
  const z = [
    [cz, -sz, 0],
    [sz, cz, 0],
    [0, 0, 1],
  ];

  return multiply(multiply(x, y), z);
}

// Where the fixtures of a project hang: a fixture placed by hand where it was placed, the others spread evenly over
// the width of the stage, in front or at the back, above or on the floor, in the order of the fixture pool. This is
// what the 3D preview shows them at (see PreviewComponent.updateStagePosition, Fixture3d.updatePosition).
export function getStagePlacements(project: StageProject): Map<string, StagePlacement> {
  const placements = new Map<string, StagePlacement>();
  const fixtures = new Map<string, Fixture>();

  for (const fixture of project.fixtures) {
    fixtures.set(fixture.uuid, fixture);

    if (fixture.positioning === Positioning.manual) {
      placements.set(fixture.uuid, {
        position: [fixture.positionX, fixture.positionY, fixture.positionZ],
        rotation: [fixture.rotationX, fixture.rotationY, fixture.rotationZ],
      });
    }
  }

  const front = project.stageDepthCm / 2 - 70;
  const back = -project.stageDepthCm / 2 + 70;
  const top = project.stageHeightCm + project.stageFloorHeightCm;
  const floor = project.stageFloorHeightCm;

  const rows: { positioning: Positioning; y: number; z: number; hanging: boolean }[] = [
    { positioning: Positioning.topFront, y: top, z: front, hanging: true },
    { positioning: Positioning.bottomFront, y: floor, z: front, hanging: false },
    { positioning: Positioning.topBack, y: top, z: back, hanging: true },
    { positioning: Positioning.bottomBack, y: floor, z: back, hanging: false },
  ];

  for (const row of rows) {
    // the fixtures of the row, each once (the pixels of a fixture follow each other)
    let count = 0;
    let lastFixtureUuid: string;

    for (const presetFixture of project.presetFixtures) {
      const fixture = fixtures.get(presetFixture.fixtureUuid);

      if (fixture && fixture.positioning === row.positioning && presetFixture.fixtureUuid !== lastFixtureUuid) {
        count++;
      }

      lastFixtureUuid = presetFixture.fixtureUuid;
    }

    let index = 0;
    lastFixtureUuid = undefined;

    for (const presetFixture of project.presetFixtures) {
      const fixture = fixtures.get(presetFixture.fixtureUuid);

      if (fixture && fixture.positioning === row.positioning) {
        if (presetFixture.fixtureUuid !== lastFixtureUuid) {
          index++;
        }

        const x = -project.stageWidthCm / 2 + (project.stageWidthCm / (count + 1)) * index;

        // a fixture hanging from above hangs below the truss, one on the floor stands on it upside down
        placements.set(fixture.uuid, {
          position: [x, row.hanging ? row.y - 13 : row.y + 13, row.z],
          rotation: [row.hanging ? 0 : 180, 0, 0],
        });
      }

      lastFixtureUuid = presetFixture.fixtureUuid;
    }
  }

  return placements;
}

// Where a moving head hanging at the passed place points at the passed spot (in cm), in degrees from the middle of
// its ranges: in the middle of both, it points straight away from where it is fastened (down, if it hangs). Of the two
// ways of pointing there, the one turning less on the pan is taken.
export function getAimDegrees(placement: StagePlacement, target: number[]): { pan: number; tilt: number } {
  const matrix = getRotationMatrix(placement.rotation);

  // where the head turns, and the spot as seen from it, in the directions of the fixture
  const origin = [0, 1, 2].map((row) => placement.position[row] - matrix[row][1] * headOffsetCm);
  const world = [0, 1, 2].map((row) => target[row] - origin[row]);
  const local = [0, 1, 2].map((column) => matrix[0][column] * world[0] + matrix[1][column] * world[1] + matrix[2][column] * world[2]);
  const length = Math.sqrt(local[0] * local[0] + local[1] * local[1] + local[2] * local[2]);

  if (length === 0) {
    return { pan: 0, tilt: 0 };
  }

  const [dx, dy, dz] = local.map((value) => value / length);

  // the head points at (-sin(tilt) sin(pan), -cos(tilt), -sin(tilt) cos(pan)) (see arc-tangent)
  const horizontal = Math.sqrt(dx * dx + dz * dz);
  const tilt = arcTangent2(horizontal, -dy);
  const pan = horizontal < 1e-9 ? 0 : arcTangent2(-dx, -dz);
  const otherPan = pan > 0 ? pan - Math.PI : pan + Math.PI;

  if (Math.abs(otherPan) < Math.abs(pan)) {
    return { pan: (otherPan * 180) / Math.PI, tilt: (-tilt * 180) / Math.PI };
  }

  return { pan: (pan * 180) / Math.PI, tilt: (tilt * 180) / Math.PI };
}

// Where the passed values of a preset point a fixture of the passed profile on an axis, in degrees from the middle of
// its range, or undefined if they don't (a later value wins, like when they are mixed). A movement of the preset runs
// around it (see EffectPanTilt).
export function getPresetPanTiltDegrees(
  values: FixtureCapabilityValue[],
  type: FixtureCapabilityType,
  profileUuid: string,
  range: number,
  mirror: boolean,
  context: PanTiltContext
): number {
  let degrees: number;

  for (const value of values) {
    if (value.type === type && (!value.profileUuid || value.profileUuid === profileUuid)) {
      const valueDegrees = getPanTiltDegrees(value, range, mirror, context);

      if (valueDegrees !== undefined) {
        degrees = valueDegrees;
      }
    }
  }

  return degrees;
}
