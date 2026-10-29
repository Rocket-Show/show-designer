import { EffectPanTilt } from './effect-pan-tilt';

describe('EffectPanTilt', () => {
  it('should be shown and put nothing on its channels yet', () => {
    const panTilt = new EffectPanTilt({ uuid: 'circle' });

    expect(panTilt.type).toBe('pan-tilt');
    expect(panTilt.visible).toBe(true);
    expect(panTilt.getValueAtMillis(1000)).toBe(0);
    expect(panTilt.getValueAtMillis(1000, 3)).toBe(0);
  });
});
