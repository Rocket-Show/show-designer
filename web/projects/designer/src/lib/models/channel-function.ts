import type { FixtureService } from '../services/fixture.service';
import { FixtureCapability, FixtureCapabilityColor, FixtureCapabilityType } from './fixture-capability';
import { FixtureChannel } from './fixture-channel';
import { FixtureMode } from './fixture-mode';
import { FixtureProfile } from './fixture-profile';
import { FixtureWheelSlotType } from './fixture-wheel-slot';

// What a DMX channel of a fixture does, as the DMX map of the fixture pool shows it on the fixture edited: the name of
// the channel in the profile (e.g. "Pan fine"), an icon for what it does, or the colour of a colour channel. A fine
// channel shows the icon of its channel, fainter. An unused channel ("null" in the fixture library) has no name.
export interface ChannelFunction {
  name: string;
  icon?: string;
  color?: string;
  fine?: boolean;
}

// the colours of the colour channels, bright enough to stand out on the block of the fixture edited
const capabilityColors: { [color in FixtureCapabilityColor]: string } = {
  Red: '#ff4d4d',
  Green: '#3ddc84',
  Blue: '#4d7cff',
  Cyan: '#3fd9f0',
  Magenta: '#ec4dff',
  Yellow: '#ffe14d',
  Amber: '#ffb000',
  White: '#ffffff',
  'Warm White': '#ffe2b0',
  'Cold White': '#e3eeff',
  UV: '#9a5cff',
  Lime: '#c3f53c',
  Indigo: '#6b5cff',
};

// the icon (of the designer's icon font, or of font awesome) for each kind of capability
const capabilityIcons: { [type: string]: string } = {
  [FixtureCapabilityType.NoFunction]: 'icon-no-function',
  [FixtureCapabilityType.ShutterStrobe]: 'icon-strobe',
  [FixtureCapabilityType.StrobeSpeed]: 'icon-strobe',
  [FixtureCapabilityType.StrobeDuration]: 'icon-strobe',
  [FixtureCapabilityType.Intensity]: 'icon-intensity',
  [FixtureCapabilityType.ColorPreset]: 'icon-multi-color',
  [FixtureCapabilityType.ColorTemperature]: 'icon-color-temperature',
  [FixtureCapabilityType.Pan]: 'icon-pan',
  [FixtureCapabilityType.PanContinuous]: 'icon-pan',
  [FixtureCapabilityType.Tilt]: 'icon-tilt',
  [FixtureCapabilityType.TiltContinuous]: 'icon-tilt',
  [FixtureCapabilityType.BeamPosition]: 'icon-pan',
  [FixtureCapabilityType.PanTiltSpeed]: 'icon-speed',
  [FixtureCapabilityType.Speed]: 'icon-speed',
  [FixtureCapabilityType.EffectSpeed]: 'icon-speed',
  [FixtureCapabilityType.WheelShake]: 'icon-gobo',
  [FixtureCapabilityType.WheelSlotRotation]: 'icon-gobo',
  [FixtureCapabilityType.WheelRotation]: 'icon-gobo',
  [FixtureCapabilityType.Focus]: 'icon-focus',
  [FixtureCapabilityType.Zoom]: 'fa fa-search-plus',
  [FixtureCapabilityType.BeamAngle]: 'fa fa-search-plus',
  [FixtureCapabilityType.Iris]: 'icon-iris',
  [FixtureCapabilityType.IrisEffect]: 'icon-iris',
  [FixtureCapabilityType.Frost]: 'fa fa-snowflake-o',
  [FixtureCapabilityType.FrostEffect]: 'fa fa-snowflake-o',
  [FixtureCapabilityType.Prism]: 'icon-prism',
  [FixtureCapabilityType.PrismRotation]: 'icon-prism',
  [FixtureCapabilityType.BladeInsertion]: 'icon-shutter',
  [FixtureCapabilityType.BladeRotation]: 'icon-shutter',
  [FixtureCapabilityType.BladeSystemRotation]: 'icon-shutter',
  [FixtureCapabilityType.Fog]: 'icon-fog',
  [FixtureCapabilityType.FogOutput]: 'icon-fog',
  [FixtureCapabilityType.FogType]: 'icon-fog',
  [FixtureCapabilityType.Rotation]: 'fa fa-repeat',
  [FixtureCapabilityType.Time]: 'fa fa-clock-o',
  [FixtureCapabilityType.Maintenance]: 'icon-maintenance',
  [FixtureCapabilityType.Effect]: 'icon-effect',
  [FixtureCapabilityType.EffectDuration]: 'icon-effect',
  [FixtureCapabilityType.EffectParameter]: 'icon-effect',
  [FixtureCapabilityType.SoundSensitivity]: 'fa fa-microphone',
};

