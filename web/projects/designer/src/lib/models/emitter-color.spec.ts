import { FixturePixelGroupResolveService } from '../services/fixture-pixel-group-resolve.service';
import { FixtureService } from '../services/fixture.service';
import { CachedFixtureChannel } from './cached-fixture-channel';
import { getEmitterValues } from './emitter-color';
import { FixtureCapabilityValue } from './fixture-capability-value';
import { FixtureProfile } from './fixture-profile';

const fixtureService = new FixtureService(undefined, undefined, undefined, undefined, undefined, new FixturePixelGroupResolveService());

// the channels of a fixture lighting in the passed colors, one channel each
function channelsOf(...colors: string[]): CachedFixtureChannel[] {
  const availableChannels = {};

  for (const color of colors) {
    availableChannels[color] = { capability: { type: 'ColorIntensity', color } };
  }

  const profile = new FixtureProfile({
    uuid: 'profile',
    availableChannels,
    modes: [{ name: 'Mode', shortName: 'mode', channels: colors }],
  });

  return fixtureService.getCachedChannels(profile, profile.modes[0], null);
}

function color(name: string, valuePercentage: number): FixtureCapabilityValue {
  return new FixtureCapabilityValue({ type: 'ColorIntensity', color: name, valuePercentage });
}

function percentages(values: FixtureCapabilityValue[]): { [color: string]: number } {
  const result = {};

  for (const value of values) {
    result[value.color || value.type] = Math.round(value.valuePercentage * 1000) / 1000;
  }

  return result;
}

describe('emitter-color', () => {
  const rgbw = channelsOf('Red', 'Green', 'Blue', 'White');
  const orange = [color('Red', 1), color('Green', 0.6), color('Blue', 0.4)];

  it('should light the white part of the colors on the white LEDs, if the preset asks for it', () => {
    expect(percentages(getEmitterValues(orange, rgbw, true))).toEqual({ Red: 0.6, Green: 0.2, Blue: 0, White: 0.4 });

    // not asked for, a white set by the step itself, a fixture without white or without red, green and blue
    expect(getEmitterValues(orange, rgbw, false)).toBe(orange);
    expect(percentages(getEmitterValues([...orange, color('White', 0.1)], rgbw, true))).toEqual({
      Red: 1,
      Green: 0.6,
      Blue: 0.4,
      White: 0.1,
    });
    expect(getEmitterValues(orange, channelsOf('Red', 'Green', 'Blue'), true)).toBe(orange);
    expect(getEmitterValues(orange, channelsOf('White', 'Amber'), true)).toBe(orange);
    expect(getEmitterValues([color('Red', 1)], rgbw, true)).toEqual([color('Red', 1)]);
  });

  it('should play the color temperature on a warm and a cold white, without a channel of its own for it', () => {
    const bicolor = channelsOf('Warm White', 'Cold White');
    const temperature = (value: number, ...more: FixtureCapabilityValue[]) =>
      percentages(
        getEmitterValues([new FixtureCapabilityValue({ type: 'ColorTemperature', valuePercentage: value }), ...more], bicolor, false)
      );

    expect(temperature(0)).toEqual({ ColorTemperature: 0, 'Warm White': 1, 'Cold White': 0 });
    expect(temperature(0.25)).toEqual({ ColorTemperature: 0.25, 'Warm White': 1, 'Cold White': 0.5 });
    expect(temperature(0.5)).toEqual({ ColorTemperature: 0.5, 'Warm White': 1, 'Cold White': 1 });
    expect(temperature(1)).toEqual({ ColorTemperature: 1, 'Warm White': 0, 'Cold White': 1 });

    // a warm white set by the step itself wins
    expect(temperature(1, color('Warm White', 0.3))).toEqual({ ColorTemperature: 1, 'Warm White': 0.3, 'Cold White': 1 });

    // a fixture with a channel of its own for the color temperature plays it there
    const ctoProfile = new FixtureProfile({
      uuid: 'cto',
      availableChannels: {
        CTO: { capability: { type: 'ColorTemperature', colorTemperatureStart: 'warm', colorTemperatureEnd: 'cold' } },
        'Warm White': { capability: { type: 'ColorIntensity', color: 'Warm White' } },
        'Cold White': { capability: { type: 'ColorIntensity', color: 'Cold White' } },
      },
      modes: [{ name: 'Mode', shortName: 'mode', channels: ['CTO', 'Warm White', 'Cold White'] }],
    });
    const cto = fixtureService.getCachedChannels(ctoProfile, ctoProfile.modes[0], null);
    const values = [new FixtureCapabilityValue({ type: 'ColorTemperature', valuePercentage: 1 })];
    expect(getEmitterValues(values, cto, false)).toBe(values);
  });
});
