import { readProjectNumber } from './project-number';

export class FixtureChannelValue {
  channelName: string;
  profileUuid: string;
  value: number;

  // turned off in the preset editor: kept, to be turned on again, but not played (see played-values)
  deactivated: boolean;

  constructor(data?: any) {
    if (!data) {
      return;
    }
    this.channelName = data.channelName;
    this.profileUuid = data.profileUuid;
    this.value = readProjectNumber(data.value);
    this.deactivated = data.deactivated === true ? true : undefined;
  }
}
