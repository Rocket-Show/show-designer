import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { CachedFixture } from '../../models/cached-fixture';
import { FixtureChannelValue } from '../../models/fixture-channel-value';
import { Project } from '../../models/project';
import { FixtureService } from '../../services/fixture.service';
import { ProjectService } from '../../services/project.service';
import { GoboPatternChoice } from '../../models/gobo-pattern-choice';
import {
  drawGoboPattern,
  getCatalogGoboPattern,
  getGoboPattern,
  getGoboState,
  getGoboTexture,
  getRotationTurnsPerSecond,
  getShownGoboPattern,
  goboCatalog,
  GoboState,
} from './gobo';

// The preview draws a gobo of its own for each gobo of a wheel, the fixture library having no pictures of them.
describe('gobo', () => {
  it('picks the pattern from the name of the gobo where it tells', () => {
    expect(getGoboPattern('Stars', 3).family).toBe('star');
    expect(getGoboPattern('Red sun', 2).family).toBe('rays');
    expect(getGoboPattern('Blue splash', 3).family).toBe('breakup');
    expect(getGoboPattern('Hypnotic', 7).family).toBe('spiral');
    expect(getGoboPattern('Dots', 4).family).toBe('dots');
    expect(getGoboPattern('Lines', 4).family).toBe('bars');
    expect(getGoboPattern('Flower', 4).family).toBe('flower');
    // a chessboard in a circle, not rings
    expect(getGoboPattern('Circular chess', 4).family).toBe('checker');
    expect(getGoboPattern('Triangle', 5)).toEqual(jasmine.objectContaining({ family: 'polygon', count: 3 }));
  });

  it('draws the same gobo the same way every time, wherever it is on its wheel', () => {
    expect(getGoboPattern('Stars', 3)).toEqual(getGoboPattern('Stars', 3));
    expect(getGoboPattern('Stars', 3)).toEqual(getGoboPattern('stars', 6));
    expect(getGoboPattern('Stars', 3).seed).not.toBe(getGoboPattern('Star burst', 3).seed);
  });

  it('draws the gobos without a name after their place on the wheel', () => {
    const patterns = [1, 2, 3, 4, 5, 6, 7, 8].map((slotNumber) => getGoboPattern(undefined, slotNumber));

    expect(patterns[2]).toEqual(getGoboPattern('', 3));
    expect(new Set(patterns.map((pattern) => pattern.seed)).size).toBe(8);
    expect(new Set(patterns.map((pattern) => pattern.family)).size).toBeGreaterThan(2);
  });

  it('lets the light through its pattern only, within its circle', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');

    const families = ['dots', 'star', 'rays', 'bars', 'grid', 'rings', 'spiral', 'flower', 'breakup', 'polygon', 'checker'];
    const drawn: { [family: string]: string } = {};

    for (const family of families) {
      const count = family === 'breakup' ? 30 : family === 'polygon' ? 6 : 3;
      drawGoboPattern(context, { family: family as any, count, seed: 42 }, 64);
      const pixels = context.getImageData(0, 0, 64, 64).data;
      let lit = 0;

      for (let i = 0; i < pixels.length; i += 4) {
        lit += pixels[i] > 128 ? 1 : 0;
      }

      // dark in the corners, outside of the circle, and some of it lit, some of it dark
      const darkCorners = pixels[0] === 0 && pixels[(64 * 64 - 1) * 4] === 0;
      const partlyLit = lit > 64 * 64 * 0.05 && lit < 64 * 64 * 0.7;
      drawn[family] = darkCorners && partlyLit ? 'ok' : 'corners ' + darkCorners + ', lit ' + lit;
    }

    const allOk: { [family: string]: string } = {};
    families.forEach((family) => (allOk[family] = 'ok'));

    expect(drawn).toEqual(allOk);
  });

  it('draws the picture of a gobo once for all fixtures showing it', () => {
    const pattern = getGoboPattern('Stars', 3);

    expect(getGoboTexture(pattern)).toBe(getGoboTexture({ ...pattern }));
    expect(getGoboTexture(pattern)).not.toBe(getGoboTexture(getGoboPattern('Dots', 3)));
  });

  it('reads the speeds of a rotation in turns per second', () => {
    expect(getRotationTurnsPerSecond('fast CW')).toBe(1);
    expect(getRotationTurnsPerSecond('slow CCW')).toBe(-0.1);
    expect(getRotationTurnsPerSecond('stop')).toBe(0);
    expect(getRotationTurnsPerSecond('30rpm')).toBe(0.5);
    expect(getRotationTurnsPerSecond('-2Hz')).toBe(-2);
    // without a direction, the way a speed of anything else is read
    expect(getRotationTurnsPerSecond('fast')).toBe(1);
    expect(getRotationTurnsPerSecond('sideways')).toBeUndefined();
  });

  describe('of a fixture', () => {
    let fixtureService: FixtureService;

    beforeEach(() => {
      TestBed.configureTestingModule({
        imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
        providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
      });
      fixtureService = TestBed.inject(FixtureService);

      TestBed.inject(ProjectService).project = new Project({
        fixtureProfiles: [
          {
            uuid: 'test/spot',
            name: 'Spot',
            availableChannels: {
              'Gobo Wheel': {
                capabilities: [
                  { dmxRange: [0, 9], type: 'WheelSlot', slotNumber: 1 },
                  { dmxRange: [10, 19], type: 'WheelSlot', slotNumber: 2 },
                  { dmxRange: [20, 29], type: 'WheelSlot', slotNumber: 3 },
                  { dmxRange: [30, 39], type: 'WheelSlot', slotNumber: 1.5 },
                  { dmxRange: [40, 127], type: 'WheelShake', slotNumber: 2, shakeSpeedStart: 'slow', shakeSpeedEnd: 'fast' },
                  { dmxRange: [128, 255], type: 'WheelRotation', speedStart: 'slow CW', speedEnd: 'fast CW' },
                ],
              },
              'Gobo Rotation': {
                capabilities: [
                  { dmxRange: [0, 63], type: 'WheelSlotRotation', angleStart: '0deg', angleEnd: '360deg' },
                  { dmxRange: [64, 127], type: 'WheelSlotRotation', speedStart: 'slow CW', speedEnd: 'fast CW' },
                  { dmxRange: [128, 255], type: 'WheelSlotRotation', speedStart: '10rpm', speedEnd: '60rpm' },
                ],
              },
            },
            wheels: {
              'Gobo Wheel': { slots: [{ type: 'Open' }, { type: 'Gobo', name: 'Stars' }, { type: 'Gobo', name: 'Dots' }] },
            },
            modes: [{ name: 'mode', shortName: 'mode', channels: ['Gobo Wheel', 'Gobo Rotation'] }],
          },
        ],
        fixtures: [{ uuid: 'spot', profileUuid: 'test/spot', modeShortName: 'mode', dmxFirstChannel: 0, positioning: 'topFront' }],
      });
      fixtureService.updateCachedFixtures();
    });

    function state(values: { [channelName: string]: number }, timeMillis = 0): GoboState {
      const fixture: CachedFixture = fixtureService.cachedFixtures[0];
      const channelValues = Object.keys(values).map((channelName) => {
        const channelValue = new FixtureChannelValue();
        channelValue.channelName = channelName;
        channelValue.value = values[channelName];
        return channelValue;
      });

      return getGoboState(
        fixture,
        channelValues,
        (channelName) => fixtureService.getChannelByName(fixture, channelName),
        (channel, value) => fixtureService.getCapabilityInValue(channel, value),
        timeMillis
      );
    }

    it('shows the gobo its wheel sits on, and none while the wheel is open', () => {
      expect(state({ 'Gobo Wheel': 0 })).toBeUndefined();
      expect(state({ 'Gobo Wheel': 15 }).pattern).toEqual(getGoboPattern('Stars', 2));
      expect(state({ 'Gobo Wheel': 25 }).pattern).toEqual(getGoboPattern('Dots', 3));
      // half way between the open slot and a gobo
      expect(state({ 'Gobo Wheel': 35 }).pattern).toEqual(getGoboPattern('Stars', 2));
      // the whole wheel turning shows none in particular
      expect(state({ 'Gobo Wheel': 200 })).toBeUndefined();
    });

    it('turns the gobo in its slot', () => {
      // indexed
      expect(state({ 'Gobo Wheel': 15, 'Gobo Rotation': 63 }).angle).toBeCloseTo(Math.PI * 2, 10);
      expect(state({ 'Gobo Wheel': 15, 'Gobo Rotation': 0 }, 5000).angle).toBe(0);
      // turning: fast clockwise is a turn a second, 60 rpm as well
      expect(state({ 'Gobo Wheel': 15, 'Gobo Rotation': 127 }, 250).angle).toBeCloseTo(Math.PI / 2, 10);
      expect(state({ 'Gobo Wheel': 15, 'Gobo Rotation': 255 }, 500).angle).toBeCloseTo(Math.PI, 10);
    });

    it('shakes the gobo it shakes', () => {
      const shaken = [0, 50, 100, 150].map((timeMillis) => state({ 'Gobo Wheel': 127 }, timeMillis));

      expect(shaken[0].pattern).toEqual(getGoboPattern('Stars', 2));
      expect(new Set(shaken.map((shake) => shake.angle.toFixed(3))).size).toBeGreaterThan(1);
      expect(Math.max(...shaken.map((shake) => Math.abs(shake.angle)))).toBeLessThan(0.4);
    });
  });
  describe('the patterns to match a gobo with', () => {
    it('offers a few of each kind, each with an id of its own', () => {
      const ids = goboCatalog.map((entry) => entry.id);

      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(goboCatalog.map((entry) => entry.pattern.family)).size).toBe(11);
      expect(getCatalogGoboPattern('star-6')).toEqual(jasmine.objectContaining({ family: 'star', count: 6 }));
      expect(getCatalogGoboPattern('unknown')).toBeUndefined();
    });

    it('shows a gobo with the pattern picked for it on its model, or else with the one its name brings', () => {
      const choices = [new GoboPatternChoice({ profileUuid: 'spot', wheel: 'Gobo Wheel', slotNumber: 2, pattern: 'rings-3' })];

      expect(getShownGoboPattern(choices, 'spot', 'Gobo Wheel', 2, 'Stars')).toEqual(getCatalogGoboPattern('rings-3'));
      // another slot, wheel or model shows what its name brings
      expect(getShownGoboPattern(choices, 'spot', 'Gobo Wheel', 3, 'Stars')).toEqual(getGoboPattern('Stars', 3));
      expect(getShownGoboPattern(choices, 'spot', 'Gobo Wheel 2', 2, 'Stars')).toEqual(getGoboPattern('Stars', 2));
      expect(getShownGoboPattern(choices, 'wash', 'Gobo Wheel', 2, 'Stars')).toEqual(getGoboPattern('Stars', 2));
      // a pattern of a newer designer this one doesn't know
      choices[0].pattern = 'unknown';
      expect(getShownGoboPattern(choices, 'spot', 'Gobo Wheel', 2, 'Stars')).toEqual(getGoboPattern('Stars', 2));
      expect(getShownGoboPattern(undefined, 'spot', 'Gobo Wheel', 2, 'Stars')).toEqual(getGoboPattern('Stars', 2));
    });
  });
});