// What each DMX channel of a mode of a profile does, in the order the channels are sent (see
// DmxService.calculateOutputChannels): a channel named directly, the channels of a matrix repeated for its pixels, an
// unused one.
export function getChannelFunctions(profile: FixtureProfile, mode: FixtureMode, fixtureService: FixtureService): ChannelFunction[] {
  const channels = channelsByName(profile, fixtureService);
  const functions: ChannelFunction[] = [];

  const add = (name: string) => {
    const found = channels.get(name);

    functions.push(found ? { name, fine: found.fine, ...look(profile, found.channel, name, fixtureService) } : { name });
  };

  for (const modeChannel of mode.channels) {
    if (modeChannel.name) {
      add(modeChannel.name);
    } else if (!modeChannel.repeatFor || modeChannel.repeatFor.length === 0) {
      functions.push({ name: undefined });
    } else {
      const pixels = fixtureService.getPixelsInOrder(profile, modeChannel.repeatFor);

      if (modeChannel.channelOrder === 'perPixel') {
        for (const pixel of pixels) {
          for (const template of modeChannel.templateChannels) {
            add(fixtureService.getChannelNameWithPixelKey(template, pixel.key));
          }
        }
      } else if (modeChannel.channelOrder === 'perChannel') {
        for (const template of modeChannel.templateChannels) {
          for (const pixel of pixels) {
            add(fixtureService.getChannelNameWithPixelKey(template, pixel.key));
          }
        }
      }
    }
  }

  return functions;
}

// Every name a mode can send a channel of the profile under: the channels, their fine channels, and the template
// channels named for each pixel
function channelsByName(profile: FixtureProfile, fixtureService: FixtureService): Map<string, { channel: FixtureChannel; fine: boolean }> {
  const channels = new Map<string, { channel: FixtureChannel; fine: boolean }>();

  const addChannel = (name: string, channel: FixtureChannel) => {
    channels.set(name, { channel, fine: false });

    for (const alias of channel.fineChannelAliases || []) {
      channels.set(alias, { channel, fine: true });
    }
  };

  for (const name of Object.keys(profile.availableChannels || {})) {
    addChannel(name, profile.availableChannels[name]);
  }

  const templates = Object.keys(profile.templateChannels || {});

  if (templates.length > 0) {
    for (const pixel of fixtureService.getAllPixelKeys(profile)) {
      for (const name of templates) {
        const channel: FixtureChannel = profile.templateChannels[name];

        channels.set(fixtureService.getChannelNameWithPixelKey(name, pixel.key), { channel, fine: false });

        for (const alias of channel.fineChannelAliases || []) {
          channels.set(fixtureService.getChannelNameWithPixelKey(alias, pixel.key), { channel, fine: true });
        }
      }
    }
  }

  return channels;
}

// How a channel is shown: the colour of a colour channel, else the icon of what most of its range does
function look(
  profile: FixtureProfile,
  channel: FixtureChannel,
  name: string,
  fixtureService: FixtureService
): { icon?: string; color?: string } {
  const capability = mainCapability(channel);

  if (!capability) {
    return {};
  }

  if (capability.type === FixtureCapabilityType.ColorIntensity) {
    return { color: capabilityColors[capability.color] || capabilityColors.White };
  }

  if (capability.type === FixtureCapabilityType.WheelSlot) {
    const wheel = fixtureService.getWheelByName(profile, capability.wheel || name);

    if (fixtureService.wheelHasSlotType(wheel, FixtureWheelSlotType.Color)) {
      return { icon: 'icon-multi-color' };
    }

    return { icon: fixtureService.wheelHasSlotType(wheel, FixtureWheelSlotType.Prism) ? 'icon-prism' : 'icon-gobo' };
  }

  return { icon: capabilityIcons[capability.type] };
}

// the capability which takes most of the range of the channel, of the ones which do something
function mainCapability(channel: FixtureChannel): FixtureCapability {
  const capabilities = channel.capabilities?.length > 0 ? channel.capabilities : channel.capability ? [channel.capability] : [];
  const width = (capability: FixtureCapability) =>
    capability.dmxRange?.length === 2 ? capability.dmxRange[1] - capability.dmxRange[0] : Number.MAX_SAFE_INTEGER;

  let main: FixtureCapability;

  for (const capability of capabilities) {
    if (capability.type === FixtureCapabilityType.NoFunction) {
      continue;
    }

    if (!main || width(capability) > width(main)) {
      main = capability;
    }
  }

  return main || capabilities[0];
}
