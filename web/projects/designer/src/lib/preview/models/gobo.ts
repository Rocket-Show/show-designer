import * as THREE from 'three';
import { CachedFixture } from '../../models/cached-fixture';
import { CachedFixtureCapability } from '../../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../../models/cached-fixture-channel';
import { getPropertyRank, getRotationRank } from '../../models/capability-position';
import { FixtureCapabilityType } from '../../models/fixture-capability';
import { FixtureChannelValue } from '../../models/fixture-channel-value';
import { FixtureWheelSlot, FixtureWheelSlotType } from '../../models/fixture-wheel-slot';
import { GoboPatternChoice } from '../../models/gobo-pattern-choice';

// The gobos of the preview. The fixture library names the gobos of a wheel, but has no pictures of them, so the preview
// draws a gobo of its own for each: one of a few kinds of pattern, picked from the name of the gobo where it tells (a
// star, dots, lines, ...), or else from the name and the place of the gobo on its wheel. The same gobo always looks the
// same, unless another pattern was picked for it by hand (see goboCatalog and GoboPatternChoice).

export type GoboFamily = 'dots' | 'star' | 'rays' | 'bars' | 'grid' | 'rings' | 'spiral' | 'flower' | 'breakup' | 'polygon' | 'checker';

// a family picked when the name of a gobo doesn't tell
const anyFamilies: GoboFamily[] = ['dots', 'star', 'rays', 'bars', 'grid', 'rings', 'spiral', 'flower', 'breakup', 'polygon'];

// the words in the name of a gobo telling the kind of its pattern, in the order they are looked for (e.g. "Circular
// chess" is a chessboard rather than rings)
const familyWords: [RegExp, GoboFamily][] = [
  [/chess|check/, 'checker'],
  [/star/, 'star'],
  [/spiral|swirl|hypno|vortex|twist|galax/, 'spiral'],
  [/sun|ray|burst|radial|spoke|wheel/, 'rays'],
  [/flower|petal|rose|blossom|daisy|lotus/, 'flower'],
  [/dot|bubble|ball|spots|circles|planet|moon/, 'dots'],
  [/grid|net|mesh|web|cross|lattice|window/, 'grid'],
  [/line|bar|stripe|beam|stick|lamella|slat/, 'bars'],
  [/triangle|square|box|diamond|hexagon|pentagon|octagon|polygon/, 'polygon'],
  [/ring|circle|circular|target|tunnel|donut|oval|orbit/, 'rings'],
  [
    /leaf|leaves|splash|cloud|water|fire|flame|break|prickl|dust|sparkle|glitter|noise|ice|crack|stone|rock|forest|tree|branch|smoke/,
    'breakup',
  ],
];

export interface GoboPattern {
  family: GoboFamily;
  // how many points, dots, lines, rings, ... it has
  count: number;
  // where the random looking ones start from, and how far the pattern is turned
  seed: number;
}

