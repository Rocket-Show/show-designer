import { getFoldSpots } from './layout-fold';

describe('getFoldSpots', () => {
  it('puts a gutter between every two open panels, with nothing folded', () => {
    expect(getFoldSpots([true, true, true])).toEqual({
      gutters: [
        { before: 0, after: 1, folded: [] },
        { before: 1, after: 2, folded: [] },
      ],
      start: [],
      end: [],
    });
  });

  it('folds a panel between two open ones into the gutter between them', () => {
    expect(getFoldSpots([true, false, true])).toEqual({ gutters: [{ before: 0, after: 2, folded: [1] }], start: [], end: [] });
  });

  it('folds the panels at the edges of the row to its edges', () => {
    expect(getFoldSpots([false, true, false])).toEqual({ gutters: [], start: [0], end: [2] });
  });

  it('folds neighbouring panels into the same spot', () => {
    expect(getFoldSpots([true, false, false])).toEqual({ gutters: [], start: [], end: [1, 2] });
  });

  it('folds everything to the start, if nothing is open', () => {
    expect(getFoldSpots([false, false])).toEqual({ gutters: [], start: [0, 1], end: [] });
  });
});
