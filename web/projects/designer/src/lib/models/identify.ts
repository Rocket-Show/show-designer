import { CachedFixture } from './cached-fixture';
import { FixtureCapabilityColor, FixtureCapabilityType } from './fixture-capability';
import { FixtureCapabilityValue } from './fixture-capability-value';
import { FixtureWheelSlotType } from './fixture-wheel-slot';

// how long a fixture being identified stays lit, and then dark, while it blinks
export const identifyBlinkMillis = 500;

// the colors lit to make a fixture being identified white
const identifyColors = [
  FixtureCapabilityColor.Red,
  FixtureCapabilityColor.Green,
  FixtureCapabilityColor.Blue,
  FixtureCapabilityColor.White,
  FixtureCapabilityColor['Warm White'],
  FixtureCapabilityColor['Cold White'],
];

function capabilityValue(type: FixtureCapabilityType, valuePercentage: number, color?: FixtureCapabilityColor): FixtureCapabilityValue {
  const value = new FixtureCapabilityValue();
  value.type = type;
  value.valuePercentage = valuePercentage;
  value.color = color;

  return value;
}

// is a fixture being identified lit at the passed time (or dark)? It blinks from the start of the clock on.
export function identifyIsLit(timeMillis: number): boolean {
  return ((Math.floor(timeMillis / identifyBlinkMillis) % 2) + 2) % 2 === 0;
}

// What a fixture being identified from the fixture pool plays on top of the presets, so it can be told apart on the
// stage: it blinks at full white, its shutter and its iris open and its color wheels on their open slot. Whatever else
// the presets do with it stays, e.g. where it points to. Rocket Show identifies it the very same way (Identify).
export function getIdentifyCapabilityValues(cachedFixture: CachedFixture, timeMillis: number): FixtureCapabilityValue[] {
  const level = identifyIsLit(timeMillis) ? 1 : 0;
  const values = [
    capabilityValue(FixtureCapabilityType.Intensity, level),
    ...identifyColors.map((color) => capabilityValue(FixtureCapabilityType.ColorIntensity, level, color)),
    capabilityValue(FixtureCapabilityType.ShutterStrobe, 0),
    capabilityValue(FixtureCapabilityType.Iris, 1),
  ];
  const wheels: string[] = [];

  for (const channel of cachedFixture.channels) {
    for (const channelCapability of channel.capabilities) {
      const open =
        channelCapability.wheelIsColor &&
        channelCapability.wheelSlots.length > 0 &&
        channelCapability.wheelSlots.every((slot) => slot && slot.type === FixtureWheelSlotType.Open);

      if (open && wheels.indexOf(channelCapability.wheelName) < 0) {
        wheels.push(channelCapability.wheelName);

        const slot = new FixtureCapabilityValue();
        slot.type = FixtureCapabilityType.WheelSlot;
        slot.wheel = channelCapability.wheelName;
        slot.slotNumber = channelCapability.capability.slotNumber;
        slot.profileUuid = cachedFixture.profile.uuid;
        values.push(slot);
      }
    }
  }

  return values;
}