// a number made from a text, the same every time (FNV-1a)
export function hashGoboName(text: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

// the number of corners a polygon named after its shape has
function getPolygonCorners(name: string): number {
  if (/triangle/.test(name)) {
    return 3;
  }
  if (/square|box|diamond/.test(name)) {
    return 4;
  }
  if (/pentagon/.test(name)) {
    return 5;
  }
  if (/octagon/.test(name)) {
    return 8;
  }

  return 6;
}

// the pattern the preview draws for a gobo, from its name and its place on the wheel
export function getGoboPattern(name: string, slotNumber: number): GoboPattern {
  const lowerName = (name || '').toLowerCase();
  const hash = hashGoboName(lowerName + '#' + (lowerName ? '' : slotNumber));
  let family: GoboFamily;

  for (const [words, wordFamily] of familyWords) {
    if (words.test(lowerName)) {
      family = wordFamily;
      break;
    }
  }

  if (!family) {
    family = anyFamilies[hash % anyFamilies.length];
  }

  // a count of its own for each kind, from the hash
  const pick = (min: number, max: number) => min + (Math.floor(hash / anyFamilies.length) % (max - min + 1));
  let count: number;

  switch (family) {
    case 'dots':
      count = pick(5, 9);
      break;
    case 'star':
      count = pick(5, 8);
      break;
    case 'rays':
      count = pick(8, 16);
      break;
    case 'bars':
      count = pick(3, 6);
      break;
    case 'grid':
      count = pick(3, 5);
      break;
    case 'rings':
      count = pick(2, 4);
      break;
    case 'spiral':
      count = pick(2, 4);
      break;
    case 'flower':
      count = pick(5, 8);
      break;
    case 'polygon':
      count = getPolygonCorners(lowerName);
      break;
    case 'checker':
      count = pick(4, 6);
      break;
    default:
      count = pick(24, 40);
  }

  return { family, count, seed: hash };
}

// ---- the patterns to pick from ----

// The patterns a gobo can be shown with, when the one its name brings isn't like it: each kind with a few counts of its
// points, dots, lines, rings, ... The id of a pattern stays the same, a project keeps it (see GoboPatternChoice).
const catalogCounts: [GoboFamily, number[]][] = [
  ['star', [5, 6, 8]],
  ['dots', [5, 7, 9]],
  ['rays', [8, 12, 16]],
  ['flower', [5, 6, 8]],
  ['spiral', [2, 3, 4]],
  ['rings', [2, 3, 4]],
  ['bars', [3, 4, 6]],
  ['grid', [3, 4, 5]],
  ['checker', [4, 6]],
  ['polygon', [3, 4, 6]],
  ['breakup', [24, 32, 40]],
];

export interface GoboCatalogEntry {
  id: string;
  pattern: GoboPattern;
}

export const goboCatalog: GoboCatalogEntry[] = [];

for (const [family, counts] of catalogCounts) {
  for (const count of counts) {
    const id = family + '-' + count;
    goboCatalog.push({ id, pattern: { family, count, seed: hashGoboName(id) } });
  }
}

// the pattern of the catalog with the passed id, undefined for one it doesn't have (e.g. of a newer designer)
export function getCatalogGoboPattern(id: string): GoboPattern {
  return goboCatalog.find((entry) => entry.id === id)?.pattern;
}

// the pattern picked for a gobo of a fixture model, if one was
export function getGoboPatternChoice(
  choices: GoboPatternChoice[],
  profileUuid: string,
  wheel: string,
  slotNumber: number
): GoboPatternChoice {
  return (choices || []).find((choice) => choice.profileUuid === profileUuid && choice.wheel === wheel && choice.slotNumber === slotNumber);
}

// The pattern the preview shows a gobo of a fixture model with: the one picked for it, or else the one its name brings
export function getShownGoboPattern(
  choices: GoboPatternChoice[],
  profileUuid: string,
  wheel: string,
  slotNumber: number,
  name: string
): GoboPattern {
  const choice = getGoboPatternChoice(choices, profileUuid, wheel, slotNumber);

  return (choice && getCatalogGoboPattern(choice.pattern)) || getGoboPattern(name, slotNumber);
}

// a random source of its own for each gobo, the same every time (mulberry32)
function random(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draws the pattern white on black into a square of the passed size, the light passing where it is white. Outside the
// circle of the gobo it is black.
export function drawGoboPattern(context: CanvasRenderingContext2D, pattern: GoboPattern, size: number) {
  const center = size / 2;
  const radius = size * 0.47;
  const next = random(pattern.seed);
  const turn = next() * Math.PI * 2;

  context.fillStyle = '#000';
  context.fillRect(0, 0, size, size);

  context.save();
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.clip();
  context.translate(center, center);
  context.rotate(turn);
  context.fillStyle = '#fff';
  context.strokeStyle = '#fff';
  context.lineCap = 'round';

  const count = pattern.count;

  switch (pattern.family) {
    case 'dots': {
      const dotRadius = radius * 0.16;

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        context.beginPath();
        context.arc(Math.cos(angle) * radius * 0.62, Math.sin(angle) * radius * 0.62, dotRadius, 0, Math.PI * 2);
        context.fill();
      }

      context.beginPath();
      context.arc(0, 0, dotRadius * 1.2, 0, Math.PI * 2);
      context.fill();
      break;
    }
    case 'star': {
      context.beginPath();

      for (let i = 0; i < count * 2; i++) {
        const angle = (i / (count * 2)) * Math.PI * 2;
        const reach = i % 2 === 0 ? radius * 0.95 : radius * 0.4;
        context.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
      }

      context.closePath();
      context.fill();
      break;
    }
    case 'rays': {
      const width = Math.PI / count;

      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        context.beginPath();
        context.moveTo(0, 0);
        context.arc(0, 0, radius, angle - width / 2, angle + width / 2);
        context.closePath();
        context.fill();
      }

      // the sun in the middle
      context.beginPath();
      context.arc(0, 0, radius * 0.22, 0, Math.PI * 2);
      context.fill();
      break;
    }
    case 'bars': {
      const step = (radius * 2) / count;

      for (let i = 0; i < count; i++) {
        context.fillRect(-radius, -radius + step * i + step * 0.2, radius * 2, step * 0.55);
      }
      break;
    }
    case 'grid': {
      const step = (radius * 2) / count;
      context.lineWidth = step * 0.3;

      for (let i = 0; i <= count; i++) {
        const offset = -radius + step * i;
        context.beginPath();
        context.moveTo(offset, -radius);
        context.lineTo(offset, radius);
        context.moveTo(-radius, offset);
        context.lineTo(radius, offset);
        context.stroke();
      }
      break;
    }
    case 'rings': {
      const step = radius / (count + 0.5);
      context.lineWidth = step * 0.45;

      for (let i = 1; i <= count; i++) {
        context.beginPath();
        context.arc(0, 0, step * i, 0, Math.PI * 2);
        context.stroke();
      }

      context.beginPath();
      context.arc(0, 0, step * 0.3, 0, Math.PI * 2);
      context.fill();
      break;
    }
    case 'spiral': {
      context.lineWidth = radius * 0.13;

      for (let arm = 0; arm < count; arm++) {
        context.beginPath();

        for (let i = 0; i <= 60; i++) {
          const along = i / 60;
          const angle = (arm / count) * Math.PI * 2 + along * Math.PI * 2.2;
          context.lineTo(Math.cos(angle) * radius * along, Math.sin(angle) * radius * along);
        }

        context.stroke();
      }
      break;
    }
    case 'flower': {
      for (let i = 0; i < count; i++) {
        context.save();
        context.rotate((i / count) * Math.PI * 2);
        context.beginPath();
        context.ellipse(radius * 0.5, 0, radius * 0.42, radius * (0.9 / count) * 1.6, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }

      context.fillStyle = '#000';
      context.beginPath();
      context.arc(0, 0, radius * 0.12, 0, Math.PI * 2);
      context.fill();
      break;
    }
    case 'polygon': {
      const polygon = (reach: number) => {
        context.beginPath();

        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
          context.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
        }

        context.closePath();
      };

      polygon(radius * 0.92);
      context.fill();
      context.fillStyle = '#000';
      polygon(radius * 0.6);
      context.fill();
      context.fillStyle = '#fff';
      polygon(radius * 0.3);
      context.fill();
      break;
    }
    case 'checker': {
      const step = (radius * 2) / count;

      for (let x = 0; x < count; x++) {
        for (let y = 0; y < count; y++) {
          if ((x + y) % 2 === 0) {
            context.fillRect(-radius + x * step, -radius + y * step, step, step);
          }
        }
      }
      break;
    }
    default: {
      // a breakup: blobs of light of all sizes
      for (let i = 0; i < count; i++) {
        const angle = next() * Math.PI * 2;
        const reach = Math.sqrt(next()) * radius;
        const blob = radius * (0.05 + next() * 0.14);
        context.beginPath();
        context.ellipse(
          Math.cos(angle) * reach,
          Math.sin(angle) * reach,
          blob,
          blob * (0.5 + next() * 0.5),
          next() * Math.PI,
          0,
          Math.PI * 2
        );
        context.fill();
      }
    }
  }

  context.restore();
}

