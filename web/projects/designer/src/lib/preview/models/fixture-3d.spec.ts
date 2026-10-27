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

// a fixture shown with a beam, the way the preview shows a par or a moving head
class Beam3d extends Fixture3d {
  constructor(fixtureService: FixtureService, previewService: PreviewService, fixture: CachedFixture) {
    super(fixtureService, previewService, fixture, new THREE.Scene(), new THREE.Group(), true, false);
    this.createObjects();
  }

  get beamColor(): THREE.Color {
    return this.spotlightMaterial.uniforms.lightColor.value;
  }

  get beamOpacity(): number {
    return this.spotlightMaterial.uniforms.opacity.value;
  }
}

// an RGB fixture in a mode with the passed channels
function rgbFixture(channels: string[]): CachedFixture {
  const fixtureService = TestBed.inject(FixtureService);

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
          'Color Macros': {
            capabilities: [
              { dmxRange: [0, 0], type: 'NoFunction' },
              { dmxRange: [1, 127], type: 'ColorPreset', comment: 'Amber', colors: ['#ff8000'] },
              { dmxRange: [128, 255], type: 'ColorPreset', comment: 'Red/Blue', colors: ['#ff0000', '#0000ff'] },
            ],
          },
        },
        modes: [{ name: 'mode', shortName: 'mode', channels }],
      },
    ],
    fixtures: [{ uuid: 'fixture-1', profileUuid: 'test/rgb', modeShortName: 'mode', dmxFirstChannel: 0, positioning: 'topFront' }],
  });
  fixtureService.updateCachedFixtures();

  return fixtureService.cachedFixtures[0];
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

function configureTestingModule() {
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
}

// The bulb shows the light of the fixture: the brighter it is set, the brighter it glows,
// and a fixture which is set dark doesn't glow at all.
describe('Fixture3d bulb', () => {
  beforeEach(() => {
    configureTestingModule();
  });

  function bulb(channels: string[]): Bulb3d {
    return new Bulb3d(TestBed.inject(FixtureService), TestBed.inject(PreviewService), rgbFixture(channels));
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

// The beam shows how bright the light is by how faint it is, always in the full color of
// the light: a light which is set darker (e.g. faded by the scene dimmer) is a fainter beam,
// not a dark one covering the stage.
describe('Fixture3d beam', () => {
  beforeEach(() => {
    configureTestingModule();
  });

  function beam(channels: string[]): Beam3d {
    return new Beam3d(TestBed.inject(FixtureService), TestBed.inject(PreviewService), rgbFixture(channels));
  }

  it('shows a darker color as a fainter beam of the same color', () => {
    const fixture3d = beam(['Red', 'Green', 'Blue']);

    // red at a fifth, the way a scene dimmer at 20 % hands it to a fixture without a dimmer
    fixture3d.updatePreview(values({ Red: 51, Green: 0, Blue: 0 }), 1);

    expect(fixture3d.beamOpacity).toBeCloseTo(0.2, 5);
    expect(fixture3d.beamColor.r).toBeCloseTo(1, 5);
    expect(fixture3d.beamColor.g).toBeCloseTo(0, 5);
    expect(fixture3d.beamColor.b).toBeCloseTo(0, 5);
  });

  it('keeps the hue of a mixed color', () => {
    const fixture3d = beam(['Red', 'Green', 'Blue']);
    const fullColor = new THREE.Color('rgb(255, 128, 0)');

    fixture3d.updatePreview(values({ Red: 127.5, Green: 64, Blue: 0 }), 1);

    expect(fixture3d.beamOpacity).toBeCloseTo(0.5, 2);
    expect(fixture3d.beamColor.r).toBeCloseTo(fullColor.r, 2);
    expect(fixture3d.beamColor.g).toBeCloseTo(fullColor.g, 2);
    expect(fixture3d.beamColor.b).toBeCloseTo(fullColor.b, 2);
  });

  it('gets as faint as the dimmer and the color together let the light through', () => {
    const fixture3d = beam(['Dimmer', 'Red', 'Green', 'Blue']);

    fixture3d.updatePreview(values({ Dimmer: 127.5, Red: 127.5, Green: 0, Blue: 0 }), 1);

    expect(fixture3d.beamOpacity).toBeCloseTo(0.25, 2);
    expect(fixture3d.beamColor.r).toBeCloseTo(1, 5);
  });

  it('shows no beam while the light is off', () => {
    const fixture3d = beam(['Red', 'Green', 'Blue']);

    fixture3d.updatePreview(values({ Red: 0, Green: 0, Blue: 0 }), 1);

    expect(fixture3d.beamOpacity).toBe(0);
  });
});

// A color macro shows its own color: the fixture disables its color channels while one is
// selected (e.g. the ADJ Dotz Par), while its dimmer still dims it.
describe('Fixture3d color macro', () => {
  beforeEach(() => {
    configureTestingModule();
  });

  function beam(channels: string[]): Beam3d {
    return new Beam3d(TestBed.inject(FixtureService), TestBed.inject(PreviewService), rgbFixture(channels));
  }

  function expectBeamColor(fixture3d: Beam3d, red: number, green: number, blue: number) {
    const expected = new THREE.Color('rgb(' + red + ', ' + green + ', ' + blue + ')');

    expect(fixture3d.beamColor.r).toBeCloseTo(expected.r, 2);
    expect(fixture3d.beamColor.g).toBeCloseTo(expected.g, 2);
    expect(fixture3d.beamColor.b).toBeCloseTo(expected.b, 2);
  }

  it('shows the color of the selected macro instead of the color channels', () => {
    const fixture3d = beam(['Red', 'Green', 'Blue', 'Color Macros']);

    // the macro comes first, the color channels can't take over after it
    fixture3d.updatePreview(values({ 'Color Macros': 50, Red: 0, Green: 255, Blue: 0 }), 1);

    expectBeamColor(fixture3d, 255, 128, 0);
    expect(fixture3d.beamOpacity).toBeCloseTo(1, 5);
  });

  it('mixes the colors of a macro showing more than one', () => {
    const fixture3d = beam(['Red', 'Green', 'Blue', 'Color Macros']);

    fixture3d.updatePreview(values({ Red: 0, Green: 255, Blue: 0, 'Color Macros': 200 }), 1);

    expectBeamColor(fixture3d, 255, 0, 255);
  });

  it('leaves the color to the color channels while no macro is selected', () => {
    const fixture3d = beam(['Red', 'Green', 'Blue', 'Color Macros']);

    fixture3d.updatePreview(values({ Red: 255, Green: 0, Blue: 0, 'Color Macros': 0 }), 1);

    expectBeamColor(fixture3d, 255, 0, 0);
    expect(fixture3d.beamOpacity).toBeCloseTo(1, 5);
  });

  it('dims a macro with the dimmer', () => {
    const fixture3d = beam(['Red', 'Green', 'Blue', 'Dimmer', 'Color Macros']);

    fixture3d.updatePreview(values({ Dimmer: 127.5, 'Color Macros': 50 }), 1);

    expectBeamColor(fixture3d, 255, 128, 0);
    expect(fixture3d.beamOpacity).toBeCloseTo(0.5, 5);
  });
});
