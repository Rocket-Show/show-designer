import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { inject, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';

import { FixtureService } from './fixture.service';
import { PresetService } from './preset.service';
import { ProjectLoadService } from './project-load.service';

describe('ProjectLoadService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ProjectLoadService],
    });
  });

  it('should be created', inject([ProjectLoadService], (service: ProjectLoadService) => {
    expect(service).toBeTruthy();
  }));
});

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

// a project with one dimmer, which its selected preset turns on
function projectWithSelectedPreset(): any {
  return {
    version: 7,
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
