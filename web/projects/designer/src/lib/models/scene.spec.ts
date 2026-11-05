import { Scene } from './scene';

describe('Scene', () => {
  it('should start a new scene at full, marked by its presets, open in the tree and fading linearly', () => {
    const fresh = new Scene();

    expect(fresh.dimmer).toBe(1);
    expect(fresh.colorAuto).toBe(true);
    expect(fresh.expanded).toBe(true);
    expect(fresh.presetUuids).toEqual([]);
    expect(fresh.fadeInCurve).toBe('linear');
    expect(fresh.fadeOutCurve).toBe('linear');
  });

  it('should read a scene of a project which does not say how it is marked, shown, placed or faded', () => {
    const old = new Scene({ uuid: 'scene', name: 'Scene' });

    expect(old.sortIndex).toBe(0);
    expect(old.colorAuto).toBe(true);
    expect(old.expanded).toBe(true);
    expect(old.dimmer).toBe(1);
    expect(old.fadeInCurve).toBe('linear');
    expect(old.fadeOutCurve).toBe('linear');
  });

  it('should keep a scene marked with a color picked for it, folded in the tree, placed and fading in a curve', () => {
    const stored = new Scene({ sortIndex: 2, colorAuto: false, expanded: false, fadeInCurve: 'ease-out', fadeOutCurve: 'ease-in-out' });

    expect(stored.sortIndex).toBe(2);
    expect(stored.colorAuto).toBe(false);
    expect(stored.expanded).toBe(false);
    expect(stored.fadeInCurve).toBe('ease-out');
    expect(stored.fadeOutCurve).toBe('ease-in-out');
  });
});
