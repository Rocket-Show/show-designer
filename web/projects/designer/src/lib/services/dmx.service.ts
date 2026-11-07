import { Injectable } from '@angular/core';
import { CachedFixture } from '../models/cached-fixture';
import { CachedFixtureChannel } from '../models/cached-fixture-channel';
import { DmxOverride, dmxUniverseSize } from '../models/dmx-override';
import { FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureChannelValue } from '../models/fixture-channel-value';
import { FixtureModeChannel } from '../models/fixture-mode-channel';
import { FixtureService } from './fixture.service';
import { LivePreviewService } from './live-preview.service';
import { ProjectService } from './project.service';

// Where a channel of a fixture (or of one of its pixels) is sent: its DMX channel and the byte of its value it carries
export interface DmxOutputChannel {
  // counted from 0, like the first channel of a fixture (DMX address 1 is channel 0)
  dmxChannel: number;
  cachedFixture: CachedFixture;
  channel: CachedFixtureChannel;

  // -1 for the coarse channel itself, 0 for its first fine channel, 1 for the second, ...
  fineIndex: number;

  // the name of the channel of the mode sent there, e.g. "Pan fine"
  name: string;
}

// The DMX channels of the fixtures and the values they are sent with, worked out like Rocket Show sends them
// (DefaultDesignerService.setUniverseValues): the values the presets light the fixtures with, dimmed by the master
// dimmer, split into the bytes of their fine channels, with the channels held by a fader on top.
@Injectable({
  providedIn: 'root',
})
export class DmxService {
  // where each part of a fixture sends its channels, worked out once per part (a new patch makes new parts)
  private outputChannels = new WeakMap<CachedFixture, DmxOutputChannel[]>();

  constructor(
    private fixtureService: FixtureService,
    private projectService: ProjectService,
    private livePreviewService: LivePreviewService
  ) {}

  // the channels of all fixtures of the passed universe, by their DMX channel
  getPatch(universeUuid: string): DmxOutputChannel[][] {
    const patch: DmxOutputChannel[][] = Array.from({ length: dmxUniverseSize }, () => []);

    for (const cachedFixture of this.fixtureService.cachedFixtures) {
      if (cachedFixture.fixture.dmxUniverseUuid !== universeUuid) {
        continue;
      }

      for (const output of this.getOutputChannels(cachedFixture)) {
        if (output.dmxChannel >= 0 && output.dmxChannel < dmxUniverseSize) {
          patch[output.dmxChannel].push(output);
        }
      }
    }

    return patch;
  }

  // Where a part of a fixture sends its channels, in the order of the channels of its mode. Fine channels are not
  // cached separately: the coarse channel is found for them, and the byte of its value they carry.
  getOutputChannels(cachedFixture: CachedFixture): DmxOutputChannel[] {
    let outputs = this.outputChannels.get(cachedFixture);

    if (!outputs) {
      outputs = this.calculateOutputChannels(cachedFixture);
      this.outputChannels.set(cachedFixture, outputs);
    }

    return outputs;
  }

  private calculateOutputChannels(cachedFixture: CachedFixture): DmxOutputChannel[] {
    const outputs: DmxOutputChannel[] = [];

    if (!cachedFixture.mode) {
      return outputs;
    }

    let dmxChannel = cachedFixture.fixture.dmxFirstChannel || 0;

    for (const modeChannel of cachedFixture.mode.channels) {
      if (this.isUnusedChannel(modeChannel)) {
        // an unused channel ("null" in the fixture library) still takes its DMX channel
        dmxChannel++;
      } else if (!modeChannel.name) {
        // a channel repeated for the pixels of a matrix
        const pixels = this.fixtureService.getPixelsInOrder(cachedFixture.profile, modeChannel.repeatFor);

        if (modeChannel.channelOrder === 'perPixel') {
          // each channel for each pixel
          for (const pixel of pixels) {
            for (const templateChannelName of modeChannel.templateChannels) {
              this.addOutputChannel(outputs, dmxChannel++, cachedFixture, templateChannelName, pixel.key);
            }
          }
        } else if (modeChannel.channelOrder === 'perChannel') {
          // each pixel for each channel
          for (const templateChannelName of modeChannel.templateChannels) {
            for (const pixel of pixels) {
              this.addOutputChannel(outputs, dmxChannel++, cachedFixture, templateChannelName, pixel.key);
            }
          }
        }
      } else {
        // a channel named directly
        this.addOutputChannel(outputs, dmxChannel++, cachedFixture, modeChannel.name, undefined);
      }
    }

    return outputs;
  }

  private isUnusedChannel(modeChannel: FixtureModeChannel): boolean {
    return !modeChannel.name && (!modeChannel.repeatFor || modeChannel.repeatFor.length === 0);
  }

