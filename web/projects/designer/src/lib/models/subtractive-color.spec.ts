import { FixturePixelGroupResolveService } from '../services/fixture-pixel-group-resolve.service';
import { FixtureService } from '../services/fixture.service';
import { CachedFixtureChannel } from './cached-fixture-channel';
import { FixtureCapabilityColor, FixtureCapabilityType } from './fixture-capability';
import { FixtureCapabilityValue } from './fixture-capability-value';
import { FixtureProfile } from './fixture-profile';
import { getFixtureCapabilityValues, mixesSubtractively } from './subtractive-color';

const fixtureService = new FixtureService(undefined, undefined, undefined, undefined, undefined, new FixturePixelGroupResolveService());

function channelsOf(colors: string[]): CachedFixtureChannel[] {
  const availableChannels = {};

  for (const color of colors) {
    availableChannels[color] = { capability: { type: 'ColorIntensity', color } };
  }

  const profile = new FixtureProfile({
    uuid: 'profile',
    availableChannels: { Dimmer: { capability: { type: 'Intensity' } }, ...availableChannels },
    modes: [{ name: 'Mode', shortName: 'mode', channels: ['Dimmer', ...colors] }],
  });

  return fixtureService.getCachedChannels(profile, profile.modes[0], null);
}

function color(colorName: string, valuePercentage: number, extra: any = {}): FixtureCapabilityValue {
  return new FixtureCapabilityValue({ type: 'ColorIntensity', color: colorName, valuePercentage, ...extra });
}

describe('subtractive-color', () => {
  it('should tell a fixture mixing its colors with filters', () => {
    expect(mixesSubtractively(channelsOf(['Cyan', 'Magenta', 'Yellow']))).toBe(true);
    expect(mixesSubtractively(channelsOf(['Cyan']))).toBe(true);
    expect(mixesSubtractively(channelsOf(['Red', 'Green', 'Blue']))).toBe(false);
    // a fixture lighting red, green and blue lights them, whatever filters it has besides
    expect(mixesSubtractively(channelsOf(['Red', 'Green', 'Blue', 'Cyan']))).toBe(false);
    expect(mixesSubtractively(channelsOf([]))).toBe(false);
    expect(mixesSubtractively([])).toBe(false);
  });

  it('should give a fixture with filters the filters taking away what it does not light', () => {
    const values = getFixtureCapabilityValues(
      [color('Red', 1), color('Green', 0.25), color('Blue', 0), color('White', 0.5)],
      channelsOf(['Cyan', 'Magenta', 'Yellow'])
    );

    expect(values.map((value) => [value.color, value.valuePercentage])).toEqual([
      [FixtureCapabilityColor.Cyan, 0],
      [FixtureCapabilityColor.Magenta, 0.75],
      [FixtureCapabilityColor.Yellow, 1],
      [FixtureCapabilityColor.White, 0.5],
    ]);
  });

  it('should keep what the values drive besides their color', () => {
    const [cyan] = getFixtureCapabilityValues([color('Red', 0.4, { profileUuid: 'profile' })], channelsOf(['Cyan']));

    expect(cyan.type).toBe(FixtureCapabilityType.ColorIntensity);
    expect(cyan.profileUuid).toBe('profile');
    expect(cyan.valuePercentage).toBeCloseTo(0.6, 10);
  });

  it('should leave the values alone for a fixture lighting its colors, and the values without a color', () => {
    const values = [color('Red', 1), new FixtureCapabilityValue({ type: 'Intensity', valuePercentage: 1 }), color('Red', undefined)];

    expect(getFixtureCapabilityValues(values, channelsOf(['Red', 'Green', 'Blue']))).toBe(values);

    const filtered = getFixtureCapabilityValues(values, channelsOf(['Cyan']));
    expect(filtered[1]).toBe(values[1]);
    // a color without a value stays one without a value
    expect(filtered[2]).toBe(values[2]);
  });
});
