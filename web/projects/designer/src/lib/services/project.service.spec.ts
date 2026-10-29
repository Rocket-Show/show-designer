import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { FixtureCapabilityColor, FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { Preset } from '../models/preset';
import { PresetStep } from '../models/preset-step';
import { Project } from '../models/project';
import { Scene } from '../models/scene';

import { ColorService } from './color.service';
import { ProjectService } from './project.service';
import { SCENE_COLOR_SOURCE } from './scene-color-source';

// Rocket Show shows the scenes on its Play screen in the color the designer marks them
// with. It can't work out a color decided by the presets of a scene, so the designer saves
// it with the scene.
describe('ProjectService saving the colors of the scenes', () => {
  let service: ProjectService;

  // a preset which lights its fixtures in the passed color
  function preset(uuid: string, red: number, green: number, blue: number): Preset {
    const step = new PresetStep();

    step.fixtureCapabilityValues = [
      [FixtureCapabilityColor.Red, red],
      [FixtureCapabilityColor.Green, green],
      [FixtureCapabilityColor.Blue, blue],
    ].map(([color, value]: [FixtureCapabilityColor, number]) => {
      const capabilityValue = new FixtureCapabilityValue();
      capabilityValue.type = FixtureCapabilityType.ColorIntensity;
      capabilityValue.color = color;
      capabilityValue.valuePercentage = value;
      return capabilityValue;
    });

    const result = new Preset();
    result.uuid = uuid;
    result.steps = [step];
    return result;
  }

  function scene(uuid: string, presetUuids: string[]): Scene {
    const result = new Scene();
    result.uuid = uuid;
    result.presetUuids = presetUuids;
    result.color = '#945fda';
    return result;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // like the DesignerModule does
        { provide: SCENE_COLOR_SOURCE, useExisting: ColorService },
      ],
    });

    service = TestBed.inject(ProjectService);
  });

  it('saves the color each scene is marked with', () => {
    const project = new Project();
    project.presets = [preset('red', 1, 0, 0)];

    const byPresets = scene('by-presets', ['red']);
    const picked = scene('picked', ['red']);
    picked.colorAuto = false;
    picked.color = '#00ff00';
    const withoutColor = scene('without-color', []);

    project.scenes = [byPresets, picked, withoutColor];
    service.project = project;

    const saved = JSON.parse(service.getSavedJson(project));

    expect(saved.scenes.map((savedScene: any) => savedScene.displayColor)).toEqual(['#ff0000', '#00ff00', '#945fda']);
    // everything else of the scene stays as it is
    expect(saved.scenes[0].presetUuids).toEqual(['red']);
    expect(saved.scenes[0].colorAuto).toBe(true);
  });

  it('leaves the project itself as it is', () => {
    const project = new Project();
    project.presets = [preset('red', 1, 0, 0)];
    project.scenes = [scene('by-presets', ['red'])];
    service.project = project;

    service.getSavedJson(project);

    expect('displayColor' in project.scenes[0]).toBe(false);
  });
});
