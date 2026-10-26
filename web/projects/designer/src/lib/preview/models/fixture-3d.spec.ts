import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';
import * as THREE from 'three';

import { CachedFixture } from '../../models/cached-fixture';
import { FixtureChannelValue } from '../../models/fixture-channel-value';
import { Project } from '../../models/project';
import { FixtureService } from '../../services/fixture.service';
import { PreviewService } from '../../services/preview.service';
import { ProjectService } from '../../services/project.service';
import { Fixture3d } from './fixture-3d';

// a fixture shown as a glowing bulb only, the way the preview shows the pixels of a bar
class Bulb3d extends Fixture3d {
  constructor(fixtureService: FixtureService, previewService: PreviewService, fixture: CachedFixture) {
    super(fixtureService, previewService, fixture, new THREE.Scene(), new THREE.Group(), false, true);
    this.createObjects();
  }

  get glow(): THREE.Color {
    return (this as any).bulbMaterial.emissive;
  }
}

// The bulb shows the light of the fixture: the brighter it is set, the brighter it glows,
// and a fixture which is set dark doesn't glow at all.
describe('Fixture3d bulb', () => {
  let fixtureService: FixtureService;
  let previewService: PreviewService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    fixtureService = TestBed.inject(FixtureService);
    previewService = TestBed.inject(PreviewService);
  });

  function bulb(channels: string[]): Bulb3d {
    TestBed.inject(ProjectService).project = new Project({
      fixtureProfiles: [
        {
          uuid: 'test/rgb',
          name: 'RGB',
          categories: ['Color Changer'],
          availableChannels: {
            Dimmer: { capability: { type: 'Intensity' } },
            Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
            Green: { capability: { type: 'ColorIntensity', color: 'Green' } },
            Blue: { capability: { type: 'ColorIntensity', color: 'Blue' } },
          },
          modes: [{ name: 'mode', shortName: 'mode', channels }],
        },
      ],
      fixtures: [{ uuid: 'fixture-1', profileUuid: 'test/rgb', modeShortName: 'mode', dmxFirstChannel: 0, positioning: 'topFront' }],
    });
    fixtureService.updateCachedFixtures();

    return new Bulb3d(fixtureService, previewService, fixtureService.cachedFixtures[0]);
  }

  function values(values: { [channelName: string]: number }): FixtureChannelValue[] {
    return Object.keys(values).map((channelName) => {
      const value = new FixtureChannelValue();
      value.channelName = channelName;
      value.profileUuid = 'test/rgb';
      value.value = values[channelName];
      return value;
    });
  }

  it('glows in the full color of a fully lit pixel', () => {
    const fixture3d = bulb(['Red', 'Green', 'Blue']);

    fixture3d.updatePreview(values({ Red: 255, Green: 0, Blue: 0 }), 1);

    expect(fixture3d.glow.r).toBeCloseTo(1, 5);
    expect(fixture3d.glow.g).toBeCloseTo(0, 5);
    expect(fixture3d.glow.b).toBeCloseTo(0, 5);
  });

  it('stays dark while the pixel is off', () => {
    const fixture3d = bulb(['Red', 'Green', 'Blue']);

    fixture3d.updatePreview(values({ Red: 0, Green: 0, Blue: 0 }), 1);

    expect(fixture3d.glow.getHex()).toBe(0x000000);
  });

  it('follows the dimmer of a fixture which has one', () => {
    const fixture3d = bulb(['Dimmer', 'Red', 'Green', 'Blue']);

    fixture3d.updatePreview(values({ Dimmer: 127.5, Red: 255, Green: 255, Blue: 255 }), 1);

    expect(fixture3d.glow.r).toBeCloseTo(0.5, 5);
    expect(fixture3d.glow.g).toBeCloseTo(0.5, 5);
    expect(fixture3d.glow.b).toBeCloseTo(0.5, 5);
  });
});
