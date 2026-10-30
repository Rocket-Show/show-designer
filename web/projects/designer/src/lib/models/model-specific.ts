import { EffectCurve } from './effect-curve';
import { Preset } from './preset';

// The values a preset sets for one model of fixture only, by profile: the values of its channels, the slots of its
// wheels and the other capabilities set for one profile, and the channels its effects drive. They only play on that
// model, unless its fixtures are changed to another model in the fixture pool, which carries them over as far as it
// can (see FixtureExchangeService). What a preset sets as a capability (the dimmer, the color, the strobe, the zoom,
// ...) plays on every model.
export function countModelSpecificValues(preset: Preset): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (profileUuid: string, count = 1) => {
    if (profileUuid && count > 0) {
      counts.set(profileUuid, (counts.get(profileUuid) || 0) + count);
    }
  };

  // a preset of an older project keeps its values itself, until it is given its first step
  const states = preset.steps.length > 0 ? preset.steps : [preset];

  for (const state of states) {
    for (const value of state.fixtureChannelValues || []) {
      add(value.profileUuid);
    }

    for (const value of state.fixtureCapabilityValues || []) {
      add(value.profileUuid);
    }
  }

  for (const effect of preset.effects) {
    if (effect instanceof EffectCurve) {
      for (const profileChannels of effect.channels) {
        add(profileChannels.profileUuid, profileChannels.channels.length);
      }
    }
  }

  return counts;
}
