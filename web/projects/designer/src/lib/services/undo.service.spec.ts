import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { Project } from '../models/project';
import { ProjectLoadService } from './project-load.service';
import { ProjectService } from './project.service';
import { UndoService } from './undo.service';

describe('UndoService', () => {
  let projectService: { project: Project; projectChanged: Subject<void> };
  let service: UndoService;

  beforeEach(() => {
    projectService = { project: new Project(), projectChanged: new Subject<void>() };

    const projectLoadService = {
      restoreProject: (project: Project) => {
        projectService.project = project;
      },
    };

    TestBed.configureTestingModule({
      providers: [
        UndoService,
        { provide: ProjectService, useValue: projectService },
        { provide: ProjectLoadService, useValue: projectLoadService },
      ],
    });

    service = TestBed.inject(UndoService);

    // the state the project starts out with
    service.captureChanges();
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('has nothing to undo before something has been changed', () => {
    service.captureChanges();

    expect(service.canUndo).toBe(false);
    expect(service.canRedo).toBe(false);
  });

  it('undoes and redoes a change', () => {
    projectService.project.stageWidthCm = 800;
    service.captureChanges();

    expect(service.canUndo).toBe(true);

    service.undo();

    expect(projectService.project.stageWidthCm).toBe(600);
    expect(service.canUndo).toBe(false);
    expect(service.canRedo).toBe(true);

    service.redo();

    expect(projectService.project.stageWidthCm).toBe(800);
    expect(service.canUndo).toBe(true);
    expect(service.canRedo).toBe(false);
  });

  it('undoes a change which has not been collected into a step yet', () => {
    projectService.project.stageWidthCm = 800;

    service.undo();

    expect(projectService.project.stageWidthCm).toBe(600);
  });

  it('collects everything changed in between into one step', () => {
    projectService.project.stageWidthCm = 800;
    projectService.project.stageHeightCm = 400;
    service.captureChanges();

    service.undo();

    expect(projectService.project.stageWidthCm).toBe(600);
    expect(projectService.project.stageHeightCm).toBe(350);
    expect(service.canUndo).toBe(false);
  });

  it('does not make a step out of what is selected', () => {
    projectService.project.selectedPresetUuid = 'a-preset';
    projectService.project.selectedSceneUuids = ['a-scene'];
    projectService.project.previewPreset = true;
    service.captureChanges();

    expect(service.canUndo).toBe(false);
  });

  it('keeps what is selected through an undo', () => {
    projectService.project.stageWidthCm = 800;
    service.captureChanges();
    projectService.project.selectedPresetUuid = 'a-preset';

    service.undo();

    expect(projectService.project.stageWidthCm).toBe(600);
    expect(projectService.project.selectedPresetUuid).toBe('a-preset');
  });

  it('drops the redo steps as soon as something else is changed', () => {
    projectService.project.stageWidthCm = 800;
    service.captureChanges();
    service.undo();

    expect(service.canRedo).toBe(true);

    projectService.project.stageDepthCm = 700;
    service.captureChanges();

    expect(service.canRedo).toBe(false);
  });

  it('starts without a history, when another project is loaded', () => {
    projectService.project.stageWidthCm = 800;
    service.captureChanges();

    projectService.project = new Project();
    projectService.projectChanged.next();

    expect(service.canUndo).toBe(false);
    expect(service.canRedo).toBe(false);
  });
});
