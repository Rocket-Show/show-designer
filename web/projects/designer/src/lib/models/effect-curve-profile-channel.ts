export class EffectCurveProfileChannels {
  profileUuid: string;
  channels: string[] = [];

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.profileUuid = data.profileUuid;

    if (Array.isArray(data.channels)) {
      this.channels = data.channels.slice();
    } else if (data.channels) {
      // the channel names as the keys of an object
      for (const channel of Object.keys(data.channels)) {
        this.channels.push(channel);
      }
    }
  }
}
