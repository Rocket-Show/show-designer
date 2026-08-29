import { Injectable } from '@angular/core';
import { Folder } from '../models/folder';
import { UuidService } from './uuid.service';

// anything which can sit inside a folder: it knows its folder and its position
// among the folders and items of that folder
export interface FolderItem {
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

  // put an item at the end of a folder's children. Used for items which appear without
  // the user placing them (a fixture added to the pool), so they do not all pile up at
  // the top with a sortIndex of 0. Call it before adding the item to the list.
  placeLast(folders: Folder[], items: FolderItem[], item: FolderItem, parentUuid?: string) {
    item.folderUuid = parentUuid;
    item.sortIndex = this.getChildren(folders, items, parentUuid).length;
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
  // deleted along with it. The content takes the folder's own place among its siblings,
  // instead of jumping somewhere else in the list.
  removeFolder(folders: Folder[], items: FolderItem[], folder: Folder) {
    const content = this.getChildren(folders, items, folder.uuid);

    content.forEach((child, index) => {
      // squeeze the content into the gap between the folder and its next sibling
      const sortIndex = (folder.sortIndex || 0) + (index + 1) / (content.length + 1);

      if (child.folder) {
        child.folder.parentUuid = folder.parentUuid;
        child.folder.sortIndex = sortIndex;
      } else {
        child.item.folderUuid = folder.parentUuid;
        child.item.sortIndex = sortIndex;
      }
    });

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
