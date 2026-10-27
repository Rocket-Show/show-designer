import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { inject, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';
import { of } from 'rxjs';

import { EffectCurve } from '../models/effect-curve';

import { FixtureService } from './fixture.service';
import { PresetService } from './preset.service';
import { ProjectLoadService } from './project-load.service';
import { ProjectService } from './project.service';
import { WarningDialogService } from './warning-dialog.service';

// The panels of the selected preset look its fixtures up in the fixture cache as soon as
// they hear of a new step. An imported project brings fixtures of its own, so the cache
// has to hold them by then: a fixture the panels don't find makes them fail, which ends
// their subscription for the rest of the session.
describe('ProjectLoadService importing a project with fixtures new to the designer', () => {
  let service: ProjectLoadService;
  let fixtureService: FixtureService;
  let presetService: PresetService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), BsModalService],
    });

    service = TestBed.inject(ProjectLoadService);
    fixtureService = TestBed.inject(FixtureService);
    presetService = TestBed.inject(PresetService);
  });

  it('caches the fixtures of the project before it announces the selected step', () => {
    const found: boolean[] = [];

    presetService.stepsChanged.subscribe(() => {
      for (const presetFixture of presetService.selectedPreset?.fixtures || []) {
        found.push(!!fixtureService.getCachedFixtureByUuid(presetFixture.fixtureUuid, presetFixture.pixelKey));
      }
    });

    service.import(JSON.stringify(projectWithSelectedPreset()));

    expect(found.length).toBeGreaterThan(0);
    expect(found.every((isFound) => isFound)).toBe(true);
  });
});

// Until version 8, the curves except the square swung over half of their amplitude: the
// migration halves it, so a show looks the same as before
describe('ProjectLoadService migrating the curves of a project to version 8', () => {
  let service: ProjectLoadService;
  let projectService: ProjectService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        BsModalService,
        { provide: WarningDialogService, useValue: { show: () => of(true) } },
      ],
    });

    service = TestBed.inject(ProjectLoadService);
    projectService = TestBed.inject(ProjectService);
  });

  it('halves the amplitude of every curve but the square', () => {
    const project = projectWithSelectedPreset();
    project.version = 7;
    project.presets[0].effects = [curveEffect('sine', 1), curveEffect('triangle', 0.8), curveEffect('square', 1)];

    service.import(JSON.stringify(project));

    const effects = projectService.project.presets[0].effects as EffectCurve[];
    expect(projectService.project.version).toBe(8);
    expect(effects.map((effect) => effect.amplitude)).toEqual([0.5, 0.4, 1]);
  });

  it('keeps the amplitude of a project of version 8', () => {
    const project = projectWithSelectedPreset();
    project.presets[0].effects = [curveEffect('sine', 1)];

    service.import(JSON.stringify(project));

    expect((projectService.project.presets[0].effects[0] as EffectCurve).amplitude).toBe(1);
  });
});

function curveEffect(curveType: string, amplitude: number): any {
  return {
    type: 'curve',
    uuid: curveType,
    curveType,
    amplitude,
    position: 0.5,
    lengthMillis: 1000,
    phaseMillis: 0,
    phasingMillis: 0,
    capabilities: [],
    channels: [],
  };
}

// a project with one dimmer, which its selected preset turns on
function projectWithSelectedPreset(): any {
  return {
    version: 8,
    name: 'Imported',
    fixtureProfiles: [
      {
        uuid: 'test/dimmer',
        name: 'Dimmer',
        manufacturerShortName: 'test',
        manufacturerName: 'Test',
        categories: ['Dimmer'],
        availableChannels: { Dimmer: { capability: { type: 'Intensity' } } },
        modes: [{ name: '1-channel', shortName: '1ch', channels: ['Dimmer'] }],
      },
    ],
    fixtures: [
      {
        uuid: 'fixture-1',
        profileUuid: 'test/dimmer',
        name: 'Dimmer 1',
        dmxUniverseUuid: 'universe-1',
        dmxFirstChannel: 0,
        modeShortName: '1ch',
        positioning: 'topFront',
      },
    ],
    presetFixtures: [{ fixtureUuid: 'fixture-1', sortIndex: 0 }],
    universes: [{ uuid: 'universe-1', name: 'Universe 1' }],
    presets: [
      {
        uuid: 'preset-1',
        name: 'Full',
        fixtures: [{ fixtureUuid: 'fixture-1' }],
        steps: [{ uuid: 'step-1', startMillis: 0, fixtureCapabilityValues: [{ type: 'Intensity', valuePercentage: 1 }] }],
      },
    ],
    scenes: [],
    compositions: [],
    selectedPresetUuid: 'preset-1',
    selectedStepUuid: 'step-1',
  };
}
