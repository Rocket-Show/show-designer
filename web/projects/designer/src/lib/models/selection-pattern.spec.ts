import { getPatternPlace, hasPattern } from './selection-pattern';

function places(count: number, groupSize: number, wings: number, every: number): string {
  return Array.from({ length: count }, (_, index) => {
    const place = getPatternPlace(index, count, groupSize, wings, every);
    return place.index + '/' + place.count;
  }).join(' ');
}

describe('selection-pattern', () => {
  it('should keep the order of the preset without a pattern', () => {
    expect(places(4, 1, 1, 0)).toBe('0/4 1/4 2/4 3/4');
    expect(places(4, undefined, undefined, undefined)).toBe('0/4 1/4 2/4 3/4');
    expect(hasPattern(1, 1, 0)).toBe(false);
    expect(hasPattern(1, 2, 0)).toBe(true);
  });

  it('should put the fixtures of a group in the same place', () => {
    expect(places(6, 2, 1, 0)).toBe('0/3 0/3 1/3 1/3 2/3 2/3');
    // a group the fixtures don't fill
    expect(places(5, 2, 1, 0)).toBe('0/3 0/3 1/3 1/3 2/3');
  });

  it('should run every other wing the other way round', () => {
    expect(places(6, 1, 2, 0)).toBe('0/3 1/3 2/3 2/3 1/3 0/3');
    // an odd count: the middle one alone, the last wing ending with the last fixture
    expect(places(5, 1, 2, 0)).toBe('0/3 1/3 2/3 1/3 0/3');
    expect(places(6, 1, 3, 0)).toBe('0/2 1/2 1/2 0/2 0/2 1/2');
  });

  it('should repeat the places every so many fixtures', () => {
    expect(places(5, 1, 1, 2)).toBe('0/2 1/2 0/2 1/2 0/2');
    expect(places(6, 1, 1, 3)).toBe('0/3 1/3 2/3 0/3 1/3 2/3');
  });

  it('should group, fold into wings and repeat one after the other', () => {
    // 12 fixtures in groups of 2 (6 places), in 2 wings (3 places each), every other one
    expect(places(12, 2, 2, 2)).toBe('0/2 0/2 1/2 1/2 0/2 0/2 0/2 0/2 1/2 1/2 0/2 0/2');
  });
});
