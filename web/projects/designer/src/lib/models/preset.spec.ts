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

  it('should keep the mirror of a preset it is read back from', () => {
    const stored = new Preset({ uuid: 'preset', name: 'Preset', mirrorPan: true, mirrorTilt: false });

    expect(stored.mirrorPan).toBe(true);
    expect(stored.mirrorTilt).toBe(false);
    expect(stored.getMirroredValuePercentage(FixtureCapabilityType.Pan, 0.25)).toBe(0.75);
    expect(stored.getMirroredValuePercentage(FixtureCapabilityType.Tilt, 0.25)).toBe(0.25);
  });
});
