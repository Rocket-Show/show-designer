import { Folder } from '../models/folder';
import { FolderPosition } from '../models/folder-position';
import { FolderItem, FolderService } from './folder.service';

// The folders of the trees (presets, scenes, fixtures): folders and items of the same parent are
// ordered together, and the flat list of the project follows the order of the tree.
describe('FolderService', () => {
  let service: FolderService;
  let uuids: number;

  beforeEach(() => {
    uuids = 0;
    service = new FolderService({ getUuid: () => 'folder-' + ++uuids } as any);
  });

  function item(name: string, folderUuid?: string, sortIndex?: number): FolderItem & { name: string } {
    return { name, folderUuid, sortIndex };
  }

  function names(children: { folder?: Folder; item?: any }[]): string[] {
    return children.map((child) => (child.folder ? 'folder ' + child.folder.name : child.item.name));
  }

  it('adds a folder at the end of its parent', () => {
    const folders: Folder[] = [];
    const items = [item('a', undefined, 0), item('b', undefined, 1)];

    const folder = service.createFolder(folders, items, 'Front');

    expect(folder.uuid).toBe('folder-1');
    expect(folder.name).toBe('Front');
    expect(folder.parentUuid).toBeUndefined();
    expect(folder.sortIndex).toBe(2);
    expect(folders).toEqual([folder]);

    const inner = service.createFolder(folders, items, 'Inner', folder.uuid);
    expect(inner.parentUuid).toBe(folder.uuid);
    expect(inner.sortIndex).toBe(0);
  });

  it('places an item which appears by itself at the end of its folder', () => {
    const folders = [new Folder({ uuid: 'f', sortIndex: 0 })];
    const items = [item('a', 'f', 0)];
    const added = item('added');

    service.placeLast(folders, items, added, 'f');

    expect(added.folderUuid).toBe('f');
    expect(added.sortIndex).toBe(1);
  });

  it('orders the folders and items of a parent together', () => {
    const folders = [
      new Folder({ uuid: 'f', name: 'F', sortIndex: 1 }),
      new Folder({ uuid: 'g', name: 'G', parentUuid: 'f', sortIndex: 0 }),
    ];
    const items = [item('c', undefined, 2), item('a'), item('in f', 'f', 1), item('in g', 'g')];

    // an item without a sort index comes first, like one at 0
    expect(names(service.getChildren(folders, items))).toEqual(['a', 'folder F', 'c']);
    expect(names(service.getChildren(folders, items, 'f'))).toEqual(['folder G', 'in f']);
    expect(names(service.getChildren(folders, items, 'g'))).toEqual(['in g']);
  });

  it('takes an empty folder for the top level', () => {
    const items = [item('top', '', 0), item('also top', undefined, 1)];

    expect(names(service.getChildren([], items, undefined))).toEqual(['top', 'also top']);
  });

  it('finds the folders inside a folder at any depth', () => {
    const top = new Folder({ uuid: 'top' });
    const middle = new Folder({ uuid: 'middle', parentUuid: 'top' });
    const bottom = new Folder({ uuid: 'bottom', parentUuid: 'middle' });
    const other = new Folder({ uuid: 'other' });

    expect(service.getFolderWithDescendants([top, middle, bottom, other], top)).toEqual([top, middle, bottom]);
    expect(service.getFolderWithDescendants([top, middle, bottom, other], other)).toEqual([other]);
  });

  it('moves the content of a removed folder into its place', () => {
    const folder = new Folder({ uuid: 'f', name: 'F', sortIndex: 1 });
    const inner = new Folder({ uuid: 'inner', name: 'Inner', parentUuid: 'f', sortIndex: 1 });
    const folders = [folder, inner];
    const items = [item('before', undefined, 0), item('first in f', 'f', 0), item('second in f', 'f', 2), item('after', undefined, 2)];

    service.removeFolder(folders, items, folder);

    // nothing is lost, the content stands where the folder stood
    expect(folders).toEqual([inner]);
    expect(names(service.getChildren(folders, items))).toEqual(['before', 'first in f', 'folder Inner', 'second in f', 'after']);
    expect(service.getChildren(folders, items).map((child) => child.sortIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(inner.parentUuid).toBeUndefined();
  });

  it('removes a folder which is not in the list without touching the others', () => {
    const folders = [new Folder({ uuid: 'kept' })];

    service.removeFolder(folders, [], new Folder({ uuid: 'gone' }));

    expect(folders.length).toBe(1);
  });

  it('numbers the children of a parent from 0 again', () => {
    const folders = [new Folder({ uuid: 'f', sortIndex: 1.5 })];
    const items = [item('a', undefined, 0.25), item('b', undefined, 7), item('in f', 'f', 3)];

    service.renumber(folders, items);

    expect(items[0].sortIndex).toBe(0);
    expect(folders[0].sortIndex).toBe(1);
    expect(items[1].sortIndex).toBe(2);
    // the content of the folder keeps its numbers
    expect(items[2].sortIndex).toBe(3);
  });

  it('brings the flat list into the order of the tree', () => {
    const folders = [new Folder({ uuid: 'f', sortIndex: 0 }), new Folder({ uuid: 'g', parentUuid: 'f', sortIndex: 1 })];
    const items = [item('last', undefined, 1), item('in g', 'g', 0), item('in f', 'f', 0), item('lost', 'missing', 0)];

    service.sortItems(folders, items);

    // the item of a folder which is gone stays in the list, at its end
    expect(items.map((sortedItem: any) => sortedItem.name)).toEqual(['in f', 'in g', 'last', 'lost']);
  });

  it('reads the folders and their positions of a project', () => {
    const folder = new Folder({ uuid: 'f', name: 'Front', parentUuid: 'p', sortIndex: 3, expanded: false });
    expect([folder.uuid, folder.name, folder.parentUuid, folder.sortIndex, folder.expanded]).toEqual(['f', 'Front', 'p', 3, false]);
    expect(new Folder({ uuid: 'g' }).expanded).toBe(true);
    expect(new Folder({ uuid: 'g' }).sortIndex).toBe(0);

    const position = new FolderPosition({ folderUuid: 'f', sortIndex: 2 });
    expect([position.folderUuid, position.sortIndex]).toEqual(['f', 2]);
    expect(new FolderPosition({ folderUuid: 'f' }).sortIndex).toBe(0);
    expect(new FolderPosition().folderUuid).toBeUndefined();
  });
});
