/**
 * A folder inside one of the trees (presets, scenes, fixtures). Folders only group
 * what is already there: the items keep living in their flat list of the project and
 * carry the uuid of the folder they are in.
 *
 * Folders and items are ordered together by their sortIndex, which counts through the
 * children of one folder, so an item can sit above a folder and the other way round.
 */
export class Folder {
  uuid: string;
  name: string;

  // the folder this one is in (undefined = top level)
  parentUuid: string;

  // position among the folders and items of the same parent
  sortIndex = 0;

  // is the folder shown with its content?
  expanded = true;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.uuid = data.uuid;
    this.name = data.name;
    this.parentUuid = data.parentUuid;
    this.sortIndex = data.sortIndex || 0;
    this.expanded = data.expanded !== false;
  }
}
