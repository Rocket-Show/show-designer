import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { CachedFixture } from '../../models/cached-fixture';
import { FixtureChannelValue } from '../../models/fixture-channel-value';
import { FixturePhysical } from '../../models/fixture-physical';
import { Project } from '../../models/project';
import { FixtureService } from '../../services/fixture.service';
import { ProjectService } from '../../services/project.service';
import { getBeamAngleDeg, getLensDegrees, readZoomAngle } from './beam-angle';

// The beam of the preview opens as wide as the lens and the zoom of the fixture open it.
describe('beam-angle', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  // a fixture of a profile with the passed lens (if any) and channels
  function fixture(lens: number[], availableChannels: any = {}): CachedFixture {
    const fixtureService = TestBed.inject(FixtureService);

    TestBed.inject(ProjectService).project = new Project({
      fixtureProfiles: [
        {
          uuid: 'test/spot',
          name: 'Spot',
          physical: lens ? { dimensions: [300, 400, 250], lens: { degreesMinMax: lens } } : { dimensions: [300, 400, 250] },
          availableChannels: { Dimmer: { capability: { type: 'Intensity' } }, ...availableChannels },
          modes: [{ name: 'mode', shortName: 'mode', channels: ['Dimmer', ...Object.keys(availableChannels)] }],
        },
      ],
      fixtures: [{ uuid: 'spot', profileUuid: 'test/spot', modeShortName: 'mode', dmxFirstChannel: 0, positioning: 'topFront' }],
    });
    fixtureService.updateCachedFixtures();

    return fixtureService.cachedFixtures[0];
  }

  function value(channelName: string, channelValue: number): FixtureChannelValue {
    const result = new FixtureChannelValue();
    result.channelName = channelName;
    result.value = channelValue;
    return result;
  }

  it('reads the lens of the profile, and keeps it when the profile is saved', () => {
    const physical = new FixturePhysical({ dimensions: [1, 2, 3], lens: { degreesMinMax: [30, 10] } });

    expect(JSON.parse(JSON.stringify(physical))).toEqual({ dimensions: [1, 2, 3], lens: { degreesMinMax: [30, 10] } });
    expect(getLensDegrees(fixture([30, 10]))).toEqual([10, 30]);
    expect(getLensDegrees(fixture(undefined))).toBeUndefined();
    expect(getLensDegrees(fixture([0, 0]))).toBeUndefined();
  });

  it('opens as wide as the lens of a fixture without a zoom', () => {
    expect(getBeamAngleDeg(fixture([14, 14]), [])).toBe(14);
    // a lens with a zoom nothing drives: in the middle of it
    expect(getBeamAngleDeg(fixture([10, 30]), [])).toBe(20);
  });

  it("doesn't say for a profile naming neither a lens nor a zoom", () => {
    expect(getBeamAngleDeg(fixture(undefined), [value('Dimmer', 255)])).toBeUndefined();
  });

  it('follows the angles the zoom names', () => {
    const spot = fixture([14, 14], { Zoom: { capability: { type: 'Zoom', angleStart: '4deg', angleEnd: '45deg' } } });

    expect(getBeamAngleDeg(spot, [value('Zoom', 0)])).toBe(4);
    expect(getBeamAngleDeg(spot, [value('Zoom', 255)])).toBe(45);
    expect(getBeamAngleDeg(spot, [value('Zoom', 127.5)])).toBeCloseTo(24.5, 10);
  });

  it('follows a zoom from wide to narrow over the lens, within the range of the zoom', () => {
    const spot = fixture([10, 40], {
      Zoom: {
        capabilities: [
          { dmxRange: [0, 9], type: 'NoFunction' },
          { dmxRange: [10, 255], type: 'Zoom', angleStart: 'wide', angleEnd: 'narrow' },
        ],
      },
    });

    expect(getBeamAngleDeg(spot, [value('Zoom', 10)])).toBe(40);
    expect(getBeamAngleDeg(spot, [value('Zoom', 255)])).toBe(10);
    // outside of the zoom: as wide as the lens opens in the middle
    expect(getBeamAngleDeg(spot, [value('Zoom', 5)])).toBe(25);
  });

  it('runs a zoom naming no angles over the lens, and says nothing without a lens either', () => {
    const spot = fixture([10, 40], { Zoom: { capability: { type: 'Zoom' } } });
    expect(getBeamAngleDeg(spot, [value('Zoom', 0)])).toBe(10);
    expect(getBeamAngleDeg(spot, [value('Zoom', 255)])).toBe(40);

    const noLens = fixture(undefined, { Zoom: { capability: { type: 'Zoom' } } });
    expect(getBeamAngleDeg(noLens, [value('Zoom', 255)])).toBeUndefined();
    expect(getBeamAngleDeg(undefined, [])).toBeUndefined();
  });

  it('takes the beam angle of a channel of its own', () => {
    const spot = fixture(undefined, { 'Beam Angle': { capability: { type: 'BeamAngle', angleStart: '6deg', angleEnd: '30deg' } } });

    expect(getBeamAngleDeg(spot, [value('Beam Angle', 255)])).toBe(30);
  });

  it('takes the default of a zoom no value is set on', () => {
    const spot = fixture(undefined, { Zoom: { defaultValue: 255, capability: { type: 'Zoom', angleStart: '8deg', angleEnd: '24deg' } } });

    expect(getBeamAngleDeg(spot, [])).toBe(24);
  });

  it('opens no narrower and no wider than the preview draws a beam', () => {
    const spot = fixture(undefined, { Zoom: { capability: { type: 'Zoom', angleStart: 'closed', angleEnd: '170deg' } } });

    expect(getBeamAngleDeg(spot, [value('Zoom', 0)])).toBe(1);
    expect(getBeamAngleDeg(spot, [value('Zoom', 255)])).toBe(120);
  });

  it('reads the angles of a zoom like the fixture library writes them', () => {
    expect(readZoomAngle('12.5deg', undefined)).toBe(12.5);
    expect(readZoomAngle('narrow', [8, 30])).toBe(8);
    expect(readZoomAngle('wide', [8, 30])).toBe(30);
    // an end of a lens which isn't known, or something else than an angle
    expect(readZoomAngle('narrow', undefined)).toBeUndefined();
    expect(readZoomAngle('50%', undefined)).toBeUndefined();
    expect(readZoomAngle(undefined, [8, 30])).toBeUndefined();
    expect(readZoomAngle('wide', undefined)).toBeUndefined();
    expect(readZoomAngle('closed', undefined)).toBe(0);
    expect(readZoomAngle('manydeg', [8, 30])).toBeUndefined();
  });
});
