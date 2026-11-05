import { ArraySortPipe } from './array-sort-pipe';

// The lists of the project dialogs are shown sorted by a field of their entries, e.g. the
// projects by their name.
describe('ArraySortPipe', () => {
  const pipe = new ArraySortPipe();

  it('sorts the entries by the passed field', () => {
    const projects = [{ name: 'Rock' }, { name: 'Ballad' }, { name: 'Punk' }];

    expect(pipe.transform(projects, 'name').map((project) => project.name)).toEqual(['Ballad', 'Punk', 'Rock']);
  });

  it('keeps entries with the same value in their order', () => {
    const projects = [
      { id: 1, name: 'Show' },
      { id: 2, name: 'Intro' },
      { id: 3, name: 'Show' },
    ];

    expect(pipe.transform(projects, 'name').map((project) => project.id)).toEqual([2, 1, 3]);
  });

  it('sorts numbers by their value', () => {
    expect(pipe.transform([{ id: 10 }, { id: 9 }, { id: 100 }], 'id').map((project) => project.id)).toEqual([9, 10, 100]);
  });

  it('shows nothing while there is no list yet', () => {
    expect(pipe.transform(undefined, 'name')).toBeUndefined();
    expect(pipe.transform({ name: 'Show' }, 'name')).toBeUndefined();
  });
});
