import { FixturePixelGroupResolveService } from '../services/fixture-pixel-group-resolve.service';
import { FixtureService } from '../services/fixture.service';
import { CachedFixture } from './cached-fixture';
import { FixtureCapabilityColor, FixtureCapabilityType } from './fixture-capability';
import { FixtureProfile } from './fixture-profile';
import { getIdentifyCapabilityValues, identifyBlinkMillis, identifyIsLit } from './identify';

const fixtureService = new FixtureService(undefined, undefined, undefined, undefined, undefined, new FixturePixelGroupResolveService());

function cachedFixtureOf(profileData: any): CachedFixture {
  const profile = new FixtureProfile({ uuid: 'spot', ...profileData });
  const cachedFixture = new CachedFixture();
  cachedFixture.profile = profile;
  cachedFixture.mode = profile.modes[0];
  cachedFixture.channels = fixtureService.getCachedChannels(profile, profile.modes[0], null);

  return cachedFixture;
}

const wheel = (slots: any[]) =>
  cachedFixtureOf({
    availableChannels: {
      'Color Wheel': {
        capabilities: slots.map((slot, index) => ({ dmxRange: [index * 10, index * 10 + 9], type: 'WheelSlot', slotNumber: index + 1 })),
      },
    },
    wheels: { 'Color Wheel': { slots } },
    modes: [{ name: 'Mode', shortName: 'mode', channels: ['Color Wheel'] }],
  });

describe('identify', () => {
  it('should blink, lit first', () => {
    expect(identifyIsLit(0)).toBe(true);
    expect(identifyIsLit(identifyBlinkMillis - 0.1)).toBe(true);
    expect(identifyIsLit(identifyBlinkMillis)).toBe(false);
    expect(identifyIsLit(2 * identifyBlinkMillis)).toBe(true);
    // before the clock started, the other way round
    expect(identifyIsLit(-1)).toBe(false);
    expect(identifyIsLit(-identifyBlinkMillis - 1)).toBe(true);
  });

  it('should light a fixture at full white with its shutter and iris open, and switch it off in between', () => {
    const fixture = cachedFixtureOf({ availableChannels: {}, modes: [{ name: 'Mode', shortName: 'mode', channels: [] }] });
    const lit = getIdentifyCapabilityValues(fixture, 0);
    const dark = getIdentifyCapabilityValues(fixture, identifyBlinkMillis);
    const of = (values, type, colorName?) => values.find((value) => value.type === type && value.color === colorName)?.valuePercentage;

    expect(of(lit, FixtureCapabilityType.Intensity)).toBe(1);
    expect(of(dark, FixtureCapabilityType.Intensity)).toBe(0);

    for (const colorName of ['Red', 'Green', 'Blue', 'White', 'Warm White', 'Cold White']) {
      expect(of(lit, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor[colorName])).toBe(1, colorName);
      expect(of(dark, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor[colorName])).toBe(0, colorName);
    }

    // the colors which make no white are left alone
    expect(of(lit, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.UV)).toBeUndefined();
    expect(of(lit, FixtureCapabilityType.ShutterStrobe)).toBe(0);
    expect(of(dark, FixtureCapabilityType.ShutterStrobe)).toBe(0);
    expect(of(lit, FixtureCapabilityType.Iris)).toBe(1);
  });

  it('should turn a color wheel to its open slot', () => {
    const slots = getIdentifyCapabilityValues(
      wheel([{ type: 'Color', colors: ['#ff0000'] }, { type: 'Open' }, { type: 'Open' }]),
      0
    ).filter((value) => value.type === FixtureCapabilityType.WheelSlot);

    expect(slots.length).toBe(1);
    expect(slots[0].wheel).toBe('Color Wheel');
    expect(slots[0].slotNumber).toBe(2);
    expect(slots[0].profileUuid).toBe('spot');
  });

  it('should leave a color wheel without an open slot to the color it approximates', () => {
    const values = getIdentifyCapabilityValues(
      wheel([
        { type: 'Color', colors: ['#ff0000'] },
        { type: 'Color', colors: ['#ffffff'] },
      ]),
      0
    );

    expect(values.some((value) => value.type === FixtureCapabilityType.WheelSlot)).toBe(false);
  });
});