  private addOutputChannel(
    outputs: DmxOutputChannel[],
    dmxChannel: number,
    cachedFixture: CachedFixture,
    templateName: string,
    pixelKey: string
  ) {
    const name = this.fixtureService.getChannelNameWithPixelKey(templateName, pixelKey);

    for (const channel of cachedFixture.channels) {
      if (!channel.channel) {
        continue;
      }

      if (channel.name === name) {
        outputs.push({ dmxChannel, cachedFixture, channel, fineIndex: -1, name });
        return;
      }

      const fineIndex = this.getFineIndex(channel, name);

      if (fineIndex >= 0) {
        outputs.push({ dmxChannel, cachedFixture, channel, fineIndex, name });
        return;
      }
    }
  }

  // the place of a channel name among the fine channels of a channel, -1 if it isn't one of them. The fine channels
  // of a template channel are named after the pixel it was made for.
  private getFineIndex(channel: CachedFixtureChannel, name: string): number {
    const aliases = channel.channel.fineChannelAliases || [];

    for (let i = 0; i < aliases.length; i++) {
      if (this.fixtureService.getChannelNameWithPixelKey(aliases[i], channel.pixelKey) === name) {
        return i;
      }
    }

    return -1;
  }

  // The values sent on each DMX channel of the passed universe for the passed values of the fixtures (see
  // PreviewService.getChannelValues): 0 where nothing is sent
  getUniverseValues(universeUuid: string, values: Map<CachedFixture, FixtureChannelValue[]>): number[] {
    const universe: number[] = new Array(dmxUniverseSize).fill(0);
    const masterDimmer = this.projectService.project?.masterDimmerValue ?? 1;

    values.forEach((fixtureValues, cachedFixture) => {
      if (cachedFixture.fixture.dmxUniverseUuid !== universeUuid) {
        return;
      }

      const colorDimmer = this.getColorDimmer(cachedFixture, fixtureValues, masterDimmer);

      for (const output of this.getOutputChannels(cachedFixture)) {
        const channelValue = fixtureValues.find((candidate) => candidate.channelName === output.channel.name);

        if (!channelValue || output.dmxChannel < 0 || output.dmxChannel >= dmxUniverseSize) {
          continue;
        }

        let value = this.dim(output.channel, channelValue.value, FixtureCapabilityType.Intensity, masterDimmer);

        if (colorDimmer !== undefined) {
          value = this.dim(output.channel, value, FixtureCapabilityType.ColorIntensity, colorDimmer);
        }

        universe[output.dmxChannel] = this.getByte(output, value);
      }
    });

    // a channel held by a fader sends the value of the fader, the master dimmer included
    for (const dmxOverride of this.getOverrides()) {
      if (dmxOverride.universeUuid === universeUuid && dmxOverride.dmxChannel >= 0 && dmxOverride.dmxChannel < dmxUniverseSize) {
        universe[dmxOverride.dmxChannel] = this.clampByte(dmxOverride.value);
      }
    }

    return universe;
  }

  // the byte of a value of a channel the passed DMX channel carries: the coarse channel the highest one
  private getByte(output: DmxOutputChannel, value: number): number {
    const fineCount = (output.channel.channel.fineChannelAliases || []).length;

    return Math.floor(value / Math.pow(256, fineCount - (output.fineIndex + 1))) % 256;
  }

  // How much the colors of a fixture with a virtual dimmer are dimmed when they are sent: by the virtual dimmer and by
  // the master dimmer. Undefined for a fixture without a virtual dimmer, its colors are sent as they are.
  private getColorDimmer(cachedFixture: CachedFixture, values: FixtureChannelValue[], masterDimmer: number): number {
    const virtualDimmer = cachedFixture.channels.find((channel) => channel.name === FixtureService.virtualDimmerChannelName);

    if (!virtualDimmer) {
      return undefined;
    }

    const value = values.find(
      (candidate) =>
        candidate.channelName === FixtureService.virtualDimmerChannelName && candidate.profileUuid === cachedFixture.profile.uuid
    );

    return (value ? this.fixtureService.getDimmerBrightnessOfValue(virtualDimmer, value.value) : 0) * masterDimmer;
  }

  // A value giving the brightness on the passed capability, dimmed by the factor within the range of its capability
  // (also from bright to off). Any other value is passed through.
  private dim(channel: CachedFixtureChannel, value: number, type: FixtureCapabilityType, factor: number): number {
    if (factor >= 1 || !channel.capabilities) {
      return value;
    }

    const maxLumens = this.fixtureService.getMaxLumens(channel.capabilities);

    for (const channelCapability of channel.capabilities) {
      const capability = channelCapability.capability;

      if (capability.type !== type) {
        continue;
      }

      const dmxRange = capability.dmxRange;
      // the whole channel or the range of the capability
      const low = !dmxRange || dmxRange.length < 2 ? 0 : dmxRange[0];
      const high = !dmxRange || dmxRange.length < 2 ? channel.maxValue : dmxRange[1];

      if (value < low || value > high) {
        continue;
      }

      const range = this.fixtureService.getBrightnessRange(capability, maxLumens);

      if (range[0] === range[1] || high === low) {
        // a single brightness can't be dimmed
        return value;
      }

      const brightness = range[0] + ((range[1] - range[0]) * (value - low)) / (high - low);
      const dimmedPosition = (brightness * factor - range[0]) / (range[1] - range[0]);

      return low + (high - low) * Math.max(0, Math.min(1, dimmedPosition));
    }

    return value;
  }

