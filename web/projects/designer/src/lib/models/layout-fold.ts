// Where the fold arrows of a row of panels go (or of the rows, from top to bottom). A
// gutter between two open panels has an arrow folding each of them. A panel which is
// folded leaves no room behind: the gutter it was folded into (or a thin strip at the
// edge of the row) has one arrow opening it again.
export interface FoldSpots {
  // the gutters between the open panels (indexes of the panels before and after them) and
  // the panels folded away between them
  gutters: { before: number; after: number; folded: number[] }[];

  // the panels folded away at the start and at the end of the row
  start: number[];
  end: number[];
}

export function getFoldSpots(open: boolean[]): FoldSpots {
  const spots: FoldSpots = { gutters: [], start: [], end: [] };
  let before = -1;
  let folded: number[] = [];

  open.forEach((isOpen, index) => {
    if (!isOpen) {
      folded.push(index);
      return;
    }

    if (before < 0) {
      spots.start = folded;
    } else {
      spots.gutters.push({ before, after: index, folded });
    }

    before = index;
    folded = [];
  });

  if (before < 0) {
    // nothing is open: all of it is folded at the start
    spots.start = folded;
  } else {
    spots.end = folded;
  }

  return spots;
}
