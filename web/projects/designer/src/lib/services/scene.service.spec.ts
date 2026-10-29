import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { EffectCurve } from '../models/effect-curve';
import { Project } from '../models/project';
import { Scene } from '../models/scene';
import { EffectService } from './effect.service';
import { LivePreviewService } from './live-preview.service';
import { PresetService } from './preset.service';
import { ProjectService } from './project.service';
import { SceneService } from './scene.service';

// The scenes of a project: the presets they layer, which of them are selected, and adding,
// copying and removing them.
describe('SceneService', () => {
  let service: SceneService;
  let presetService: PresetService;
  let project: Project;
  let previewLive: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    project = new Project({
      presets: [{ uuid: 'red' }, { uuid: 'blue' }, { uuid: 'green' }],
      scenes: [
        { uuid: 'verse', name: 'Verse', presetUuids: ['red', 'blue'], sortIndex: 0 },
        { uuid: 'chorus', name: 'Chorus', presetUuids: ['blue', 'missing', 'blue'], sortIndex: 1 },
      ],
      compositions: [
        {
          uuid: 'song',
          name: 'Song',
          scenePlaybackRegions: [
            { sceneUuid: 'verse', startMillis: 0, endMillis: 1000 },
            { sceneUuid: 'chorus', startMillis: 1000, endMillis: 2000 },
            { sceneUuid: 'verse', startMillis: 2000, endMillis: 3000 },
          ],
        },
      ],
    });
    TestBed.inject(ProjectService).project = project;

    service = TestBed.inject(SceneService);
    presetService = TestBed.inject(PresetService);
    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');
  });

  function scene(uuid: string): Scene {
    return project.scenes.find((candidate) => candidate.uuid === uuid);
  }

  it('shows a scene with its own icon or the default one', () => {
    expect(service.getSceneIcon(scene('verse'))).toBe(SceneService.defaultIcon);

    scene('verse').icon = 'fa-star';
    expect(service.getSceneIcon(scene('verse'))).toBe('fa-star');
  });

  it('knows a selected scene by its uuid', () => {
    service.selectedScenes = [new Scene({ uuid: 'verse' })];

    expect(service.sceneIsSelected(scene('verse'))).toBe(true);
    expect(service.sceneIsSelected(scene('chorus'))).toBe(false);
  });

  it('layers the presets of a scene once each, leaving out the missing ones', () => {
    expect(service.getScenePresets(scene('verse')).map((preset) => preset.uuid)).toEqual(['red', 'blue']);
    expect(service.getScenePresets(scene('chorus')).map((preset) => preset.uuid)).toEqual(['blue']);
  });

  it('adds a preset to a scene where it is dropped, or on the bottom', () => {
    const changed = jasmine.createSpy('scenesChanged');
    service.scenesChanged.subscribe(changed);
    const green = presetService.getPresetByUuid('green');

    service.addPresetToScene(scene('verse'), green, 1);
    expect(scene('verse').presetUuids).toEqual(['red', 'green', 'blue']);

    // a preset is only once in a scene
    service.addPresetToScene(scene('verse'), green);
    expect(scene('verse').presetUuids).toEqual(['red', 'green', 'blue']);

    service.addPresetToScene(scene('chorus'), green, 99);
    expect(scene('chorus').presetUuids[scene('chorus').presetUuids.length - 1]).toBe('green');

    expect(changed).toHaveBeenCalledTimes(2);
    expect(previewLive).toHaveBeenCalledTimes(2);
  });

  it('removes a preset from a scene', () => {
    service.removePresetFromScene(scene('verse'), presetService.getPresetByUuid('red'));
    expect(scene('verse').presetUuids).toEqual(['blue']);

    // a preset which isn't in the scene changes nothing
    service.removePresetFromScene(scene('verse'), presetService.getPresetByUuid('green'));
    expect(scene('verse').presetUuids).toEqual(['blue']);
    expect(previewLive).toHaveBeenCalledTimes(1);
  });

  it('removes a deleted preset from every scene, also where it is listed twice', () => {
    service.removePresetFromAllScenes(presetService.getPresetByUuid('blue'));

    expect(scene('verse').presetUuids).toEqual(['red']);
    expect(scene('chorus').presetUuids).toEqual(['missing']);
  });

  it('marks the presets of a scene only while that scene alone is selected', () => {
    const red = presetService.getPresetByUuid('red');

    expect(service.presetIsSelected(red)).toBe(false);

    service.selectedScenes = [scene('verse')];
    expect(service.presetIsSelected(red)).toBe(true);
    expect(service.presetIsSelected(presetService.getPresetByUuid('green'))).toBe(false);

    service.selectedScenes = [scene('verse'), scene('chorus')];
    expect(service.presetIsSelected(red)).toBe(false);
  });

  it('picks the first preset of the selected scenes to edit, unless one of them is edited already', () => {
    const selectPreset = spyOn(presetService, 'selectPreset');

    service.selectedScenes = [scene('chorus')];
    presetService.selectedPreset = presetService.getPresetByUuid('blue');
    service.selectPresetFromSelectedScene();
    expect(selectPreset).not.toHaveBeenCalled();

    presetService.selectedPreset = presetService.getPresetByUuid('green');
    service.selectedScenes = [scene('verse')];
    service.selectPresetFromSelectedScene();
    expect(selectPreset).toHaveBeenCalledWith(0);
  });

  it('picks nothing to edit from scenes without presets', () => {
    const selectPreset = spyOn(presetService, 'selectPreset');
    service.selectedScenes = [new Scene({ uuid: 'empty' })];

    service.selectPresetFromSelectedScene();

    expect(selectPreset).not.toHaveBeenCalled();
  });

  it('selects scenes for the preview, and the preset which was clicked in them', () => {
    const selectPreset = spyOn(presetService, 'selectPreset');
    const selected = jasmine.createSpy('sceneSelected');
    service.sceneSelected.subscribe(selected);
    const effectService = TestBed.inject(EffectService);
    effectService.selectedEffect = new EffectCurve();

    service.selectScenes([scene('verse'), scene('chorus')], presetService.getPresetByUuid('blue'));

    expect(project.selectedSceneUuids).toEqual(['verse', 'chorus']);
    expect(selectPreset).toHaveBeenCalledWith(1);
    expect(effectService.selectedEffect).toBeUndefined();
    expect(selected).toHaveBeenCalled();
    expect(previewLive).toHaveBeenCalled();

    service.selectScene(1);
    expect(service.selectedScenes).toEqual([scene('chorus')]);

    // past the last scene there is nothing to select
    service.selectScene(2);
    expect(service.selectedScenes).toEqual([]);
    expect(project.selectedSceneUuids).toEqual([]);
  });

  it('adds a scene at the end, or right above the one clicked last', () => {
    const added = service.addScene();

    expect(added.name).toBe('New Scene');
    expect(added.color).toBeTruthy();
    expect(project.scenes.map((candidate) => candidate.uuid)).toEqual(['verse', 'chorus', added.uuid]);
    expect(added.sortIndex).toBe(2);
    expect(service.selectedScenes).toEqual([added]);

    const above = service.addScene('Intro', undefined, scene('verse'));

    expect(above.name).toBe('Intro');
    expect(project.scenes.map((candidate) => candidate.name)).toEqual(['Intro', 'Verse', 'Chorus', 'New Scene']);
    expect(project.scenes.map((candidate) => candidate.sortIndex)).toEqual([0, 1, 2, 3]);
  });

  it('copies a scene right below it, sharing its presets', () => {
    const copy = service.duplicateScene(scene('verse'), 'Verse 2');

    expect(copy.uuid).not.toBe('verse');
    expect(copy.name).toBe('Verse 2');
    expect(copy.presetUuids).toEqual(['red', 'blue']);
    expect(project.scenes.map((candidate) => candidate.name)).toEqual(['Verse', 'Verse 2', 'Chorus']);
    expect(service.selectedScenes).toEqual([copy]);

    // without a name of its own, it is called like the original
    expect(service.duplicateScene(scene('chorus')).name).toBe('Chorus');
  });

  it('removes a scene with its clips and selects the first one left', () => {
    const deleted = jasmine.createSpy('sceneDeleted');
    service.sceneDeleted.subscribe(deleted);

    service.removeScene(scene('verse'));

    expect(project.scenes.map((candidate) => candidate.uuid)).toEqual(['chorus']);
    expect(project.compositions[0].scenePlaybackRegions.map((region) => region.sceneUuid)).toEqual(['chorus']);
    expect(service.selectedScenes).toEqual([scene('chorus')]);
    expect(deleted).toHaveBeenCalled();

    service.removeScene(scene('chorus'));
    expect(service.selectedScenes).toEqual([]);

    // a scene which isn't in the project changes nothing
    service.removeScene(new Scene({ uuid: 'other' }));
    expect(deleted).toHaveBeenCalledTimes(2);
  });

  it('finds a scene by its uuid', () => {
    expect(service.getSceneByUuid('chorus')).toBe(scene('chorus'));
    expect(service.getSceneByUuid('missing')).toBeUndefined();
  });
});
