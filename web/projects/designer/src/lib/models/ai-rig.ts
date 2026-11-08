import { AiAbility, AiPosition, AiRig, AiRigGroup, AiRigGroupFixtures } from './ai-looks';
import { CachedFixture } from './cached-fixture';
import { Fixture, Positioning } from './fixture';
import { FixtureCapabilityType } from './fixture-capability';
import { FixtureWheelSlotType } from './fixture-wheel-slot';
import { Folder } from './folder';
import { PresetFixture } from './preset-fixture';

// the API takes no more groups than this
export const aiMaxRigGroups = 32;

// what the rig is built from: the fixtures of the project in the order of the fixture pool, with their folders, and the
// parts the designer cached for them (a fixture, and each pixel of a bar or a matrix)
export interface AiRigSource {
  fixtures: Fixture[];
  presetFixtures: PresetFixture[];
  fixtureFolders: Folder[];
  cachedFixtures: CachedFixture[];
  stageHeightCm: number;
  stageFloorHeightCm: number;
}

// The fixtures of a project in groups, as Claude is told about them (see ai-looks): the fixtures of a folder of the
// fixture pool form a group, the others one for each model and place on the stage, in the order of the fixture pool.
export function buildAiRig(source: AiRigSource): AiRig {
  const fixtures = new Map(source.fixtures.map((fixture) => [fixture.uuid, fixture]));
  const folders = new Map(source.fixtureFolders.map((folder) => [folder.uuid, folder]));
  const parts = new Map<string, CachedFixture[]>();

  for (const part of source.cachedFixtures) {
    if (!parts.has(part.fixture.uuid)) {
      parts.set(part.fixture.uuid, []);
    }
    parts.get(part.fixture.uuid).push(part);
  }

  // the fixtures of each group, in the order they first come in the fixture pool
  const groups = new Map<string, { folder: Folder; fixtureUuids: string[] }>();
  const seen = new Set<string>();

  for (const presetFixture of source.presetFixtures) {
    const fixture = fixtures.get(presetFixture.fixtureUuid);

    if (!fixture || seen.has(fixture.uuid) || !parts.has(fixture.uuid)) {
      continue;
    }
    seen.add(fixture.uuid);

    const folder = presetFixture.folderUuid ? folders.get(presetFixture.folderUuid) : undefined;
    const key = folder ? 'folder:' + folder.uuid : 'model:' + fixture.profileUuid + ':' + getAiPosition(fixture, source);

    if (!groups.has(key)) {
      groups.set(key, { folder, fixtureUuids: [] });
    }
    groups.get(key).fixtureUuids.push(fixture.uuid);
  }

  const rigGroups: AiRigGroupFixtures[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();

  for (const { folder, fixtureUuids } of Array.from(groups.values()).slice(0, aiMaxRigGroups)) {
    const groupParts = ([] as CachedFixture[]).concat(...fixtureUuids.map((uuid) => parts.get(uuid)));
    const profile = groupParts[0].profile;
    const name = unique(folder ? folder.name : profile.name, names, (base, n) => base + ' ' + n);
    const id = unique(slug(name), ids, (base, n) => base.slice(0, 60) + '-' + n);
    const group: AiRigGroup = {
      id,
      name,
      category: mostCommon(groupParts.map((part) => (part.profile.categories || [])[0]).filter((category) => !!category)) || '',
      count: fixtureUuids.length,
      position: mostCommon(fixtureUuids.map((uuid) => getAiPosition(fixtures.get(uuid), source))) as AiPosition,
      abilities: getAbilities(groupParts),
    };

    const colors = getWheelOnlyColors(groupParts);
    if (colors) {
      group.colors = colors;
    }

    const pixels = getPixels(groupParts);
    if (pixels) {
      group.pixels = pixels;
    }

    rigGroups.push({ group, fixtureUuids });
  }

  return { groups: rigGroups };
}

// where a fixture is: placed by the fixture pool on the truss or on the floor, at the front or at the back, or placed
// by hand above or below the middle of the stage, in front of or behind its middle
export function getAiPosition(fixture: Fixture, source: { stageHeightCm: number; stageFloorHeightCm: number }): AiPosition {
  switch (fixture.positioning) {
    case Positioning.topFront:
      return 'top-front';
    case Positioning.topBack:
      return 'top-back';
    case Positioning.bottomFront:
      return 'floor-front';
    case Positioning.bottomBack:
      return 'floor-back';
  }

  if (typeof fixture.positionY !== 'number' || typeof fixture.positionZ !== 'number') {
    return 'other';
  }

  const top = fixture.positionY > source.stageFloorHeightCm + source.stageHeightCm / 2;
  const front = fixture.positionZ >= 0;

  return ((top ? 'top-' : 'floor-') + (front ? 'front' : 'back')) as AiPosition;
}

// what the parts of the fixtures of a group can do, together
function getAbilities(parts: CachedFixture[]): AiAbility[] {
  const has = (test: (type: FixtureCapabilityType, part: CachedFixture, channelCapability: any) => boolean) =>
    parts.some((part) =>
      part.channels.some((channel) =>
        channel.capabilities.some((channelCapability) => test(channelCapability.capability.type, part, channelCapability))
      )
    );

  const abilities: AiAbility[] = [];

  // a fixture lighting in colors only is dimmed through its colors (see FixtureService.addVirtualDimmers)
  if (has((type) => type === FixtureCapabilityType.Intensity || type === FixtureCapabilityType.ColorIntensity)) {
    abilities.push('dimmer');
  }
  if (
    has(
      (type, part, channelCapability) =>
        type === FixtureCapabilityType.ColorIntensity ||
        type === FixtureCapabilityType.ColorPreset ||
        (type === FixtureCapabilityType.WheelSlot && channelCapability.wheelIsColor)
    )
  ) {
    abilities.push('color');
  }
  if (has((type) => type === FixtureCapabilityType.Pan || type === FixtureCapabilityType.Tilt)) {
    abilities.push('pan-tilt');
  }
  if (
    has(
      (type, part, channelCapability) =>
        type === FixtureCapabilityType.ShutterStrobe &&
        channelCapability.capability.shutterEffect !== 'Open' &&
        channelCapability.capability.shutterEffect !== 'Closed'
    )
  ) {
    abilities.push('strobe');
  }
  if (parts.some((part) => !!part.pixel)) {
    abilities.push('pixels');
  }
  if (has((type) => type === FixtureCapabilityType.Zoom)) {
    abilities.push('zoom');
  }
  if (
    has(
      (type, part, channelCapability) =>
        type === FixtureCapabilityType.WheelSlot &&
        (channelCapability.wheelSlots || []).some((slot: any) => slot && slot.type === FixtureWheelSlotType.Gobo)
    )
  ) {
    abilities.push('gobo');
  }
  if (has((type) => type === FixtureCapabilityType.Prism)) {
    abilities.push('prism');
  }

  return abilities;
}

// the colors of the color wheels of a group lighting its colors through a wheel only, or undefined
function getWheelOnlyColors(parts: CachedFixture[]): string[] {
  const colors: string[] = [];
  let mixes = false;

  for (const part of parts) {
    for (const channel of part.channels) {
      for (const channelCapability of channel.capabilities) {
        const type = channelCapability.capability.type;

        if (type === FixtureCapabilityType.ColorIntensity) {
          mixes = true;
        }

        if (type === FixtureCapabilityType.WheelSlot && channelCapability.wheelIsColor) {
          for (const slot of channelCapability.wheelSlots || []) {
            for (const color of (slot && slot.colors) || []) {
              const hex = String(color).toLowerCase();

              if (/^#[0-9a-f]{6}$/.test(hex) && colors.indexOf(hex) < 0) {
                colors.push(hex);
              }
            }
          }
        }
      }
    }
  }

  return !mixes && colors.length > 0 ? colors.slice(0, 32) : undefined;
}

// the size of the pixel grid of the bars and matrices of a group: as the profile has its pixels, or in a row
function getPixels(parts: CachedFixture[]): { columns: number; rows: number } {
  const pixels = parts.filter((part) => !!part.pixel);

  if (pixels.length === 0) {
    return undefined;
  }

  const count = parts[0].profile.matrix ? parts[0].profile.matrix.pixelCount : undefined;

  if (count && count.length >= 2 && count[0] > 0 && count[1] > 0) {
    return { columns: Math.min(count[0], 1024), rows: Math.min(count[1] * (count[2] > 0 ? count[2] : 1), 1024) };
  }

  const pixelsOfFirst = pixels.filter((part) => part.fixture.uuid === pixels[0].fixture.uuid).length;

  return { columns: Math.min(pixelsOfFirst, 1024), rows: 1 };
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  let best: string;

  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);

    if (best === undefined || counts.get(value) > counts.get(best)) {
      best = value;
    }
  }

  return best;
}

// an id of lower case letters, digits and dashes, like the API wants it
function slug(name: string): string {
  const id = (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return id || 'group';
}

function unique(base: string, taken: Set<string>, numbered: (base: string, n: number) => string): string {
  let candidate = base;

  for (let n = 2; taken.has(candidate); n++) {
    candidate = numbered(base, n);
  }
  taken.add(candidate);

  return candidate;
}
