import { Folder } from '../models/folder';
import { FolderPosition } from '../models/folder-position';
import { Preset } from '../models/preset';
import { PresetFixture } from '../models/preset-fixture';
import { Project } from '../models/project';
import { FixtureOrderService } from './fixture-order.service';
import { FolderService } from './folder.service';

// The fixture order of the project (its fixtures in folders) and the presets which chase in an
// order of their own inside those same folders.
describe('FixtureOrderService', () => {
  let service: FixtureOrderService;
  let project: Project;

  beforeEach(() => {
    project = new Project({
      fixtureFolders: [
        { uuid: 'front', name: 'Front', sortIndex: 0 },
        { uuid: 'back', name: 'Back', sortIndex: 1 },
      ],
      presetFixtures: [
        { fixtureUuid: 'b1', folderUuid: 'back', sortIndex: 0 },
        { fixtureUuid: 'f1', folderUuid: 'front', sortIndex: 1 },
        { fixtureUuid: 'f2', folderUuid: 'front', sortIndex: 0 },
        { fixtureUuid: 'bar', pixelKey: '1', sortIndex: 2 },
      ],
    });

    service = new FixtureOrderService({ project } as any, new FolderService(undefined));
  });

  function keys(presetFixtures: PresetFixture[]): string[] {
    return presetFixtures.map((presetFixture) => service.fixtureKey(presetFixture));
  }

  it('matches the entries of a preset and of the project by fixture and pixel', () => {
    expect(service.fixtureKey(new PresetFixture({ fixtureUuid: 'bar', pixelKey: '1' }))).toBe('bar/1');
    expect(service.fixtureKey(new PresetFixture({ fixtureUuid: 'bar' }))).toBe('bar/');

    const projectFixtures = service.getProjectFixtures();
    expect(projectFixtures.get('f1')).toBeUndefined();
    expect(projectFixtures.get('f1/')).toBe(project.presetFixtures[1]);
  });

  it('orders the folders like the project, or like a preset places them', () => {
    expect(service.getFolders()).toBe(project.fixtureFolders);

    const preset = new Preset({
      fixtureFolders: [
        { folderUuid: 'back', sortIndex: 0 },
        { folderUuid: 'front', sortIndex: 1 },
      ],
    });
    const folders = service.getFolders(preset);

    expect(folders.map((folder) => [folder.uuid, folder.sortIndex])).toEqual([
      ['front', 1],
      ['back', 0],
    ]);
    // the copies carry the order only, the project's folders stay as they are
    expect(project.fixtureFolders[0].sortIndex).toBe(0);
    expect(folders[0]).not.toBe(project.fixtureFolders[0]);

    // a folder the preset doesn't place stays where the project has it
    expect(service.getFolders(new Preset({})).map((folder) => folder.sortIndex)).toEqual([0, 1]);
  });

  it('brings the fixtures of the project into the order of its folders', () => {
    service.sortProjectFixtures();

    expect(keys(project.presetFixtures)).toEqual(['f2/', 'f1/', 'b1/', 'bar/1']);
  });

  it('moves a fixture within the order of a preset when the project moves it into another folder', () => {
    const preset = new Preset({
      useGlobalFixtureOrder: false,
      fixtures: [
        { fixtureUuid: 'f1', folderUuid: 'front', sortIndex: 0 },
        // moved into the back by the project
        { fixtureUuid: 'f2', folderUuid: 'front', sortIndex: 1 },
        // just checked for the preset
        { fixtureUuid: 'b1' },
      ],
    });
    project.presetFixtures[2].folderUuid = 'back';

    service.syncPresetOrder(preset);

    // the arrivals go to the end of their folder, the others keep their place
    expect(preset.fixtures.map((presetFixture) => [presetFixture.fixtureUuid, presetFixture.folderUuid, presetFixture.sortIndex])).toEqual([
      ['f1', 'front', 0],
      ['f2', 'back', 0],
      ['b1', 'back', 1],
    ]);
  });

  it('forgets the folders which are gone from the presets, and syncs the ones with an order of their own', () => {
    const ownOrder = new Preset({
      useGlobalFixtureOrder: false,
      fixtures: [{ fixtureUuid: 'f1' }],
      fixtureFolders: [{ folderUuid: 'gone' }, { folderUuid: 'front' }],
    });
    const globalOrder = new Preset({ fixtures: [{ fixtureUuid: 'f1' }], fixtureFolders: [{ folderUuid: 'gone' }] });
    project.presets = [ownOrder, globalOrder];

    service.syncPresetOrders();

    expect(ownOrder.fixtureFolders.map((position: FolderPosition) => position.folderUuid)).toEqual(['front']);
    expect(globalOrder.fixtureFolders).toEqual([]);
    expect(ownOrder.fixtures[0].folderUuid).toBe('front');
    // a preset following the project keeps its list as it is
    expect(globalOrder.fixtures[0].folderUuid).toBeUndefined();
  });

  it('places a nested folder of the project among its siblings in a preset', () => {
    project.fixtureFolders.push(new Folder({ uuid: 'truss', parentUuid: 'front', sortIndex: 2 }));
    const preset = new Preset({ useGlobalFixtureOrder: false, fixtures: [{ fixtureUuid: 'f1' }, { fixtureUuid: 'f2' }] });

    service.syncPresetOrder(preset);

    // after the folder inside the front
    expect(preset.fixtures.map((presetFixture) => presetFixture.sortIndex)).toEqual([3, 4]);
  });
});
