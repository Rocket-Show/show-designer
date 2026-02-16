import { Injectable } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { BsModalService } from 'ngx-bootstrap/modal';
import { Observable } from 'rxjs';
import { finalize, map } from 'rxjs/operators';
import { Preset } from '../models/preset';
import { Project } from '../models/project';
import { WaitDialogComponent } from '../wait-dialog/wait-dialog.component';
import { FixtureService } from './fixture.service';
import { PresetService } from './preset.service';
import { PreviewService } from './preview.service';
import { ProjectService } from './project.service';
import { SceneService } from './scene.service';
import { TimelineService } from './timeline.service';
import { UuidService } from './uuid.service';
import { PresetFixture } from '../models/preset-fixture';
import { WarningDialogService } from './warning-dialog.service';

@Injectable({
  providedIn: 'root',
})
export class ProjectLoadService {
  constructor(
    private projectService: ProjectService,
    private previewService: PreviewService,
    private fixtureService: FixtureService,
    private presetService: PresetService,
    private sceneService: SceneService,
    private modalService: BsModalService,
    private uuidService: UuidService,
    private timelineService: TimelineService,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private warningDialogService: WarningDialogService
  ) {}

  private migrateToVersion2() {
    for (let fixture of this.projectService.project.fixtures) {
      if (this.fixtureService.fixtureHasGeneralChannel(fixture)) {
        const projectFixture = new PresetFixture();
        projectFixture.fixtureUuid = fixture.uuid;
        this.projectService.project.presetFixtures.push(projectFixture);
      }

      const pixels = this.fixtureService.fixtureGetUniquePixels(fixture);

      for (let pixelKey of pixels) {
        const projectFixture = new PresetFixture();
        projectFixture.fixtureUuid = fixture.uuid;
        projectFixture.pixelKey = pixelKey.key;
        this.projectService.project.presetFixtures.push(projectFixture);
      }
    }
    for (let preset of this.projectService.project.presets) {
      for (let fixtureUuid of preset.fixtureUuids) {
        const fixture = this.fixtureService.getFixtureByUuid(fixtureUuid);

        if (this.fixtureService.fixtureHasGeneralChannel(fixture)) {
          const presetFixture = new PresetFixture();
          presetFixture.fixtureUuid = fixtureUuid;
          preset.fixtures.push(presetFixture);
        }

        const pixels = this.fixtureService.fixtureGetUniquePixels(fixture);

        for (let pixel of pixels) {
          const presetFixture = new PresetFixture();
          presetFixture.fixtureUuid = fixtureUuid;
          presetFixture.pixelKey = pixel.key;
          preset.fixtures.push(presetFixture);
        }
      }
      preset.fixtureUuids = undefined;
    }
    this.projectService.project.version = 2;
  }

  private migrateFromOldProject() {
    let migrated = false;

    if (!this.projectService.project.version) {
      // Migrate from version 1
      this.migrateToVersion2();
      migrated = true;
    }

    if (migrated) {
      this.warningDialogService.show('designer.project.migrated').subscribe();
    }
  }

  private afterLoad() {
    this.migrateFromOldProject();
    this.fixtureService.updateCachedFixtures();
    this.presetService.removeDeletedFixtures();
    this.previewService.updateFixtureSetup();
    this.presetService.fixtureSelectionChanged.next();
    this.presetService.autoOpenFirstEffect();
    this.previewService.updateStage();
    this.presetService.previewLive();
    this.sceneService.selectPresetFromSelectedScene();
  }

  private selectScenesPresetComposition() {
    this.presetService.selectedPreset = this.presetService.getPresetByUuid(this.projectService.project.selectedPresetUuid);
    this.sceneService.selectedScenes = [];
    if (this.projectService.project.selectedSceneUuids) {
      for (const uuid of this.projectService.project.selectedSceneUuids) {
        this.sceneService.selectedScenes.push(this.sceneService.getSceneByUuid(uuid));
      }
    }
    this.timelineService.selectedComposition = undefined;
    this.timelineService.selectedCompositionIndex = undefined;
    this.timelineService.destroyWaveSurfer();
    for (let i = 0; i < this.projectService.project.compositions.length; i++) {
      if (this.projectService.project.compositions[i].uuid === this.projectService.project.selectedCompositionUuid) {
        this.timelineService.selectCompositionIndex(i);
        break;
      }
    }
  }

  load(id: number, name: string, shareToken?: string): Observable<void> {
    const ref = this.modalService.show(WaitDialogComponent, { keyboard: false, ignoreBackdropClick: true });

    return this.projectService.getProject(id, name, shareToken).pipe(
      map((project) => {
        if (project.version > this.projectService.currentProjectVersion) {
          throw new Error(
            'The project version ' +
              project.version +
              ' is created with a newer version of the designer. Please update your Rocket Show version to open this project.'
          );
        }
        this.projectService.project = project;
        this.selectScenesPresetComposition();
        this.afterLoad();

        const queryParams: Params = {
          id,
          token: project.shareToken,
        };
        this.router.navigate([], {
          relativeTo: this.activatedRoute,
          queryParams,
          queryParamsHandling: 'merge', // remove to replace all query params by provided
        });
      }),
      finalize(() => {
        // hide the modal again because of:
        // https://github.com/valor-software/ngx-bootstrap/issues/3711
        setTimeout(() => {
          ref.hide();
        }, 250);
        setTimeout(() => {
          ref.hide();
        }, 500);
        setTimeout(() => {
          ref.hide();
        }, 1500);
      })
    );
  }

  new() {
    // create an empty new project
    const project = new Project();
    project.uuid = this.uuidService.getUuid();
    project.version = this.projectService.currentProjectVersion;
    this.projectService.project = project;
    this.projectService.project.shareToken = this.uuidService.getUuid();

    // Add a default scene and preset
    const preset = new Preset();
    preset.uuid = this.uuidService.getUuid();
    preset.name = 'New Preset';
    this.projectService.project.presets.push(preset);
    this.presetService.selectPreset(0);

    this.sceneService.addScene();
    this.projectService.project.scenes[0].presetUuids.push(preset.uuid);

    this.projectService.project.previewPreset = true;

    this.sceneService.selectedScenes = [this.projectService.project.scenes[0]];
    this.presetService.selectedPreset = this.projectService.project.presets[0];

    this.timelineService.selectedComposition = undefined;
    this.timelineService.selectedCompositionIndex = undefined;
    this.timelineService.destroyWaveSurfer();

    this.afterLoad();

    const queryParams: Params = {
      id: '',
      token: '',
    };
    this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams,
      queryParamsHandling: 'merge', // remove to replace all query params by provided
    });
  }

  template() {
    // load the template project with id 1
    this.load(1, null).subscribe(() => {
      this.projectService.project.id = undefined;
    });
  }

  import(data: string) {
    // import a project from a string
    const project = new Project(JSON.parse(data));
    project.id = undefined;
    this.projectService.project = project;

    this.selectScenesPresetComposition();
    this.afterLoad();
  }
}
