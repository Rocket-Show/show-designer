export class PresetFixture {
  public fixtureUuid: string;
  public pixelKey: string;

  // Only used for the entries of the project's fixture list: the folder this fixture
  // is in (undefined = top level) and its position among the folders and fixtures of
  // that folder. A preset with its own fixture order keeps that order in its array,
  // so its copies do not carry a folder.
  public folderUuid: string;
  public sortIndex = 0;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.fixtureUuid = data.fixtureUuid;
    this.pixelKey = data.pixelKey;
    this.folderUuid = data.folderUuid;
    this.sortIndex = data.sortIndex || 0;
  }
}
