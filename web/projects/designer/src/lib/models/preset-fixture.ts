export class PresetFixture {
  public fixtureUuid: string;
  public pixelKey: string;

  // The folder this fixture is in (undefined = top level) and its position among the
  // folders and fixtures of that folder. The project's list carries the folder every
  // preset sees; a preset with its own fixture order carries the position it gives the
  // fixture there. No position yet means the fixture was just added to the preset.
  public folderUuid: string;
  public sortIndex: number;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.fixtureUuid = data.fixtureUuid;
    this.pixelKey = data.pixelKey;
    this.folderUuid = data.folderUuid;
    this.sortIndex = data.sortIndex;
  }
}