// the size of the pictures of the gobos, in pixels
const GOBO_TEXTURE_SIZE = 128;

// a texture for each gobo drawn, shared by all fixtures showing it
const goboTextures = new Map<string, THREE.Texture>();

function getGoboKey(pattern: GoboPattern): string {
  return pattern.family + ':' + pattern.count + ':' + pattern.seed;
}

// the picture of the gobo, drawn once and kept
export function getGoboTexture(pattern: GoboPattern): THREE.Texture {
  const key = getGoboKey(pattern);
  let texture = goboTextures.get(key);

  if (texture) {
    return texture;
  }

  const canvas = document.createElement('canvas');
  canvas.width = GOBO_TEXTURE_SIZE;
  canvas.height = GOBO_TEXTURE_SIZE;
  const context = canvas.getContext('2d');

  if (context) {
    drawGoboPattern(context, pattern, GOBO_TEXTURE_SIZE);
  }

  texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  goboTextures.set(key, texture);

  return texture;
}

// the gobo a fixture shows in this frame, and how it is turned
export interface GoboState {
  pattern: GoboPattern;
  // how far the gobo is turned, in radians
  angle: number;
}

// the speed a rotation turns at in turns per second, clockwise above 0: from a speed of the fixture library (e.g. "fast
// CW", "30rpm", "0.5Hz"), the words taken as a fast and a slow turn
export function getRotationTurnsPerSecond(text: string): number {
  const rank = getRotationRank(text);

  if (rank === undefined || !Number.isFinite(rank)) {
    return undefined;
  }

  if (Math.abs(rank) >= 1e8) {
    return Math.sign(rank) * 1;
  }
  if (rank !== 0 && Math.abs(rank) <= 1e-8) {
    return Math.sign(rank) * 0.1;
  }
  if (String(text).trim().endsWith('%')) {
    // a part of the fastest the fixture turns, taken as a turn per second
    return rank / 100;
  }

  return rank;
}

