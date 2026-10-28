import { LayoutService } from './layout.service';

describe('LayoutService', () => {
  beforeEach(() => {
    localStorage.removeItem('designerLayout');
  });

  afterEach(() => {
    localStorage.removeItem('designerLayout');
  });

  it('opens everything at first', () => {
    const service = new LayoutService();

    expect(service.folded).toEqual([]);
    expect(service.layout).toBe('default');
  });

  it('folds and opens panels, and forgets the layout picked before', () => {
    const service = new LayoutService();
    let changes = 0;
    service.changed.subscribe(() => changes++);

    service.fold(['presets']);
    service.toggle('timeline');

    expect(service.isFolded('presets')).toBe(true);
    expect(service.isFolded('timeline')).toBe(true);
    expect(service.layout).toBeUndefined();
    expect(changes).toBe(2);

    service.open(['presets', 'timeline']);

    expect(service.folded).toEqual([]);
  });

  it('folds a row, once all of its panels are folded', () => {
    const service = new LayoutService();

    service.fold(['editor', 'fixtures']);
    expect(service.isRowFolded(1)).toBe(false);

    service.fold(['master']);
    expect(service.isRowFolded(1)).toBe(true);
  });

  it('applies a layout with its folded panels', () => {
    const service = new LayoutService();
    service.fold(['scenes']);

    service.applyLayout('show');

    expect(service.layout).toBe('show');
    expect(service.isFolded('scenes')).toBe(false);
    expect(service.isRowFolded(1)).toBe(true);
    expect(service.isFolded('timeline')).toBe(false);
  });

  it('shares the room between the open panels only, and keeps the share of a folded one', () => {
    const service = new LayoutService();

    // scenes, presets and preview share 20 : 20 : 60. Without the presets: 25 : 75
    expect(service.getSizes(['scenes', 'preview'])).toEqual([25, 75]);

    // the scenes get half of the room they share with the preview
    service.resized(['scenes', 'preview'], [50, 50]);

    expect(service.getSizes(['scenes', 'preview'])).toEqual([50, 50]);
    expect(service.getSizes(['scenes', 'presets', 'preview'])).toEqual([40, 20, 40]);
  });

  it('keeps the layout for the next visit', () => {
    const service = new LayoutService();
    service.applyLayout('stage');
    service.resized(['scenes', 'preview'], [30, 70]);

    const next = new LayoutService();

    expect(next.folded).toEqual(service.folded);
    expect(next.getSizes(['scenes', 'preview'])).toEqual([30, 70]);
  });

  it('starts with everything open, if the stored layout cannot be read', () => {
    localStorage.setItem('designerLayout', '{broken');

    expect(new LayoutService().folded).toEqual([]);
  });
});
