import { FixtureProfile } from './fixture-profile';
import { PixelContext } from './pixel-pattern';
import { pixelHousingSize, pixelStagePosition, stagePixelPlaces } from './pixel-stage';

// where a pixel is in its fixture: its column of a bar of the passed number of pixels
function placeIn(column: number, columns: number): PixelContext {
  return Object.assign(new PixelContext(), { x: (column + 0.5) / columns, y: 0.5, column, columns });
}

const round = (values: number[]) => values.map((value) => Math.round(value * 1000) / 1000);

describe('pixel stage', () => {
  it('makes the housing as large as the profile says, or as large as its pixels need', () => {
    expect(pixelHousingSize(new FixtureProfile({ physical: { dimensions: [1057, 154, 64] } }), 12, 1)).toEqual([105.7, 15.4, 6.4]);
    expect(pixelHousingSize(new FixtureProfile({}), 12, 2)).toEqual([96, 16, 7]);
    // a size of 0 is none
    expect(pixelHousingSize(new FixtureProfile({ physical: { dimensions: [0, 50, 0] } }), 3, 1)).toEqual([24, 5, 7]);
  });

  it('places the LEDs on the front of the housing, the housing below the truss or on the floor', () => {
    const size = [24, 8, 6];
    const hanging = { position: [100, 367, 230], rotation: [0, 0, 0] };
    const standing = { position: [100, 43, 230], rotation: [180, 0, 0] };

    // the first of three pixels a third of the housing left of its middle, the top of the housing 8 cm above where its
    // fixture is placed, the LEDs facing the audience
    expect(round(pixelStagePosition(placeIn(0, 3), size, hanging, 'topFront'))).toEqual([92, 371, 233]);
    // on the floor the housing stands above it, upright and facing the audience as well
    expect(round(pixelStagePosition(placeIn(0, 3), size, standing, 'bottomFront'))).toEqual([92, 39, 233]);
    // placed by hand, the housing is turned around its middle
    expect(round(pixelStagePosition(placeIn(0, 3), size, { position: [0, 200, 0], rotation: [0, 0, 90] }, 'manual'))).toEqual([0, 192, 3]);
  });

  it('puts the LEDs into the columns and rows of one picture, framed around them', () => {
    // two bars of three pixels, a meter apart, seen from the front
    const positions = [-208, -200, -192, -108, -100, -92].map((x) => [x, 371, 233]);
    const places = stagePixelPlaces(positions, 'front');

    expect(places.map((place) => place.column)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(places.every((place) => place.columns === 6 && place.rows === 1 && place.y === 0.5)).toBe(true);
    // as far apart as they are on the stage, the first and the last in the middle of a pixel of their own
    expect(round(places.map((place) => place.x))).toEqual([0.083, 0.141, 0.198, 0.802, 0.859, 0.917]);
    expect([places[0].aspectX, places[0].aspectY]).toEqual([1, 0]);
  });

  it('sees the LEDs from above, the back of the stage up, and finds a single one in the middle', () => {
    const places = stagePixelPlaces(
      [
        [0, 371, -230],
        [0, 39, 230],
        [100, 39, 230],
      ],
      'top'
    );

    expect(places.map((place) => [place.column, place.row])).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
    ]);
    expect(places[0].y).toBe(0.25);

    const alone = stagePixelPlaces([[5, 6, 7]], 'front')[0];
    expect([alone.x, alone.y, alone.aspectX, alone.aspectY]).toEqual([0.5, 0.5, 1, 1]);
  });
});