// how far the value is through the range of the capability, from 0 (its start) to 1 (its end)
function getPosition(channel: CachedFixtureChannel, capability: CachedFixtureCapability, value: number): number {
  const dmxRange = capability.capability.dmxRange;
  let position: number;

  if (dmxRange && dmxRange.length >= 2) {
    position = dmxRange[1] === dmxRange[0] ? 0 : (value - dmxRange[0]) / (dmxRange[1] - dmxRange[0]);
  } else {
    position = channel.maxValue > 0 ? value / channel.maxValue : 0;
  }

  return Math.max(0, Math.min(1, position));
}

// the speed between the two ends of a capability, at the passed position
function interpolateSpeed(start: string, end: string, position: number): number {
  const startSpeed = getRotationTurnsPerSecond(start);
  const endSpeed = getRotationTurnsPerSecond(end);

  if (startSpeed === undefined || endSpeed === undefined) {
    return undefined;
  }

  return startSpeed + (endSpeed - startSpeed) * position;
}

// the gobo slot a wheel slot capability puts in, if it is one (a capability between two slots shows the first)
function getGoboSlot(capability: CachedFixtureCapability): { slot: FixtureWheelSlot; slotNumber: number; wheel: string } {
  const slotNumber = capability.capability.slotNumber;

  if (slotNumber === undefined || slotNumber === null || !capability.wheelSlots) {
    return undefined;
  }

  for (let i = 0; i < capability.wheelSlots.length; i++) {
    const slot = capability.wheelSlots[i];

    if (slot && (slot.type === FixtureWheelSlotType.Gobo || slot.type === FixtureWheelSlotType.AnimationGoboStart)) {
      return { slot, slotNumber: i === 0 ? Math.floor(slotNumber) : Math.ceil(slotNumber), wheel: capability.wheelName };
    }
  }

  return undefined;
}

