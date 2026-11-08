import { FanStop } from './fan-stop';
import { FixtureCapabilityType } from './fixture-capability';
import { FixtureCapabilityValue } from './fixture-capability-value';

export { FanStop } from './fan-stop';

// Fanning a value out over the fixtures of a preset: each fixture takes its own value by its place in the fan, from 0
// (the first fixture) to 1 (the last one). The place is where the fixture is in the order of the preset, or where it is
// on the stage (see Preset.fanOrder). A dimmer, a zoom or any other value with a percentage is fanned by stops along
// the fan, each of red, green and blue as well, which spans a gradient of colors over the fixtures (and approximates it
// on a color wheel). The pan and the tilt are fanned over a number of degrees (see pan-tilt), an effect moves each
// fixture as far as its place says (see EffectCurve.fanMode). Rocket Show fans them the very same way (Fan).

// how the fixtures of a preset are put in the order of a fan: in the order of the preset, or by where they are on the
// stage (their pixels each on its own), from the left to the right, from the front to the back or from the bottom to
// the top
export type FanOrder = 'preset' | 'left-right' | 'front-back' | 'bottom-top';
export const fanOrders: FanOrder[] = ['preset', 'left-right', 'front-back', 'bottom-top'];

// how a fan spreads a value over the fixtures: from the first to the last one ('linear'), or from the middle out to
// both ends ('center')
export type FanShape = 'linear' | 'center';
export const fanShapes: FanShape[] = ['linear', 'center'];

// how far an effect moves each fixture by its place in the fan: all of them the same ('none'), the first and the last
// the most to opposite sides ('linear'), the first and the last the most the same way ('center'), from none at the
// first one to the most at the last one ('side'). The one in the middle doesn't move, except from the first one.
export const fanModes = ['none', 'linear', 'center', 'side'];

// what places a fixture in the fan of its preset: its place in the order of the preset, and its place on the stage if
// the preset fans by it (NaN, if the fixtures of the preset can't be told apart there)
export interface FanContext {
  fixtureIndex: number;
  fixtureCount: number;
  fanPlace?: number;
}

function isNumber(value: number): boolean {
  return typeof value === 'number' && !isNaN(value);
}

// Where a fixture is in the fan of its preset, from 0 (the first one) to 1 (the last one), or undefined if the fixtures
// can't be told apart: a single one, or all of them at the same place on the stage.
export function getFanPlace(context: FanContext): number {
  if (!context) {
    return undefined;
  }

  if (context.fanPlace !== undefined && context.fanPlace !== null) {
    return isNumber(context.fanPlace) ? context.fanPlace : undefined;
  }

  return !(context.fixtureCount >= 2) ? undefined : (context.fixtureIndex || 0) / (context.fixtureCount - 1);
}

// Where each of the parts of a preset at the passed places on the stage (in cm, y up, the front of the stage towards
// z) is in a fan in the passed order, from 0 to 1, NaN for all of them if they are all at the same place
export function getStageFanPlaces(positions: number[][], order: FanOrder): number[] {
  const coordinates = positions.map((position) =>
    order === 'front-back' ? -position[2] : order === 'bottom-top' ? position[1] : position[0]
  );
  let min = Number.MAX_VALUE;
  let max = -Number.MAX_VALUE;

  for (const coordinate of coordinates) {
    min = Math.min(min, coordinate);
    max = Math.max(max, coordinate);
  }

  return coordinates.map((coordinate) => (max > min ? (coordinate - min) / (max - min) : NaN));
}

// does the preset fan its fixtures by where they are on the stage?
export function isStageFanOrder(order: string): boolean {
  return order === 'left-right' || order === 'front-back' || order === 'bottom-top';
}

// is the value fanned out over the fixtures by stops of its own?
export function isFanned(value: FixtureCapabilityValue): boolean {
  return !!value && Array.isArray(value.fan) && value.fan.length > 0;
}

// The value of a fan at a place along it: the one of a stop right there, in between the stops around it, the first and
// the last one beyond them. Of two stops at the same place (a hard edge), the first one is taken right there. A fixture
// which can't be told apart from the others is in the middle.
export function getFanValue(stops: FanStop[], place: number): number {
  const position = place === undefined ? 0.5 : place;
  const sorted = stops.slice().sort((stop1, stop2) => stop1.position - stop2.position);

  if (position <= sorted[0].position) {
    return sorted[0].valuePercentage;
  }

  for (let i = 1; i < sorted.length; i++) {
    if (position === sorted[i].position) {
      return sorted[i].valuePercentage;
    }

    if (position < sorted[i].position) {
      const from = sorted[i - 1];
      const to = sorted[i];

      return (
        from.valuePercentage + (to.valuePercentage - from.valuePercentage) * ((position - from.position) / (to.position - from.position))
      );
    }
  }

  return sorted[sorted.length - 1].valuePercentage;
}

