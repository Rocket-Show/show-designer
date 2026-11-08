import {
  FanStop,
  getFanFactor,
  getFanMiddleValue,
  getFanPlace,
  getFanStops,
  getFanValue,
  getFixtureFanValues,
  getSpreadOffset,
  getStageFanPlaces,
  isFanned,
  isFanTransition,
  isStageFanOrder,
  readFanStops,
} from './fan';
import { FixtureCapabilityValue } from './fixture-capability-value';

function value(type: string, data: any): FixtureCapabilityValue {
  return new FixtureCapabilityValue({ type, ...data });
}

function stops(...pairs: number[][]): FanStop[] {
  return pairs.map(([position, valuePercentage]) => new FanStop({ position, valuePercentage }));
}

describe('fan', () => {
  it('should place a fixture in the order of its preset, or where the preset fans it on the stage', () => {
    expect(getFanPlace({ fixtureIndex: 0, fixtureCount: 5 })).toBe(0);
    expect(getFanPlace({ fixtureIndex: 1, fixtureCount: 5 })).toBe(0.25);
    expect(getFanPlace({ fixtureIndex: 4, fixtureCount: 5 })).toBe(1);

    // a single fixture can't be told apart from others, nor can fixtures at the same place on the stage
    expect(getFanPlace({ fixtureIndex: 0, fixtureCount: 1 })).toBeUndefined();
    expect(getFanPlace({ fixtureIndex: 2, fixtureCount: 5, fanPlace: 0.7 })).toBe(0.7);
    expect(getFanPlace({ fixtureIndex: 2, fixtureCount: 5, fanPlace: NaN })).toBeUndefined();
    expect(getFanPlace(undefined)).toBeUndefined();
  });

  it('should place the parts of a preset along the stage', () => {
    const positions = [
      [-100, 400, 200],
      [300, 400, -100],
      [100, 0, 0],
    ];

    expect(getStageFanPlaces(positions, 'left-right')).toEqual([0, 1, 0.5]);
    // from the front (towards z) to the back
    expect(getStageFanPlaces(positions, 'front-back')).toEqual([0, 1, 2 / 3]);
    expect(getStageFanPlaces(positions, 'bottom-top')).toEqual([1, 1, 0]);

    // all of them at the same height: none of them can be told apart
    expect(getStageFanPlaces([positions[0], positions[1]], 'bottom-top').every((place) => isNaN(place))).toBe(true);

    expect(isStageFanOrder('left-right')).toBe(true);
    expect(isStageFanOrder('preset')).toBe(false);
    expect(isStageFanOrder(undefined)).toBe(false);
  });

  it('should take the value of a fan between its stops', () => {
    const ramp = stops([0, 0.2], [1, 1]);

    expect(getFanValue(ramp, 0)).toBe(0.2);
    expect(getFanValue(ramp, 0.5)).toBeCloseTo(0.6, 12);
    expect(getFanValue(ramp, 1)).toBe(1);
    // a fixture which can't be told apart from the others is in the middle
    expect(getFanValue(ramp, undefined)).toBeCloseTo(0.6, 12);

    // the stops in any order, the ends held beyond them
    const unsorted = stops([0.75, 1], [0.25, 0]);
    expect(getFanValue(unsorted, 0)).toBe(0);
    expect(getFanValue(unsorted, 0.5)).toBe(0.5);
    expect(getFanValue(unsorted, 1)).toBe(1);
  });

  it('should write and read the fans of the two shapes', () => {
    const linear = getFanStops('linear', 0.2, 0.9);
    expect(linear.map((stop) => [stop.position, stop.valuePercentage])).toEqual([
      [0, 0.2],
      [1, 0.9],
    ]);
    expect(readFanStops(linear)).toEqual({ shape: 'linear', from: 0.2, to: 0.9 });

    // from the middle out to both ends
    const center = getFanStops('center', 0.1, 0.8);
    expect(center.map((stop) => [stop.position, stop.valuePercentage])).toEqual([
      [0, 0.8],
      [0.5, 0.1],
      [1, 0.8],
    ]);
    expect(readFanStops(center)).toEqual({ shape: 'center', from: 0.1, to: 0.8 });

    // the value a player not knowing the fans plays on all the fixtures: the one of the fixture in the middle
    expect(getFanMiddleValue(center)).toBe(0.1);
    expect(getFanMiddleValue(linear)).toBeCloseTo(0.55, 12);
  });

  it('should spread degrees from the first to the last fixture, or from the middle out to both ends', () => {
    expect(getSpreadOffset(60, undefined, 0)).toBe(-30);
    expect(getSpreadOffset(60, 'linear', 1)).toBe(30);
    expect(getSpreadOffset(60, 'linear', undefined)).toBe(0);
    expect(getSpreadOffset(60, 'center', 0.5)).toBe(-30);
    expect(getSpreadOffset(60, 'center', 0)).toBe(30);
    expect(getSpreadOffset(60, 'center', 1)).toBe(30);
    // a single fixture is the middle of the fan
    expect(getSpreadOffset(60, 'center', undefined)).toBe(-30);
    expect(getSpreadOffset(undefined, 'center', 0)).toBe(0);
  });

  it('should move the fixtures of an effect as far as their place says', () => {
    expect(getFanFactor('none', 0)).toBe(1);
    expect(getFanFactor(undefined, 0.3)).toBe(1);
    expect(getFanFactor('linear', 0)).toBe(-1);
    expect(getFanFactor('linear', 0.75)).toBe(0.5);
    expect(getFanFactor('center', 0)).toBe(1);
    expect(getFanFactor('center', 0.5)).toBe(0);
    expect(getFanFactor('side', 0.25)).toBe(0.25);
    // fixtures which can't be told apart don't move
    expect(getFanFactor('side', undefined)).toBe(0);
  });

  it('should tell which values travel for each fixture on its own', () => {
    const fanned = value('Intensity', { valuePercentage: 0.5, fan: [{ position: 0, valuePercentage: 0 }] });
    const plain = value('Intensity', { valuePercentage: 1 });

    expect(isFanned(fanned)).toBe(true);
    expect(isFanned(plain)).toBe(false);
    expect(isFanned(value('Intensity', { fan: [] }))).toBe(false);

    expect(isFanTransition(plain, fanned)).toBe(true);
    expect(isFanTransition(fanned, plain)).toBe(true);
    expect(isFanTransition(plain, value('Intensity', { valuePercentage: 0 }))).toBe(false);
    // a value saying nothing, a slot of a wheel and the pan and the tilt don't
    expect(isFanTransition(value('Intensity', {}), fanned)).toBe(false);
    expect(isFanTransition(value('WheelSlot', { slotNumber: 2 }), fanned)).toBe(false);
    expect(isFanTransition(value('Pan', { valuePercentage: 0.5 }), value('Pan', { fan: [{ position: 0, valuePercentage: 1 }] }))).toBe(
      false
    );
  });

  it('should work the fans out for a fixture, travelling for each fixture on its own', () => {
    const red = value('ColorIntensity', {
      color: 'Red',
      valuePercentage: 0.5,
      fan: [
        { position: 0, valuePercentage: 0 },
        { position: 1, valuePercentage: 1 },
      ],
    });
    const dimmer = value('Intensity', { valuePercentage: 1 });
    const pan = value('Pan', { valueDegrees: 10, spreadDegrees: 40 });
    const values = [dimmer, red, pan];

    const first = getFixtureFanValues(values, { fixtureIndex: 0, fixtureCount: 3 });
    expect(first[0]).toBe(dimmer);
    expect(first[1].valuePercentage).toBe(0);
    expect(first[1].fan).toBeUndefined();
    expect(first[1].color).toBe(red.color);
    expect(first[2]).toBe(pan);
    expect(getFixtureFanValues(values, { fixtureIndex: 2, fixtureCount: 3 })[1].valuePercentage).toBe(1);

    // nothing fanned: the values themselves
    expect(getFixtureFanValues([dimmer, pan], { fixtureIndex: 0, fixtureCount: 3 })).toEqual([dimmer, pan]);

    // a quarter of the way from a single value into the fan
    const between = value('ColorIntensity', { color: 'Red', valuePercentage: 0.5, fan: red.fan });
    between.transitionFrom = value('ColorIntensity', { color: 'Red', valuePercentage: 0.4 });
    between.transitionPosition = 0.25;
    expect(getFixtureFanValues([between], { fixtureIndex: 2, fixtureCount: 3 })[0].valuePercentage).toBeCloseTo(0.55, 12);
    expect(getFixtureFanValues([between], { fixtureIndex: 0, fixtureCount: 3 })[0].valuePercentage).toBeCloseTo(0.3, 12);

    // and out of it again
    const out = value('ColorIntensity', { color: 'Red', valuePercentage: 0.4 });
    out.transitionFrom = red;
    out.transitionPosition = 0.5;
    const placed = getFixtureFanValues([out], { fixtureIndex: 2, fixtureCount: 3 })[0];
    expect(placed.valuePercentage).toBeCloseTo(0.7, 12);
    expect(placed.transitionFrom).toBeUndefined();
  });

  it('should take the values of a fan in steps, each stop sharing the fan evenly', () => {
    const colors = stops([0, 1], [0.5, 0.5], [1, 0]);

    expect(getFanValue(colors, 0, 'steps')).toBe(1);
    expect(getFanValue(colors, 0.33, 'steps')).toBe(1);
    expect(getFanValue(colors, 0.34, 'steps')).toBe(0.5);
    expect(getFanValue(colors, 0.9, 'steps')).toBe(0);
    expect(getFanValue(colors, 1, 'steps')).toBe(0);

    // every other fixture in the other color: two stops, the places 0 and 1 of a pattern repeated every 2
    expect(getFanValue(stops([0, 1], [1, 0]), 0, 'steps')).toBe(1);
    expect(getFanValue(stops([0, 1], [1, 0]), 1, 'steps')).toBe(0);
  });
});
