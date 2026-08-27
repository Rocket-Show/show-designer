/**
 * Where a preset which brings its own fixture order puts one of the project's fixture
 * folders. The folders themselves stay the project's — their name, what is inside them
 * and how they are nested is the rig, shared by every preset. Only the position among
 * their siblings can differ, so one preset can chase from the front truss to the back
 * one while another does it the other way round.
 */
export class FolderPosition {
  folderUuid: string;
  sortIndex = 0;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.folderUuid = data.folderUuid;
    this.sortIndex = data.sortIndex || 0;
  }
}