// The gobo the fixture shows at the passed values, turned as far as its rotation has turned it by the passed time and
// shaken by its shake, or undefined while it shows none (its gobo wheel open, or it has none)
export function getGoboState(
  fixture: CachedFixture,
  channelValues: FixtureChannelValue[],
  getChannel: (channelName: string) => CachedFixtureChannel,
  getCapabilityInValue: (channel: CachedFixtureChannel, value: number) => CachedFixtureCapability,
  timeMillis: number,
  goboPatterns: GoboPatternChoice[] = []
): GoboState {
  if (!fixture || !channelValues) {
    return undefined;
  }

  let gobo: { slot: FixtureWheelSlot; slotNumber: number; wheel: string };
  // how fast the gobo turns in its slot (turns per second), the angle it is indexed to (radians), how fast it shakes
  let turnsPerSecond = 0;
  let indexAngle = 0;
  let shakeSpeed = 0;

  for (const channelValue of channelValues) {
    const channel = getChannel(channelValue.channelName);

    if (!channel) {
      continue;
    }

    const capability = getCapabilityInValue(channel, channelValue.value);

    if (!capability) {
      continue;
    }

    switch (capability.capability.type) {
      case FixtureCapabilityType.WheelSlot: {
        const slot = getGoboSlot(capability);

        if (slot) {
          gobo = slot;
        }
        break;
      }
      case FixtureCapabilityType.WheelShake: {
        const slot = getGoboSlot(capability);

        if (slot) {
          gobo = slot;
          const position = getPosition(channel, capability, channelValue.value);
          const start = capability.capability.shakeSpeedStart || capability.capability.shakeSpeed;
          const end = capability.capability.shakeSpeedEnd || capability.capability.shakeSpeed;
          const startRank = getPropertyRank(start);
          const endRank = getPropertyRank(end);
          // from slow to fast where the profile tells which way, from 1 to 5 shakes a second
          const reversed = startRank !== undefined && endRank !== undefined && startRank > endRank;
          shakeSpeed = 1 + 4 * (reversed ? 1 - position : position);
        }
        break;
      }
      case FixtureCapabilityType.WheelSlotRotation: {
        const position = getPosition(channel, capability, channelValue.value);
        const speed = interpolateSpeed(
          capability.capability.speedStart || capability.capability.speed,
          capability.capability.speedEnd || capability.capability.speed,
          position
        );

        if (speed !== undefined) {
          turnsPerSecond = speed;
        } else {
          // turned to an angle instead (an indexed gobo)
          const start = getPropertyRank(capability.capability.angleStart || capability.capability.angle);
          const end = getPropertyRank(capability.capability.angleEnd || capability.capability.angle);

          if (start !== undefined && end !== undefined && Number.isFinite(start) && Number.isFinite(end)) {
            indexAngle = ((start + (end - start) * position) * Math.PI) / 180;
          }
        }
        break;
      }
    }
  }

  if (!gobo) {
    return undefined;
  }

  const seconds = timeMillis / 1000;
  let angle = indexAngle + turnsPerSecond * seconds * Math.PI * 2;

  if (shakeSpeed > 0) {
    angle += Math.sin(seconds * shakeSpeed * Math.PI * 2) * 0.35;
  }

  return { pattern: getShownGoboPattern(goboPatterns, fixture.profile?.uuid, gobo.wheel, gobo.slotNumber, gobo.slot.name), angle };
}
