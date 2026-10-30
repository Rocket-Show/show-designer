import { Injectable } from '@angular/core';
import { CachedFixtureCapability } from '../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../models/cached-fixture-channel';
import { CachedFixturePixel } from '../models/cached-fixture-pixel';
import { isPositionedCapabilityType, isRangeReversed } from '../models/capability-position';
import { Color } from '../models/color';
import { EffectCurve } from '../models/effect-curve';
import { EffectCurveProfileChannels } from '../models/effect-curve-profile-channel';
import { FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { FixtureChannelValue } from '../models/fixture-channel-value';
import { FixtureMode } from '../models/fixture-mode';
import { FixtureProfile } from '../models/fixture-profile';
import { FixtureWheel } from '../models/fixture-wheel';
import { FixtureWheelSlot, FixtureWheelSlotType } from '../models/fixture-wheel-slot';
import { Preset } from '../models/preset';
import { PresetStep } from '../models/preset-step';
import { FixtureService } from './fixture.service';

// What becomes of a value written for one model of fixture, when its fixtures are changed to another one: the channel
// (or the slot) it is carried to, or why it isn't
export interface FixtureExchangeItem {
  presetName: string;

  // what the value drives on the old model, e.g. "Strobe" or "Color Wheel 3"
  from: string;

  // what it drives on the new model, or undefined, if it can't be carried
  to?: string;

  // why it can't: the new model has nothing doing it, a gobo of its own or the new model has a value there already
  reason?: 'nothing' | 'gobo' | 'taken';
}

export class FixtureExchangeReport {
  carried: FixtureExchangeItem[] = [];
  lost: FixtureExchangeItem[] = [];
}

// a channel of a mode, with the pixel it is of (-1 for the fixture itself)
interface ModeChannel {
  channel: CachedFixtureChannel;
  pixelIndex: number;
}

// Changes the fixtures of a project from one model (a profile in one of its modes) to another one, e.g. the pars a venue
// has instead of the ones a show was written for. What the presets set as a capability (the dimmer, the color, pan
// and tilt, the strobe, the zoom, ...) plays on any model already. What they set for the old model only (the value of
// a channel, a slot of a wheel, a channel an effect drives) is carried to the new one by what it does there: to the
// channel of the new model doing the same (the same kind of capability, the same color, the same shutter effect),
// at the same place within it, a color slot to the closest color, an open slot to the open one. The values of the
// old model stay as they are, for the fixtures of it the project still has.
@Injectable({
  providedIn: 'root',
})
export class FixtureExchangeService {
  constructor(private fixtureService: FixtureService) {}

  // the pixels a mode uses, in the order the fixture library gives them
  getPixels(profile: FixtureProfile, mode: FixtureMode): CachedFixturePixel[] {
    const pixels: CachedFixturePixel[] = [];

    for (const channel of mode?.channels || []) {
      for (const pixel of this.fixtureService.getPixelsInOrder(profile, channel.repeatFor)) {
        if (!pixels.some((existing) => existing.key === pixel.key)) {
          pixels.push(pixel);
        }
      }
    }

    return pixels;
  }

  // the pixels of the new model the ones of the old model become: the pixel at the same place, as long as both have
  // as many of them (a pixel without one is left out of the presets)
  getPixelKeyMap(fromProfile: FixtureProfile, fromMode: FixtureMode, toProfile: FixtureProfile, toMode: FixtureMode): Map<string, string> {
    const map = new Map<string, string>();
    const fromPixels = this.getPixels(fromProfile, fromMode);
    const toPixels = this.getPixels(toProfile, toMode);

    if (fromPixels.length === toPixels.length) {
      fromPixels.forEach((pixel, index) => map.set(pixel.key, toPixels[index].key));
    }

    return map;
  }

  // all channels of a mode: the ones of the fixture itself and the ones of each of its pixels
  private getModeChannels(profile: FixtureProfile, mode: FixtureMode): ModeChannel[] {
    const channels: ModeChannel[] = this.fixtureService
      .getCachedChannels(profile, mode, null)
      .map((channel) => ({ channel, pixelIndex: -1 }));

    this.getPixels(profile, mode).forEach((pixel, pixelIndex) => {
      for (const channel of this.fixtureService.getCachedChannels(profile, mode, pixel.key)) {
        channels.push({ channel, pixelIndex });
      }
    });

    return channels;
  }

  private getWheelSlots(wheel: FixtureWheel, slotNumber: number): FixtureWheelSlot[] {
    if (!wheel || !wheel.slots || wheel.slots.length === 0) {
      return [];
    }

    const slotAt = (number: number) => wheel.slots[(((number - 1) % wheel.slots.length) + wheel.slots.length) % wheel.slots.length];

    return slotNumber === Math.floor(slotNumber) ? [slotAt(slotNumber)] : [slotAt(Math.floor(slotNumber)), slotAt(Math.ceil(slotNumber))];
  }

  private isOpen(slots: FixtureWheelSlot[]): boolean {
    return slots.length > 0 && slots.every((slot) => slot && slot.type === FixtureWheelSlotType.Open);
  }

  private colorDistance(color1: Color, color2: Color): number {
    return Math.abs(color1.red - color2.red) + Math.abs(color1.green - color2.green) + Math.abs(color1.blue - color2.blue);
  }

  // The slot of a wheel of the new model taking the place of a slot of a wheel of the old one: an open slot for an open
  // one, the closest color for a color and a gobo of the same name for a gobo. Undefined, if the new model has none.
  private getTargetSlot(
    fromWheel: FixtureWheel,
    slotNumber: number,
    toProfile: FixtureProfile,
    toChannels: ModeChannel[]
  ): { wheelName: string; capability: CachedFixtureCapability } {
    const fromSlots = this.getWheelSlots(fromWheel, slotNumber);
    const fromColor = this.fixtureService.getMixedWheelSlotColor(fromWheel, slotNumber);
    const fromIsColorWheel = this.fixtureService.wheelHasSlotType(fromWheel, FixtureWheelSlotType.Color);
    let best: { wheelName: string; capability: CachedFixtureCapability };
    let bestDistance = Number.MAX_VALUE;

    for (const modeChannel of toChannels) {
      for (const channelCapability of modeChannel.channel.capabilities) {
        const wheel = channelCapability.wheel;

        if (channelCapability.capability.type !== FixtureCapabilityType.WheelSlot || !wheel || channelCapability.wheelSlots.length !== 1) {
          continue;
        }

        const slot = channelCapability.wheelSlots[0];
        const isColorWheel = this.fixtureService.wheelHasSlotType(wheel, FixtureWheelSlotType.Color);

        if (this.isOpen(fromSlots)) {
          // the open slot of a wheel of the same kind
          if (slot && slot.type === FixtureWheelSlotType.Open && isColorWheel === fromIsColorWheel) {
            return { wheelName: channelCapability.wheelName, capability: channelCapability };
          }
        } else if (fromColor) {
          const color = this.fixtureService.getMixedWheelSlotColor(wheel, channelCapability.capability.slotNumber);

          if (color && this.colorDistance(color, fromColor) < bestDistance) {
            bestDistance = this.colorDistance(color, fromColor);
            best = { wheelName: channelCapability.wheelName, capability: channelCapability };
          }
        } else if (fromSlots.length === 1 && fromSlots[0]?.name && slot?.name?.toLowerCase() === fromSlots[0].name.toLowerCase()) {
          // a gobo the new model has as well
          return { wheelName: channelCapability.wheelName, capability: channelCapability };
        }
      }
    }

    return best;
  }

  // where a value lies within a capability of its channel (0 to 1), from the low end of what it does to its high end
  private getPositionInCapability(channel: CachedFixtureChannel, channelCapability: CachedFixtureCapability, value: number): number {
    const dmxRange = channelCapability.capability.dmxRange;
    let position: number;

    if (channel.capabilities.length === 1 || !dmxRange || dmxRange.length < 2) {
      position = channel.maxValue > 0 ? value / channel.maxValue : 0;
    } else {
      position = dmxRange[1] === dmxRange[0] ? 0.5 : (value - dmxRange[0]) / (dmxRange[1] - dmxRange[0]);
    }

    position = Math.max(0, Math.min(1, position));

    return isPositionedCapabilityType(channelCapability.capability.type) && isRangeReversed(channelCapability.capability)
      ? 1 - position
      : position;
  }

  // the value of a channel at a position within a capability of it (see getPositionInCapability)
  private getValueInCapability(channel: CachedFixtureChannel, channelCapability: CachedFixtureCapability, position: number): number {
    const dmxRange = channelCapability.capability.dmxRange;
    const along =
      isPositionedCapabilityType(channelCapability.capability.type) && isRangeReversed(channelCapability.capability)
        ? 1 - position
        : position;

    if (channel.capabilities.length === 1 || !dmxRange || dmxRange.length < 2) {
      return Math.round(channel.maxValue * along);
    }

    if (dmxRange[1] === dmxRange[0]) {
      return dmxRange[0];
    }

    return Math.round(dmxRange[0] + (dmxRange[1] - dmxRange[0]) * along);
  }

  // does a capability of the new model do what the one of the old model does?
  private doesTheSame(from: CachedFixtureCapability, to: CachedFixtureCapability): boolean {
    const fromCapability = from.capability;
    const toCapability = to.capability;

    return (
      fromCapability.type === toCapability.type &&
      (fromCapability.color ?? undefined) === (toCapability.color ?? undefined) &&
      (fromCapability.type !== FixtureCapabilityType.ShutterStrobe || fromCapability.shutterEffect === toCapability.shutterEffect)
    );
  }

  // the channels of the new model in the order they are tried: the one of the same name first, of the same pixel only
  private getCandidates(from: ModeChannel, toChannels: ModeChannel[], pixelMapped: boolean): ModeChannel[] {
    const samePixel = toChannels.filter((to) =>
      from.pixelIndex < 0 ? to.pixelIndex < 0 : pixelMapped && to.pixelIndex === from.pixelIndex
    );

    return [
      ...samePixel.filter((to) => to.channel.name === from.channel.name),
      ...samePixel.filter((to) => to.channel.name !== from.channel.name),
    ];
  }

  // The value of a channel of the new model taking the place of the passed value of a channel of the old one, or
  // undefined, if none does what the value does
  private getTargetChannelValue(
    from: ModeChannel,
    value: number,
    toProfile: FixtureProfile,
    toChannels: ModeChannel[],
    pixelMapped: boolean,
    taken: string[]
  ): { channel: CachedFixtureChannel; value: number; reason?: 'gobo' | 'taken' } {
    const fromCapability = this.fixtureService.getCapabilityInValue(from.channel, value);

    if (!fromCapability) {
      return undefined;
    }

    const candidates = this.getCandidates(from, toChannels, pixelMapped);
    let takenChannel: CachedFixtureChannel;

    if (fromCapability.capability.type === FixtureCapabilityType.WheelSlot) {
      // a slot of a wheel: the slot of the new model taking its place, on its own channel
      const target = this.getTargetSlot(fromCapability.wheel, fromCapability.capability.slotNumber, toProfile, candidates);

      if (!target) {
        return {
          channel: undefined,
          value: undefined,
          reason: this.fixtureService.wheelHasSlotType(fromCapability.wheel, FixtureWheelSlotType.Color) ? undefined : 'gobo',
        };
      }

      const channel = candidates.find((candidate) => candidate.channel.capabilities.indexOf(target.capability) >= 0).channel;

      return taken.indexOf(channel.name) >= 0
        ? { channel, value: undefined, reason: 'taken' }
        : { channel, value: target.capability.centerValue };
    }

    if (fromCapability.capability.type === FixtureCapabilityType.ColorPreset) {
      // a color macro: the closest one of the new model
      const fromColor = this.fixtureService.getColorPresetColor(fromCapability.capability);
      let best: { channel: CachedFixtureChannel; value: number };
      let bestDistance = Number.MAX_VALUE;

      for (const candidate of candidates) {
        for (const toCapability of candidate.channel.capabilities) {
          const color =
            toCapability.capability.type === FixtureCapabilityType.ColorPreset &&
            this.fixtureService.getColorPresetColor(toCapability.capability);

          if (fromColor && color && this.colorDistance(color, fromColor) < bestDistance) {
            if (taken.indexOf(candidate.channel.name) >= 0) {
              takenChannel = candidate.channel;
              continue;
            }

            bestDistance = this.colorDistance(color, fromColor);
            best = { channel: candidate.channel, value: this.getValueInCapability(candidate.channel, toCapability, 0.5) };
          }
        }
      }

      return best || (takenChannel ? { channel: takenChannel, value: undefined, reason: 'taken' } : undefined);
    }

    for (const candidate of candidates) {
      for (const toCapability of candidate.channel.capabilities) {
        if (!this.doesTheSame(fromCapability, toCapability)) {
          continue;
        }

        if (taken.indexOf(candidate.channel.name) >= 0) {
          takenChannel = takenChannel || candidate.channel;
          continue;
        }

        if (
          fromCapability.capability.type === FixtureCapabilityType.Intensity ||
          fromCapability.capability.type === FixtureCapabilityType.ColorIntensity
        ) {
          // a brightness: as bright, through the capability of the new channel giving it
          const brightness = this.fixtureService.getBrightnessOfValue(from.channel, fromCapability, value);
          const brightnessCapabilities = candidate.channel.capabilities.filter((capability) =>
            this.doesTheSame(fromCapability, capability)
          );
          const brightnessCapability = this.fixtureService.getBrightnessCapability(candidate.channel, brightnessCapabilities, brightness);
          const brightnessValue = this.fixtureService.getBrightnessValue(candidate.channel, brightnessCapability, brightness);

          if (brightnessValue !== undefined) {
            return { channel: candidate.channel, value: Math.round(brightnessValue) };
          }

          continue;
        }

        return {
          channel: candidate.channel,
          value: this.getValueInCapability(
            candidate.channel,
            toCapability,
            this.getPositionInCapability(from.channel, fromCapability, value)
          ),
        };
      }
    }

    return takenChannel ? { channel: takenChannel, value: undefined, reason: 'taken' } : undefined;
  }

  // the channel of the new model doing what a channel of the old one an effect drives does
  private getTargetEffectChannel(from: ModeChannel, toChannels: ModeChannel[], pixelMapped: boolean): CachedFixtureChannel {
    const fromCapability = from.channel.capabilities.find((capability) => capability.capability.type !== FixtureCapabilityType.NoFunction);

    if (!fromCapability) {
      return undefined;
    }

    return this.getCandidates(from, toChannels, pixelMapped).find((candidate) =>
      candidate.channel.capabilities.some((capability) => this.doesTheSame(fromCapability, capability))
    )?.channel;
  }

  // what a slot of a wheel is called in the report, e.g. "Color Wheel 3"
  private slotName(wheelName: string, slotNumber: number): string {
    return wheelName + ' ' + slotNumber;
  }

  private exchangeStep(
    preset: Preset,
    step: PresetStep,
    fromProfile: FixtureProfile,
    fromChannels: ModeChannel[],
    toProfile: FixtureProfile,
    toChannels: ModeChannel[],
    pixelMapped: boolean,
    report: FixtureExchangeReport,
    apply: boolean
  ) {
    const presetName = preset.name;

    // the channels of the new model the step sets already, which are left as they are
    const taken = step.fixtureChannelValues.filter((value) => value.profileUuid === toProfile.uuid).map((value) => value.channelName);

    for (const channelValue of step.fixtureChannelValues.slice()) {
      if (channelValue.profileUuid !== fromProfile.uuid) {
        continue;
      }

      const from = fromChannels.find((modeChannel) => modeChannel.channel.name === channelValue.channelName);
      const fromCapability = from && this.fixtureService.getCapabilityInValue(from.channel, channelValue.value);

      // a channel the old mode doesn't have plays on nothing, a value doing nothing does nothing on the new model either
      if (!from || !fromCapability || fromCapability.capability.type === FixtureCapabilityType.NoFunction) {
        continue;
      }

      const target = this.getTargetChannelValue(from, channelValue.value, toProfile, toChannels, pixelMapped, taken);

      if (!target || target.value === undefined) {
        report.lost.push({ presetName, from: channelValue.channelName, to: target?.channel?.name, reason: target?.reason || 'nothing' });
        continue;
      }

      taken.push(target.channel.name);
      report.carried.push({ presetName, from: channelValue.channelName, to: target.channel.name });

      if (apply) {
        const value = new FixtureChannelValue();
        value.channelName = target.channel.name;
        value.profileUuid = toProfile.uuid;
        value.value = target.value;
        step.fixtureChannelValues.push(value);
      }
    }

    for (const capabilityValue of step.fixtureCapabilityValues.slice()) {
      if (capabilityValue.profileUuid !== fromProfile.uuid) {
        continue;
      }

      const exists = (wheel?: string) =>
        step.fixtureCapabilityValues.some(
          (value) =>
            value.profileUuid === toProfile.uuid &&
            value.type === capabilityValue.type &&
            (value.color ?? undefined) === (capabilityValue.color ?? undefined) &&
            (value.wheel ?? undefined) === (wheel ?? undefined)
        );

      if (capabilityValue.type !== FixtureCapabilityType.WheelSlot) {
        // a capability set for the old model only: the same for the new one
        const name = capabilityValue.type + (capabilityValue.color ? ' ' + capabilityValue.color : '');

        if (exists(capabilityValue.wheel)) {
          report.lost.push({ presetName, from: name, reason: 'taken' });
          continue;
        }

        report.carried.push({ presetName, from: name, to: name });

        if (apply) {
          const value = new FixtureCapabilityValue(capabilityValue);
          value.profileUuid = toProfile.uuid;
          step.fixtureCapabilityValues.push(value);
        }

        continue;
      }

      const fromWheel = this.fixtureService.getWheelByName(fromProfile, capabilityValue.wheel);
      const from = this.slotName(capabilityValue.wheel, capabilityValue.slotNumber);
      const target = this.getTargetSlot(fromWheel, capabilityValue.slotNumber, toProfile, toChannels);

      if (!target) {
        report.lost.push({
          presetName,
          from,
          reason:
            this.fixtureService.wheelHasSlotType(fromWheel, FixtureWheelSlotType.Color) ||
            this.isOpen(this.getWheelSlots(fromWheel, capabilityValue.slotNumber))
              ? 'nothing'
              : 'gobo',
        });
        continue;
      }

      const to = this.slotName(target.wheelName, target.capability.capability.slotNumber);

      if (exists(target.wheelName)) {
        report.lost.push({ presetName, from, to, reason: 'taken' });
        continue;
      }

      report.carried.push({ presetName, from, to });

      if (apply) {
        const value = new FixtureCapabilityValue();
        value.type = FixtureCapabilityType.WheelSlot;
        value.wheel = target.wheelName;
        value.slotNumber = target.capability.capability.slotNumber;
        value.profileUuid = toProfile.uuid;
        step.fixtureCapabilityValues.push(value);
      }
    }
  }

  private exchangeEffects(
    preset: Preset,
    fromProfile: FixtureProfile,
    fromChannels: ModeChannel[],
    toProfile: FixtureProfile,
    toChannels: ModeChannel[],
    pixelMapped: boolean,
    report: FixtureExchangeReport,
    apply: boolean
  ) {
    for (const effect of preset.effects) {
      if (!(effect instanceof EffectCurve)) {
        continue;
      }

      const fromEntry = effect.channels.find((profileChannels) => profileChannels.profileUuid === fromProfile.uuid);

      if (!fromEntry) {
        continue;
      }

      let toEntry = effect.channels.find((profileChannels) => profileChannels.profileUuid === toProfile.uuid);

      for (const channelName of fromEntry.channels) {
        const from = fromChannels.find((modeChannel) => modeChannel.channel.name === channelName);

        if (!from) {
          continue;
        }

        const target = this.getTargetEffectChannel(from, toChannels, pixelMapped);

        if (!target) {
          report.lost.push({ presetName: preset.name, from: channelName, reason: 'nothing' });
          continue;
        }

        report.carried.push({ presetName: preset.name, from: channelName, to: target.name });

        if (apply) {
          if (!toEntry) {
            toEntry = new EffectCurveProfileChannels();
            toEntry.profileUuid = toProfile.uuid;
            effect.channels.push(toEntry);
          }

          if (toEntry.channels.indexOf(target.name) < 0) {
            toEntry.channels.push(target.name);
          }
        }
      }
    }
  }

  // Carry what the presets set for the old model (a profile in a mode) over to the new one, or (apply = false) only tell
  // what would be carried and what not
  exchange(
    presets: Preset[],
    fromProfile: FixtureProfile,
    fromMode: FixtureMode,
    toProfile: FixtureProfile,
    toMode: FixtureMode,
    apply: boolean
  ): FixtureExchangeReport {
    const report = new FixtureExchangeReport();

    if (!fromProfile || !toProfile || !toMode || fromProfile.uuid === toProfile.uuid) {
      return report;
    }

    const fromChannels = this.getModeChannels(fromProfile, fromMode);
    const toChannels = this.getModeChannels(toProfile, toMode);
    const pixelMapped = this.getPixelKeyMap(fromProfile, fromMode, toProfile, toMode).size > 0;

    for (const preset of presets) {
      for (const step of preset.steps) {
        this.exchangeStep(preset, step, fromProfile, fromChannels, toProfile, toChannels, pixelMapped, report, apply);
      }

      this.exchangeEffects(preset, fromProfile, fromChannels, toProfile, toChannels, pixelMapped, report, apply);
    }

    return report;
  }
}