  // ---- the faders ----

  getOverrides(): DmxOverride[] {
    return this.projectService.project?.dmxOverrides || [];
  }

  getOverride(universeUuid: string, dmxChannel: number): DmxOverride {
    return this.getOverrides().find((candidate) => candidate.universeUuid === universeUuid && candidate.dmxChannel === dmxChannel);
  }

  // hold the passed DMX channel at a value, whatever the presets put on it
  setOverride(universeUuid: string, dmxChannel: number, value: number) {
    const project = this.projectService.project;

    if (!project) {
      return;
    }

    const existing = this.getOverride(universeUuid, dmxChannel);

    if (existing) {
      existing.value = this.clampByte(value);
    } else {
      project.dmxOverrides = [...this.getOverrides(), { universeUuid, dmxChannel, value: this.clampByte(value) }];
    }

    this.livePreviewService.previewLive();
  }

  // let go of the fader of the passed channel: it sends what the presets put on it again
  releaseOverride(universeUuid: string, dmxChannel: number) {
    const project = this.projectService.project;

    if (!project || !this.getOverride(universeUuid, dmxChannel)) {
      return;
    }

    project.dmxOverrides = this.getOverrides().filter(
      (candidate) => candidate.universeUuid !== universeUuid || candidate.dmxChannel !== dmxChannel
    );
    this.livePreviewService.previewLive();
  }

  // let go of all faders, of the passed universe only if one is passed
  releaseOverrides(universeUuid?: string) {
    const project = this.projectService.project;

    if (!project || this.getOverrides().length === 0) {
      return;
    }

    project.dmxOverrides = universeUuid ? this.getOverrides().filter((candidate) => candidate.universeUuid !== universeUuid) : [];
    this.livePreviewService.previewLive();
  }

  // What the preview shows a part of a fixture with: its values and the master dimmer it dims its brightness by. A
  // part with channels held by a fader is shown the way Rocket Show sends it: its values giving the brightness are
  // dimmed by the master dimmer first, then each fader sets the byte of the value its channel carries, which the master
  // dimmer leaves alone. The master dimmer is in its values then, the preview doesn't dim it again.
  getPreviewValues(
    cachedFixture: CachedFixture,
    values: FixtureChannelValue[],
    masterDimmer: number
  ): { values: FixtureChannelValue[]; masterDimmer: number } {
    const overrides = this.getOverrides();
    const held: { output: DmxOutputChannel; value: number }[] = [];

    if (overrides.length > 0) {
      for (const output of this.getOutputChannels(cachedFixture)) {
        const dmxOverride = overrides.find(
          (candidate) => candidate.universeUuid === cachedFixture.fixture.dmxUniverseUuid && candidate.dmxChannel === output.dmxChannel
        );

        if (dmxOverride) {
          held.push({ output, value: this.clampByte(dmxOverride.value) });
        }
      }
    }

    if (held.length === 0) {
      return { values, masterDimmer };
    }

    // a copy: the values may be shared with another fixture on the same address
    const result = values.map((value) => {
      const channel = cachedFixture.channels.find((candidate) => candidate.name === value.channelName);

      if (!channel || !channel.capabilities) {
        return value;
      }

      const dimmed = new FixtureChannelValue(value);
      dimmed.value = this.dim(channel, value.value, FixtureCapabilityType.Intensity, masterDimmer);
      return dimmed;
    });

    for (const { output, value: byte } of held) {
      const index = result.findIndex((candidate) => candidate.channelName === output.channel.name);
      const current = index >= 0 ? result[index].value : 0;
      const fineCount = (output.channel.channel.fineChannelAliases || []).length;
      const weight = Math.pow(256, fineCount - (output.fineIndex + 1));
      const currentByte = Math.floor(current / weight) % 256;
      const value = new FixtureChannelValue();
      value.channelName = output.channel.name;
      value.profileUuid = cachedFixture.profile.uuid;
      value.value = current + (byte - currentByte) * weight;

      if (index >= 0) {
        result[index] = value;
      } else {
        result.push(value);
      }
    }

    return { values: result, masterDimmer: 1 };
  }

  private clampByte(value: number): number {
    return Math.max(0, Math.min(255, Math.round(+value || 0)));
  }
}