// the stops of a fan from the first to the last fixture, or from the middle out to both ends
export function getFanStops(shape: FanShape, from: number, to: number): FanStop[] {
  if (shape === 'center') {
    return [
      new FanStop({ position: 0, valuePercentage: to }),
      new FanStop({ position: 0.5, valuePercentage: from }),
      new FanStop({ position: 1, valuePercentage: to }),
    ];
  }

  return [new FanStop({ position: 0, valuePercentage: from }), new FanStop({ position: 1, valuePercentage: to })];
}

// what the stops of a fan say: its shape and the values it fans between (of the first and the last fixture, or of
// the one in the middle and of the ends)
export function readFanStops(stops: FanStop[]): { shape: FanShape; from: number; to: number } {
  if (
    stops.length === 3 &&
    stops[0].position === 0 &&
    stops[1].position === 0.5 &&
    stops[2].position === 1 &&
    stops[0].valuePercentage === stops[2].valuePercentage
  ) {
    return { shape: 'center', from: stops[1].valuePercentage, to: stops[0].valuePercentage };
  }

  return { shape: 'linear', from: getFanValue(stops, 0), to: getFanValue(stops, 1) };
}

// The value a fan is saved with besides its stops, which a player not knowing the fans plays on all of the fixtures:
// the one of the fixture in the middle
export function getFanMiddleValue(stops: FanStop[]): number {
  return getFanValue(stops, 0.5);
}

// The offset of a fixture in a fan spread over a number of degrees (or of percent) around its middle: from the first
// to the last one by half of them to either side, or from the one in the middle by half of them to one side out to
// both ends by half of them to the other. A fixture which can't be told apart from the others is in the middle.
export function getSpreadOffset(spread: number, shape: string, place: number): number {
  if (!isNumber(spread)) {
    return 0;
  }

  if (shape === 'center') {
    const position = place === undefined ? 0.5 : place;

    return spread * (Math.abs(2 * position - 1) - 0.5);
  }

  if (place === undefined) {
    return 0;
  }

  return spread * (place - 0.5);
}

// How much of its movement an effect makes on a fixture by its place in the fan (see fanModes): from -1 to 1, a
// fixture which can't be told apart from the others not moving at all
export function getFanFactor(fanMode: string, place: number): number {
  if (fanMode !== 'linear' && fanMode !== 'center' && fanMode !== 'side') {
    return 1;
  }

  if (place === undefined) {
    return 0;
  }

  if (fanMode === 'linear') {
    return 2 * place - 1;
  }

  return fanMode === 'center' ? Math.abs(2 * place - 1) : place;
}

// Does a preset travelling from the one value to the other work it out for each fixture on its own: a value with a
// percentage travelling from a fan or into one (from one gradient of colors to the next, or from a single color to a
// gradient)? Both have to say what to put on the fixtures, and neither is a slot of a wheel, which can't stand in
// between two of them. The pan and the tilt travel in degrees (see pan-tilt).
export function isFanTransition(from: FixtureCapabilityValue, to: FixtureCapabilityValue): boolean {
  if (to.type === FixtureCapabilityType.Pan || to.type === FixtureCapabilityType.Tilt) {
    return false;
  }

  if (to.slotNumber != null || from.slotNumber != null) {
    return false;
  }

  const says = (value: FixtureCapabilityValue) => isFanned(value) || value.valuePercentage >= 0;

  return (isFanned(from) || isFanned(to)) && says(from) && says(to);
}

// the percentage a value puts on a fixture at a place in the fan: of its stops, if it is fanned
function getPlacedPercentage(value: FixtureCapabilityValue, place: number): number {
  return isFanned(value) ? getFanValue(value.fan, place) : value.valuePercentage;
}

// Does the value need to be worked out for each fixture on its own: a fan, or travelling from or into one? Not the pan
// and the tilt, which are worked out where they are played (see pan-tilt).
function isPlaced(value: FixtureCapabilityValue): boolean {
  if (value.type === FixtureCapabilityType.Pan || value.type === FixtureCapabilityType.Tilt) {
    return false;
  }

  return isFanned(value) || (!!value.transitionFrom && isFanned(value.transitionFrom));
}

// The values a preset puts on one fixture: the fans worked out for the place of the fixture, travelling from the fan of
// the step before (or into one) for each fixture on its own. Everything else is left as it is: the pan and the tilt are
// worked out where they are played (see pan-tilt). The passed values are returned as they are if nothing is fanned.
export function getFixtureFanValues(values: FixtureCapabilityValue[], context: FanContext): FixtureCapabilityValue[] {
  if (!values.some((value) => isPlaced(value))) {
    return values;
  }

  const place = getFanPlace(context);

  return values.map((value) => {
    if (!isPlaced(value)) {
      return value;
    }

    const placed = new FixtureCapabilityValue(value);
    placed.fan = undefined;

    if (value.transitionFrom) {
      const from = getPlacedPercentage(value.transitionFrom, place);
      const to = getPlacedPercentage(value, place);
      placed.valuePercentage = from + (to - from) * value.transitionPosition;
    } else {
      placed.valuePercentage = getFanValue(value.fan, place);
    }

    return placed;
  });
}
