import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { EffectCurve } from '../models/effect-curve';
import { FixtureProfile } from '../models/fixture-profile';
import { Preset } from '../models/preset';
import { Project } from '../models/project';
import { FixtureExchangeService } from './fixture-exchange.service';
import { ProjectService } from './project.service';

const range = (lo: number, hi: number, type: string, extra: any = {}) => ({ dmxRange: [lo, hi], type, ...extra });

// the par a show was written for: a strobe with "no function" below it, color macros, a zoom from wide to narrow and
// a program of its own
const parA = {
  uuid: 'par-a',
  name: 'Par A',
  availableChannels: {
    Dimmer: { capability: { type: 'Intensity' } },
    Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
    Strobe: {
      capabilities: [
        range(0, 9, 'NoFunction'),
        range(10, 255, 'ShutterStrobe', { shutterEffect: 'Strobe', speedStart: 'slow', speedEnd: 'fast' }),
      ],
    },
    Macro: {
      capabilities: [
        range(0, 9, 'NoFunction'),
        range(10, 127, 'ColorPreset', { colors: ['#ff0000'] }),
        range(128, 255, 'ColorPreset', { colors: ['#0000ff'] }),
      ],
    },
    Zoom: { capability: { type: 'Zoom', angleStart: 'wide', angleEnd: 'narrow' } },
    Program: { capability: { type: 'Effect' } },
  },
  modes: [{ name: '6-channel', shortName: '6ch', channels: ['Dimmer', 'Red', 'Strobe', 'Macro', 'Zoom', 'Program'] }],
};

// the par of the venue: its strobe on a channel named differently, running from fast to slow, its macros the other way
// round and its zoom from narrow to wide
const parB = {
  uuid: 'par-b',
  name: 'Par B',
  availableChannels: {
    Dimmer: { capability: { type: 'Intensity' } },
    Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
    White: { capability: { type: 'ColorIntensity', color: 'White' } },
    Shutter: {
      capabilities: [
        range(0, 31, 'ShutterStrobe', { shutterEffect: 'Open' }),
        range(32, 255, 'ShutterStrobe', { shutterEffect: 'Strobe', speedStart: 'fast', speedEnd: 'slow' }),
      ],
    },
    Macros: {
      capabilities: [range(0, 50, 'ColorPreset', { colors: ['#0000ff'] }), range(51, 100, 'ColorPreset', { colors: ['#ff0000'] })],
    },
    Zoom: { capability: { type: 'Zoom', angleStart: '10deg', angleEnd: '40deg' } },
  },
  modes: [
    { name: '6-channel', shortName: '6ch', channels: ['Dimmer', 'Red', 'White', 'Shutter', 'Macros', 'Zoom'] },
    { name: '1-channel', shortName: '1ch', channels: ['Dimmer'] },
  ],
};

const wheelSlots = (count: number) => ({
  capabilities: Array.from({ length: count }, (_, index) => range(index * 10, index * 10 + 9, 'WheelSlot', { slotNumber: index + 1 })),
});

// two spots with a color wheel and a gobo wheel each, their slots in another order
const spotA = {
  uuid: 'spot-a',
  name: 'Spot A',
  availableChannels: { 'Color Wheel': wheelSlots(3), 'Gobo Wheel': wheelSlots(3) },
  wheels: {
    'Color Wheel': { slots: [{ type: 'Open' }, { type: 'Color', colors: ['#ff0000'] }, { type: 'Color', colors: ['#0000ff'] }] },
    'Gobo Wheel': { slots: [{ type: 'Open' }, { type: 'Gobo', name: 'Star' }, { type: 'Gobo', name: 'Ring' }] },
  },
  modes: [{ name: '2-channel', shortName: '2ch', channels: ['Color Wheel', 'Gobo Wheel'] }],
};

