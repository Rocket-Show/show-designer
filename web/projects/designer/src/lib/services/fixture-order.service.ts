import { Injectable } from '@angular/core';
import { Folder } from '../models/folder';
import { Preset } from '../models/preset';
import { PresetFixture } from '../models/preset-fixture';
import { FolderService } from './folder.service';
import { ProjectService } from './project.service';

/**
 * The fixture order of the project: its fixtures grouped in folders, plus the presets
 * which bring an order of their own inside those same folders.
 *
 * The fixture panel and the fixture pool both show and edit these folders, so both keep
 * everything which follows from them in step from here.
 */
@Injectable({
  providedIn: 'root',
})
export class FixtureOrderService {
  constructor(private projectService: ProjectService, private folderService: FolderService) {}

  // a fixture together with one of its pixels, the key an entry of a preset and the
  // project's own entry are matched by
  fixtureKey(presetFixture: PresetFixture): string {
    return presetFixture.fixtureUuid + '/' + (presetFixture.pixelKey || '');
  }

  // the project's fixture list by fixture and pixel, to look a preset's own entries up
  // without walking it for each of them
  getProjectFixtures(): Map<string, PresetFixture> {
    const projectFixtures = new Map<string, PresetFixture>();

    for (const projectFixture of this.projectService.project.presetFixtures) {
      projectFixtures.set(this.fixtureKey(projectFixture), projectFixture);
    }

    return projectFixtures;
  }

  // The folders as a tree orders them: the project's own order, or the positions the
  // preset gives them. The copies only carry the order, the tree gets the real folders.
  getFolders(preset?: Preset): Folder[] {
    if (!preset) {
      return this.projectService.project.fixtureFolders;
    }

    return this.projectService.project.fixtureFolders.map((folder) => {
      const ordered = new Folder(folder);
      const position = preset.fixtureFolders.find((candidate) => candidate.folderUuid === folder.uuid);

      ordered.sortIndex = position ? position.sortIndex : folder.sortIndex;

      return ordered;
    });
  }

  // bring the project's flat fixture list into the order its folders show
  sortProjectFixtures() {
    this.folderService.sortItems(this.projectService.project.fixtureFolders, this.projectService.project.presetFixtures);
  }

  // The folders are the rig, shared by every preset: a fixture moved into another one,
  // or a folder which is gone, moves inside the order of every preset which brings its
  // own as well. Only run this when the project's own list changed, it walks them all.
  syncPresetOrders() {
    const projectFixtures = this.getProjectFixtures();

    for (const preset of this.projectService.project.presets) {
      // a preset only positions folders which are there
      preset.fixtureFolders = preset.fixtureFolders.filter((position) =>
        this.projectService.project.fixtureFolders.some((folder) => folder.uuid === position.folderUuid)
      );

      if (!preset.useGlobalFixtureOrder) {
        this.syncPresetOrder(preset, projectFixtures);
      }
    }
  }

  // A fixture just checked for the preset, or one the project moved into another folder,
  // has no place of its own there yet -> it goes to the end of that folder. Afterwards
  // the preset's own list follows what the tree shows again: it is its chase order.
  syncPresetOrder(preset: Preset, projectFixtures: Map<string, PresetFixture> = this.getProjectFixtures()) {
    // the last position each folder handed out, so an arrival lands after what is in it
    const last = new Map<string, number>();
    const note = (folderUuid: string, sortIndex: number) =>
      last.set(folderUuid || '', Math.max(last.get(folderUuid || '') ?? -1, sortIndex));
    const next = (folderUuid: string): number => {
      const sortIndex = (last.get(folderUuid || '') ?? -1) + 1;
      last.set(folderUuid || '', sortIndex);

      return sortIndex;
    };

    for (const folder of this.projectService.project.fixtureFolders) {
      const position = preset.fixtureFolders.find((candidate) => candidate.folderUuid === folder.uuid);

      note(folder.parentUuid, position ? position.sortIndex : folder.sortIndex || 0);
    }

    for (const entry of preset.fixtures) {
      const projectFixture = projectFixtures.get(this.fixtureKey(entry));

      if (projectFixture && entry.folderUuid === projectFixture.folderUuid && entry.sortIndex !== undefined && entry.sortIndex !== null) {
        note(entry.folderUuid, entry.sortIndex);
      }
    }

    for (const entry of preset.fixtures) {
      const projectFixture = projectFixtures.get(this.fixtureKey(entry));
      const folderUuid = projectFixture ? projectFixture.folderUuid : undefined;

      if (entry.folderUuid !== folderUuid || entry.sortIndex === undefined || entry.sortIndex === null) {
        entry.sortIndex = next(folderUuid);
      }

      // the folders are the project's, only the position inside them is the preset's
      entry.folderUuid = folderUuid;
    }

    this.folderService.sortItems(this.getFolders(preset), preset.fixtures);
  }
}
