import { Injectable } from '@angular/core';
import { Folder } from '../models/folder';
import { UuidService } from './uuid.service';

// anything which can sit inside a folder: it knows its folder and its position
// among the folders and items of that folder
export interface FolderItem {
  uuid: string;
  folderUuid?: string;
  sortIndex?: number;
}

// one child of a folder, either a folder itself or an item
export interface FolderChild {
  folder?: Folder;
  item?: FolderItem;
  sortIndex: number;
}

/**
 * The order inside a tree with folders: folders and items of the same parent are
 * ordered together by their sortIndex, so they can be interleaved freely.
 *
 * The flat item list of the project is kept in the order the tree shows it, so
 * everything reading that list plainly still sees the same order as the user.
 */
@Injectable({
  providedIn: 'root',
})
export class FolderService {
  constructor(private uuidService: UuidService) {}

  createFolder(folders: Folder[], items: FolderItem[], name: string, parentUuid?: string): Folder {
    const folder = new Folder();
    folder.uuid = this.uuidService.getUuid();
    folder.name = name;
    folder.parentUuid = parentUuid;
    folder.sortIndex = this.getChildren(folders, items, parentUuid).length;
    folders.push(folder);

    return folder;
  }

  // the folders and items of one parent, in the order they are shown in
  getChildren(folders: Folder[], items: FolderItem[], parentUuid?: string): FolderChild[] {
    const children: FolderChild[] = [];

    for (const folder of folders) {
      if (this.sameFolder(folder.parentUuid, parentUuid)) {
        children.push({ folder, sortIndex: folder.sortIndex || 0 });
      }
    }

    for (const item of items) {
      if (this.sameFolder(item.folderUuid, parentUuid)) {
        children.push({ item, sortIndex: item.sortIndex || 0 });
      }
    }

    children.sort((child1, child2) => child1.sortIndex - child2.sortIndex);

    return children;
  }

  // all folders inside the passed one, including itself
  getFolderWithDescendants(folders: Folder[], folder: Folder): Folder[] {
    const result = [folder];

    for (const candidate of folders) {
      if (this.sameFolder(candidate.parentUuid, folder.uuid)) {
        result.push(...this.getFolderWithDescendants(folders, candidate));
      }
    }

    return result;
  }

  // remove a folder and move everything it contained to its parent, so nothing is
  // deleted along with it
  removeFolder(folders: Folder[], items: FolderItem[], folder: Folder) {
    for (const candidate of folders) {
      if (this.sameFolder(candidate.parentUuid, folder.uuid)) {
        candidate.parentUuid = folder.parentUuid;
      }
    }

    for (const item of items) {
      if (this.sameFolder(item.folderUuid, folder.uuid)) {
        item.folderUuid = folder.parentUuid;
      }
    }

    const index = folders.indexOf(folder);

    if (index >= 0) {
      folders.splice(index, 1);
    }

    this.renumber(folders, items, folder.parentUuid);
  }

  // give the children of one parent a clean 0..n-1 numbering again
  renumber(folders: Folder[], items: FolderItem[], parentUuid?: string) {
    const children = this.getChildren(folders, items, parentUuid);

    for (let i = 0; i < children.length; i++) {
      if (children[i].folder) {
        children[i].folder.sortIndex = i;
      } else {
        children[i].item.sortIndex = i;
      }
    }
  }

  // bring the flat item list into the order the tree shows, so everything reading it
  // plainly (the preview, the playback, an export) sees what the user sees
  sortItems(folders: Folder[], items: FolderItem[]) {
    const sorted: FolderItem[] = [];

    const walk = (parentUuid?: string) => {
      for (const child of this.getChildren(folders, items, parentUuid)) {
        if (child.folder) {
          walk(child.folder.uuid);
        } else {
          sorted.push(child.item);
        }
      }
    };

    walk(undefined);

    // keep items whose folder went missing, they would be dropped otherwise
    for (const item of items) {
      if (sorted.indexOf(item) < 0) {
        sorted.push(item);
      }
    }

    items.splice(0, items.length, ...sorted);
  }

  private sameFolder(uuid1: string, uuid2: string): boolean {
    return (!uuid1 && !uuid2) || uuid1 === uuid2;
  }
}