const spotB = {
  uuid: 'spot-b',
  name: 'Spot B',
  availableChannels: {
    Color: { capabilities: wheelSlots(4).capabilities.map((capability) => ({ ...capability, wheel: 'Colors' })) },
    Gobo: wheelSlots(2),
  },
  wheels: {
    Colors: {
      slots: [
        { type: 'Color', colors: ['#00ff00'] },
        { type: 'Open' },
        { type: 'Color', colors: ['#0000ff'] },
        { type: 'Color', colors: ['#ee1111'] },
      ],
    },
    Gobo: { slots: [{ type: 'Open' }, { type: 'Gobo', name: 'ring' }] },
  },
  modes: [{ name: '2-channel', shortName: '2ch', channels: ['Color', 'Gobo'] }],
};

// a bar of three pixels and one of four
const bar = (uuid: string, pixels: number) => ({
  uuid,
  name: uuid,
  matrix: { pixelCount: [pixels, 1, 1] },
  availableChannels: {},
  templateChannels: { 'Red $pixelKey': { capability: { type: 'ColorIntensity', color: 'Red' } } },
  modes: [
    {
      name: 'pixels',
      shortName: 'pixels',
      channels: [{ insert: 'matrixChannels', repeatFor: 'eachPixelXYZ', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey'] }],
    },
  ],
});

describe('FixtureExchangeService', () => {
  let service: FixtureExchangeService;
  let project: Project;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    project = new Project({ fixtureProfiles: [parA, parB, spotA, spotB, bar('bar-3', 3), bar('bar-3b', 3), bar('bar-4', 4)] });
    TestBed.inject(ProjectService).project = project;
    service = TestBed.inject(FixtureExchangeService);
  });

  function profile(uuid: string): FixtureProfile {
    return project.fixtureProfiles.find((candidate) => candidate.uuid === uuid);
  }

  function preset(values: any, effects: any[] = []): Preset {
    return new Preset({ uuid: 'look', name: 'Look', steps: [{ uuid: 'step', ...values }], effects });
  }

  function exchange(presets: Preset[], from: string, to: string, apply: boolean, toMode = 0) {
    return service.exchange(presets, profile(from), profile(from).modes[0], profile(to), profile(to).modes[toMode], apply);
  }

  function channelValues(look: Preset, profileUuid: string): { [channelName: string]: number } {
    const values = {};

    for (const value of look.steps[0].fixtureChannelValues.filter((channelValue) => channelValue.profileUuid === profileUuid)) {
      values[value.channelName] = value.value;
    }

    return values;
  }

  it('carries the value of a channel to the channel of the new model doing the same, at the same place within it', () => {
    // a strobe half way from slow to fast, the zoom a quarter of the way from wide to narrow, a red macro
    const look = preset({
      fixtureChannelValues: [
        { profileUuid: 'par-a', channelName: 'Strobe', value: 132.5 },
        { profileUuid: 'par-a', channelName: 'Zoom', value: 63.75 },
        { profileUuid: 'par-a', channelName: 'Macro', value: 20 },
        { profileUuid: 'par-a', channelName: 'Dimmer', value: 128 },
      ],
    });

    const report = exchange([look], 'par-a', 'par-b', true);

    expect(channelValues(look, 'par-b')).toEqual({ Shutter: 144, Zoom: 191, Macros: 76, Dimmer: 128 });
    expect(report.carried.map((item) => item.from + ' > ' + item.to)).toEqual([
      'Strobe > Shutter',
      'Zoom > Zoom',
      'Macro > Macros',
      'Dimmer > Dimmer',
    ]);
    expect(report.lost).toEqual([]);
    expect(report.carried[0].presetName).toBe('Look');
  });

  it('carries a zoom to a channel of the beam angle and a haze to the fog output', () => {
    project.fixtureProfiles.push(
      new FixtureProfile({
        uuid: 'old-spot',
        name: 'Old spot',
        availableChannels: {
          Zoom: { capability: { type: 'Zoom', angleStart: 'narrow', angleEnd: 'wide' } },
          Haze: { capability: { type: 'Fog', fogType: 'Haze', fogOutputStart: 'off', fogOutputEnd: 'strong' } },
        },
        modes: [{ name: '2-channel', shortName: '2ch', channels: ['Zoom', 'Haze'] }],
      }),
      new FixtureProfile({
        uuid: 'new-spot',
        name: 'New spot',
        availableChannels: {
          Beam: { capability: { type: 'BeamAngle', angleStart: '45deg', angleEnd: '5deg' } },
          Output: { capability: { type: 'FogOutput', fogOutputStart: '0%', fogOutputEnd: '100%' } },
        },
        modes: [{ name: '2-channel', shortName: '2ch', channels: ['Beam', 'Output'] }],
      })
    );
    const look = preset({
      fixtureChannelValues: [
        { profileUuid: 'old-spot', channelName: 'Zoom', value: 51 },
        { profileUuid: 'old-spot', channelName: 'Haze', value: 102 },
      ],
    });

    exchange([look], 'old-spot', 'new-spot', true);

    // a fifth of the way to wide, two fifths of the fog
    expect(channelValues(look, 'new-spot')).toEqual({ Beam: 204, Output: 102 });
  });

  it('keeps the values of the old model, for the fixtures of it the project still has', () => {
    const look = preset({ fixtureChannelValues: [{ profileUuid: 'par-a', channelName: 'Strobe', value: 200 }] });

    exchange([look], 'par-a', 'par-b', true);

    expect(channelValues(look, 'par-a')).toEqual({ Strobe: 200 });
  });

  it('only tells what would be carried, without applying it', () => {
    const look = preset({ fixtureChannelValues: [{ profileUuid: 'par-a', channelName: 'Strobe', value: 200 }] });

    const report = exchange([look], 'par-a', 'par-b', false);

    expect(report.carried.length).toBe(1);
    expect(channelValues(look, 'par-b')).toEqual({});
  });

  it('tells what the new model has nothing for, and leaves a value doing nothing out', () => {
    const look = preset({
      fixtureChannelValues: [
        { profileUuid: 'par-a', channelName: 'Program', value: 100 },
        { profileUuid: 'par-a', channelName: 'Strobe', value: 0 },
        // a channel the old mode doesn't have, which plays on nothing anyway
        { profileUuid: 'par-a', channelName: 'Missing', value: 10 },
      ],
    });

    const report = exchange([look], 'par-a', 'par-b', true);

    expect(report.carried).toEqual([]);
    expect(report.lost).toEqual([{ presetName: 'Look', from: 'Program', to: undefined, reason: 'nothing' }]);
    expect(channelValues(look, 'par-b')).toEqual({});
  });

  it('leaves a value the step sets for the new model already as it is', () => {
    const look = preset({
      fixtureChannelValues: [
        { profileUuid: 'par-a', channelName: 'Strobe', value: 132.5 },
        { profileUuid: 'par-b', channelName: 'Shutter', value: 10 },
      ],
    });

    const report = exchange([look], 'par-a', 'par-b', true);

    expect(channelValues(look, 'par-b')).toEqual({ Shutter: 10 });
    expect(report.lost).toEqual([{ presetName: 'Look', from: 'Strobe', to: 'Shutter', reason: 'taken' }]);
  });

  it('carries the values to the channels of the mode the new fixtures are in', () => {
    const look = preset({ fixtureChannelValues: [{ profileUuid: 'par-a', channelName: 'Strobe', value: 132.5 }] });

    const report = exchange([look], 'par-a', 'par-b', true, 1);

    expect(report.lost.map((item) => item.from)).toEqual(['Strobe']);
  });

  it('carries a capability set for the old model only to the new one', () => {
    const look = preset({ fixtureCapabilityValues: [{ type: 'Intensity', valuePercentage: 0.4, profileUuid: 'par-a' }] });

    exchange([look], 'par-a', 'par-b', true);

    const values = look.steps[0].fixtureCapabilityValues;
    expect(values.map((value) => value.profileUuid)).toEqual(['par-a', 'par-b']);
    expect(values[1].valuePercentage).toBe(0.4);
  });

  it('turns a wheel to the slot of the new model taking the place of the old one', () => {
    const slot = (wheel: string, slotNumber: number) => ({ type: 'WheelSlot', wheel, slotNumber, profileUuid: 'spot-a' });
    const looks = [
      preset({ fixtureCapabilityValues: [slot('Color Wheel', 1), slot('Gobo Wheel', 3)] }),
      preset({ fixtureCapabilityValues: [slot('Color Wheel', 2), slot('Gobo Wheel', 2)] }),
    ];

    const report = exchange(looks, 'spot-a', 'spot-b', true);

    const slots = (look: Preset) =>
      look.steps[0].fixtureCapabilityValues
        .filter((value) => value.profileUuid === 'spot-b')
        .map((value) => value.wheel + ' ' + value.slotNumber);

    // the open slot for the open one, a gobo of the same name
    expect(slots(looks[0])).toEqual(['Colors 2', 'Gobo 2']);
    // the closest color, a gobo the new model doesn't have
    expect(slots(looks[1])).toEqual(['Colors 4']);
    expect(report.lost).toEqual([{ presetName: 'Look', from: 'Gobo Wheel 2', reason: 'gobo' }]);
  });

  it('turns the wheel set with the value of its channel to the slot taking its place', () => {
    const look = preset({ fixtureChannelValues: [{ profileUuid: 'spot-a', channelName: 'Color Wheel', value: 25 }] });

    exchange([look], 'spot-a', 'spot-b', true);

    // the blue slot of the new wheel, in its middle
    expect(channelValues(look, 'spot-b')).toEqual({ Color: 24 });
  });

  it('drives the channel of the new model doing the same with an effect', () => {
    const look = preset({}, [{ type: 'curve', uuid: 'curve', channels: [{ profileUuid: 'par-a', channels: ['Strobe', 'Program'] }] }]);

    const report = exchange([look], 'par-a', 'par-b', true);

    const curve = look.effects[0] as EffectCurve;
    expect(curve.channels.map((channels) => channels.profileUuid + ': ' + channels.channels.join(', '))).toEqual([
      'par-a: Strobe, Program',
      'par-b: Shutter',
    ]);
    expect(report.lost.map((item) => item.from)).toEqual(['Program']);
  });

  it('carries the values of a pixel to the pixel at the same place, as long as both have as many', () => {
    const look = preset({ fixtureChannelValues: [{ profileUuid: 'bar-3', channelName: 'Red 2', value: 100 }] });

    exchange([look], 'bar-3', 'bar-3b', true);
    expect(channelValues(look, 'bar-3b')).toEqual({ 'Red 2': 100 });

    const report = exchange([look], 'bar-3', 'bar-4', true);
    expect(report.lost.map((item) => item.from)).toEqual(['Red 2']);
  });

  it('maps the pixels of the old model to the ones at the same place', () => {
    const map = service.getPixelKeyMap(profile('bar-3'), profile('bar-3').modes[0], profile('bar-3b'), profile('bar-3b').modes[0]);

    expect(Array.from(map.entries())).toEqual([
      ['1', '1'],
      ['2', '2'],
      ['3', '3'],
    ]);
    expect(service.getPixelKeyMap(profile('bar-3'), profile('bar-3').modes[0], profile('bar-4'), profile('bar-4').modes[0]).size).toBe(0);
  });

  it('changes nothing for the same model', () => {
    const look = preset({ fixtureChannelValues: [{ profileUuid: 'par-a', channelName: 'Strobe', value: 132.5 }] });

    const report = exchange([look], 'par-a', 'par-a', true);

    expect(report.carried).toEqual([]);
    expect(look.steps[0].fixtureChannelValues.length).toBe(1);
  });
});
