import { EffectCurve } from './effect-curve';
import { EffectPanTilt } from './effect-pan-tilt';
import { FixtureCapabilityType } from './fixture-capability';
import { Preset } from './preset';

describe('Preset', () => {
  // a preset mirroring the passed axes
  function preset(mirrorPan: boolean, mirrorTilt: boolean): Preset {
    const mirrored = new Preset();
    mirrored.mirrorPan = mirrorPan;
    mirrored.mirrorTilt = mirrorTilt;

    return mirrored;
  }

  it('should point a preset which mirrors nothing at the position it is written with', () => {
    const plain = preset(false, false);

    expect(plain.getMirroredValuePercentage(FixtureCapabilityType.Pan, 0.25)).toBe(0.25);
    expect(plain.getMirroredValuePercentage(FixtureCapabilityType.Tilt, 0.25)).toBe(0.25);
  });

  it('should mirror the pan of a preset which mirrors the pan, and leave its tilt alone', () => {
    const mirrored = preset(true, false);

    expect(mirrored.getMirroredValuePercentage(FixtureCapabilityType.Pan, 0.25)).toBe(0.75);
    expect(mirrored.getMirroredValuePercentage(FixtureCapabilityType.Tilt, 0.25)).toBe(0.25);
  });

  it('should mirror the tilt of a preset which mirrors the tilt, and leave its pan alone', () => {
    const mirrored = preset(false, true);

    expect(mirrored.getMirroredValuePercentage(FixtureCapabilityType.Pan, 0.25)).toBe(0.25);
    expect(mirrored.getMirroredValuePercentage(FixtureCapabilityType.Tilt, 0.25)).toBe(0.75);
  });

  it('should hold a mirrored axis where it is written to the middle', () => {
    const mirrored = preset(true, true);

    expect(mirrored.getMirroredValuePercentage(FixtureCapabilityType.Pan, 0.5)).toBe(0.5);
    expect(mirrored.getMirroredValuePercentage(FixtureCapabilityType.Tilt, 0.5)).toBe(0.5);
  });

  it('should only mirror the pan and the tilt of a preset', () => {
    const mirrored = preset(true, true);

    expect(mirrored.mirrorsCapability(FixtureCapabilityType.Pan)).toBe(true);
    expect(mirrored.mirrorsCapability(FixtureCapabilityType.Tilt)).toBe(true);
    expect(mirrored.mirrorsCapability(FixtureCapabilityType.Intensity)).toBe(false);
    expect(mirrored.getMirroredValuePercentage(FixtureCapabilityType.Intensity, 0.25)).toBe(0.25);
  });

  it('should mirror nothing on a preset written before the designer knew the mirror', () => {
    const old = new Preset({ uuid: 'preset', name: 'Preset' });

    expect(old.mirrorPan).toBe(false);
    expect(old.mirrorTilt).toBe(false);
    expect(old.getMirroredValuePercentage(FixtureCapabilityType.Pan, 0.25)).toBe(0.25);
  });

  it('should start a new preset on its own, chased in the order of the project, fading linearly', () => {
    const fresh = new Preset();

    expect(fresh.fixtureUuids).toEqual([]);
    expect(fresh.fixtureFolders).toEqual([]);
    expect(fresh.useGlobalFixtureOrder).toBe(true);
    expect(fresh.colorAuto).toBe(true);
    expect(fresh.sortIndex).toBe(0);
    expect(fresh.stepsPhasingMode).toBe('millis');
    expect(fresh.mirrorPan).toBe(false);
    expect(fresh.mirrorTilt).toBe(false);
    expect(fresh.fadeInCurve).toBe('linear');
    expect(fresh.fadeOutCurve).toBe('linear');
  });

  it('should read a preset of a project which does not say how it is chased, marked, placed or faded', () => {
    const old = new Preset({ uuid: 'preset', name: 'Preset' });

    expect(old.sortIndex).toBe(0);
    expect(old.colorAuto).toBe(true);
    expect(old.stepsPhasingMode).toBe('millis');
    expect(old.fadeInCurve).toBe('linear');
    expect(old.fadeOutCurve).toBe('linear');
  });

  it('should keep where a preset is placed, how it is marked and how it fades', () => {
    const stored = new Preset({ sortIndex: 3, colorAuto: false, stepsPhasingMode: 'spread', fadeInCurve: 'ease-in', fadeOutCurve: 'snap' });

    expect(stored.sortIndex).toBe(3);
    expect(stored.colorAuto).toBe(false);
    expect(stored.stepsPhasingMode).toBe('spread');
    expect(stored.fadeInCurve).toBe('ease-in');
    expect(stored.fadeOutCurve).toBe('snap');
  });

  it('should read the curves and the pan and tilt effects of a preset, leaving out effects it does not know', () => {
    const stored = new Preset({
      effects: [{ type: 'pan-tilt', uuid: 'circle' }, { type: 'from-a-newer-designer' }, { type: 'curve', uuid: 'sine' }],
    });

    expect(stored.effects.length).toBe(2);
    expect(stored.effects[0] instanceof EffectPanTilt).toBe(true);
    expect(stored.effects[0].uuid).toBe('circle');
    expect(stored.effects[1] instanceof EffectCurve).toBe(true);
  });

  it('should keep the mirror of a preset it is read back from', () => {
    const stored = new Preset({ uuid: 'preset', name: 'Preset', mirrorPan: true, mirrorTilt: false });

    expect(stored.mirrorPan).toBe(true);
    expect(stored.mirrorTilt).toBe(false);
    expect(stored.getMirroredValuePercentage(FixtureCapabilityType.Pan, 0.25)).toBe(0.75);
    expect(stored.getMirroredValuePercentage(FixtureCapabilityType.Tilt, 0.25)).toBe(0.25);
  });
});
