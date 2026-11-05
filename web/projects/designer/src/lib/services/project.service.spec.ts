import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule, ToastrService } from 'ngx-toastr';

import { FixtureCapabilityColor, FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { Preset } from '../models/preset';
import { PresetStep } from '../models/preset-step';
import { Project } from '../models/project';
import { Scene } from '../models/scene';

import { ColorService } from './color.service';
import { ConfigService } from './config.service';
import { ProjectService } from './project.service';
import { SCENE_COLOR_SOURCE } from './scene-color-source';
import { UserService } from './user.service';

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

  it('writes the colors into an exported file as well, indented', () => {
    const project = new Project();
    project.presets = [preset('red', 1, 0, 0)];
    project.scenes = [scene('by-presets', ['red'])];
    service.project = project;

    const exported = service.getSavedJson(project, 2);

    expect(JSON.parse(exported).scenes[0].displayColor).toBe('#ff0000');
    expect(exported).toContain('\n  "');
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

// Saving, listing, opening and deleting the projects of a user on the designer API.
describe('ProjectService with the designer API', () => {
  let service: ProjectService;
  let http: HttpTestingController;
  let userService: UserService;
  let toastr: ToastrService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    service = TestBed.inject(ProjectService);
    http = TestBed.inject(HttpTestingController);
    userService = TestBed.inject(UserService);
    toastr = TestBed.inject(ToastrService);
    spyOn(userService, 'getHeaders').and.returnValue(new HttpHeaders({ Authorization: 'secret' }));
    spyOn(userService, 'setAutoLoadProject');
    spyOn(toastr, 'success');
    spyOn(toastr, 'error');
  });

  afterEach(() => {
    http.verify();
  });

  function presetWithSteps(...steps: PresetStep[]): Preset {
    const preset = new Preset();
    preset.steps = steps;
    return preset;
  }

  it('writes the values of the first step onto each preset, for a Rocket Show without steps', () => {
    const value = new FixtureCapabilityValue();
    const first = new PresetStep();
    first.fixtureCapabilityValues = [value];
    const project = new Project();
    project.presets = [presetWithSteps(first, new PresetStep()), presetWithSteps()];
    project.presets[1].fixtureCapabilityValues = [value];

    service.writeCompatibilityValues(project);

    expect(project.presets[0].fixtureCapabilityValues).toEqual([value]);
    // a copy, which changes with the step only on the next save
    expect(project.presets[0].fixtureCapabilityValues).not.toBe(first.fixtureCapabilityValues);
    expect(project.presets[0].fixtureChannelValues).toEqual([]);
    expect(project.presets[1].fixtureCapabilityValues).toEqual([]);
  });

  it('saves a project and keeps the id and the share token it is given', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate');
    const project = new Project({ name: 'Show', presets: [{ uuid: 'p', steps: [{ uuid: 's' }] }] });

    service.save(project);

    const request = http.expectOne('project');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('secret');
    expect(JSON.parse(request.request.body).name).toBe('Show');
    request.flush({ id: 12, shareToken: 'shared' });

    expect(project.id).toBe(12);
    expect(project.shareToken).toBe('shared');
    expect(navigate.calls.mostRecent().args[1].queryParams).toEqual({ id: 12, token: 'shared' });
    expect(toastr.success).toHaveBeenCalled();
    expect(userService.setAutoLoadProject).toHaveBeenCalledWith(project);
  });

  it('keeps the share token a project has, if the API sends none', () => {
    spyOn(TestBed.inject(Router), 'navigate');
    const project = new Project({ name: 'Show', shareToken: 'mine' });

    service.save(project);
    http.expectOne('project').flush({ id: 3 });

    expect(project.shareToken).toBe('mine');
  });

  it('saves the universes with the project, where they are edited freely', () => {
    const configService = TestBed.inject(ConfigService);
    configService.freeUniverseEdit = true;
    configService.universes = [{ uuid: 'u', name: 'Stage' }];
    const project = new Project({ name: 'Show' });

    service.save(project);

    expect(JSON.parse(http.expectOne('project').request.body).universes).toEqual([{ uuid: 'u', name: 'Stage' }]);
  });

  it('tells why a project could not be saved', () => {
    service.save(new Project({ name: 'Show' }));
    http.expectOne('project').flush({ error: 'quota exceeded' }, { status: 500, statusText: 'Server Error' });

    expect((toastr.error as jasmine.Spy).calls.mostRecent().args[0]).toContain('(quota exceeded)');
    expect(userService.setAutoLoadProject).not.toHaveBeenCalled();

    service.save(new Project({ name: 'Show' }));
    http.expectOne('project').flush(null, { status: 502, statusText: 'Bad Gateway' });

    expect((toastr.error as jasmine.Spy).calls.mostRecent().args[0]).toContain('(unknown)');
  });

  it('lists the projects of the user', () => {
    let projects: Project[];

    service.getAllProjects().subscribe((result) => (projects = result));
    http.expectOne('projects').flush([
      { id: 1, name: 'One' },
      { id: 2, name: 'Two' },
    ]);

    expect(projects.map((project) => project instanceof Project)).toEqual([true, true]);
    expect(projects.map((project) => project.name)).toEqual(['One', 'Two']);
  });

  it('opens a project, named for an address', () => {
    let project: Project;

    service.getProject(5, 'Rock & Roll #1', 'a+b').subscribe((result) => (project = result));
    const request = http.expectOne('project?id=5&name=Rock%20%26%20Roll%20%231&token=a%2Bb');
    expect(request.request.headers.get('Authorization')).toBe('secret');
    request.flush({ name: 'Rock & Roll #1' });

    expect(project.id).toBe(5);
    expect(project.name).toBe('Rock & Roll #1');
  });

  it('opens the template without a name or a token', () => {
    service.getProject(1, null).subscribe();

    http.expectOne('project?id=1&name=&token=').flush({});
  });

  it('deletes a project, named for an address', () => {
    service.deleteProject(new Project({ id: 5, name: 'Rock & Roll' })).subscribe();

    const request = http.expectOne('project?id=5&name=Rock%20%26%20Roll');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });
});
