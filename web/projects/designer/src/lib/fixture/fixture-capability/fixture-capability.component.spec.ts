import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { profiles } from '../../../../conformance/index';
import { Preset } from '../../models/preset';
import { PresetFixture } from '../../models/preset-fixture';
import { Project } from '../../models/project';
import { FixtureService } from '../../services/fixture.service';
import { IntroService } from '../../services/intro.service';
import { PresetService } from '../../services/preset.service';
import { ProjectService } from '../../services/project.service';
import { FixtureCapabilityComponent } from './fixture-capability.component';

// The capabilities the fixtures of the preset being edited have in common: the dimmer, the
// color, their color wheels and pan/tilt, each set in a panel of its own (not rendered here).
// Without anything to set, it says what is missing.
describe('FixtureCapabilityComponent', () => {
  let fixture: ComponentFixture<FixtureCapabilityComponent>;
  let element: HTMLElement;
  let project: Project;
  let presetService: PresetService;
  let preset: Preset;

  // a fixture with nothing but a dimmer, one with nothing but a strobe, one with nothing but
  // a gobo wheel and one with two color wheels
  const dimmer = {
    uuid: 'dimmer',
    name: 'Dimmer',
    availableChannels: { Dimmer: { capability: { type: 'Intensity' } } },
    modes: [{ name: '1-channel', shortName: '1ch', channels: ['Dimmer'] }],
  };
  const strobe = {
    uuid: 'strobe',
    name: 'Strobe',
    availableChannels: { Strobe: { capability: { type: 'ShutterStrobe', shutterEffect: 'Strobe' } } },
    modes: [{ name: '1-channel', shortName: '1ch', channels: ['Strobe'] }],
  };
  const wheelSlots = {
    capabilities: [0, 1].map((slot) => ({ dmxRange: [slot * 128, slot * 128 + 127], type: 'WheelSlot', slotNumber: slot + 1 })),
  };
  const gobo = {
    uuid: 'gobo',
    name: 'Gobo',
    availableChannels: { 'Gobo Wheel': wheelSlots },
    wheels: { 'Gobo Wheel': { slots: [{ type: 'Open' }, { type: 'Gobo', name: 'Star' }] } },
    modes: [{ name: '1-channel', shortName: '1ch', channels: ['Gobo Wheel'] }],
  };
  const twoWheels = {
    uuid: 'two-wheels',
    name: 'Two wheels',
    availableChannels: { 'Color Wheel 1': wheelSlots, 'Color Wheel 2': wheelSlots },
    wheels: {
      'Color Wheel 1': {
        slots: [
          { type: 'Color', colors: ['#ff0000'] },
          { type: 'Color', colors: ['#00ff00'] },
        ],
      },
      'Color Wheel 2': {
        slots: [
          { type: 'Color', colors: ['#0000ff'] },
          { type: 'Color', colors: ['#ffff00'] },
        ],
      },
    },
    modes: [{ name: '2-channel', shortName: '2ch', channels: ['Color Wheel 1', 'Color Wheel 2'] }],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FixtureCapabilityComponent],
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    project = new Project({
      fixtureProfiles: [
        ...['test/rgb-par', 'test/moving-head'].map((name) => ({ ...JSON.parse(JSON.stringify(profiles[name])), uuid: name })),
        dimmer,
        strobe,
        gobo,
        twoWheels,
      ],
      fixtures: [
        { uuid: 'par', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 0 },
        { uuid: 'head', profileUuid: 'test/moving-head', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 10 },
        { uuid: 'head-2', profileUuid: 'test/moving-head', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 50 },
        { uuid: 'dimmer', profileUuid: 'dimmer', modeShortName: '1ch', dmxUniverseUuid: 'u', dmxFirstChannel: 20 },
        { uuid: 'strobe', profileUuid: 'strobe', modeShortName: '1ch', dmxUniverseUuid: 'u', dmxFirstChannel: 30 },
        { uuid: 'gobo', profileUuid: 'gobo', modeShortName: '1ch', dmxUniverseUuid: 'u', dmxFirstChannel: 35 },
        { uuid: 'two-wheels', profileUuid: 'two-wheels', modeShortName: '2ch', dmxUniverseUuid: 'u', dmxFirstChannel: 40 },
      ],
      presetFixtures: ['par', 'head', 'head-2', 'dimmer', 'strobe', 'gobo', 'two-wheels'].map((fixtureUuid) => ({ fixtureUuid })),
      presets: [{ uuid: 'look', steps: [{ uuid: 'step' }] }],
    });
    TestBed.inject(ProjectService).project = project;
    TestBed.inject(FixtureService).updateCachedFixtures();

    preset = project.presets[0];
    presetService = TestBed.inject(PresetService);
    presetService.selectedPreset = preset;
    presetService.selectedStep = preset.steps[0];

    fixture = TestBed.createComponent(FixtureCapabilityComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  // the preset lights the passed fixtures now
  function light(...fixtureUuids: string[]) {
    preset.fixtures = fixtureUuids.map((fixtureUuid) => new PresetFixture({ fixtureUuid }));
    presetService.fixtureSelectionChanged.next();
  }

  function panels(): string[] {
    return Array.from(element.querySelectorAll('.row > .col > *')).map((panel) =>
      panel.tagName.toLowerCase().replace('lib-app-fixture-capability-', '')
    );
  }

  function message(): string {
    return element.querySelector('p.text-muted')?.textContent.trim();
  }

  // the color wheel panels, with what they are handed
  function wheels(): any[] {
    return Array.from(element.querySelectorAll('lib-app-fixture-capability-color-wheel'));
  }

  it('asks for fixtures while the project has none', () => {
    project.fixtures = [];
    fixture.destroy();
    fixture = TestBed.createComponent(FixtureCapabilityComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();

    expect(message()).toBe('designer.fixture.no-fixtures');
  });

  it('asks for the fixtures of the preset while it has none', () => {
    expect(panels()).toEqual([]);
    expect(message()).toBe('designer.fixture.no-fixtures-selected');
  });

  it('shows nothing to set while no preset is being edited', () => {
    presetService.selectedPreset = undefined;
    light();

    expect(element.querySelector('.row')).toBeNull();
    expect(message()).toBeUndefined();
  });

  it('sets the dimmer and the color of a par', () => {
    light('par');

    expect(panels()).toEqual(['dimmer', 'color']);
    expect(message()).toBeUndefined();
  });

  it('sets the dimmer, the color, the color wheel and the position of a moving head', () => {
    light('head');

    expect(panels()).toEqual(['dimmer', 'color', 'color-wheel', 'pan-tilt']);

    const [wheel] = wheels();

    expect(wheel.profile.uuid).toBe('test/moving-head');
    expect(wheel.channel.name).toBe('Color Wheel');
    expect(wheel.wheelIndex).toBe(0);
    expect(wheel.showContainer).toBe(false);
  });

  it('shows a color wheel of a profile once, however many fixtures of it the preset lights', () => {
    light('head', 'head-2');

    expect(wheels().length).toBe(1);
  });

  it('shows each color wheel of a profile, naming them', () => {
    light('head', 'two-wheels');

    expect(wheels().map((wheel) => wheel.profile.uuid + '/' + wheel.channel.name)).toEqual([
      'test/moving-head/Color Wheel',
      'two-wheels/Color Wheel 1',
      'two-wheels/Color Wheel 2',
    ]);
    expect(wheels().map((wheel) => wheel.wheelIndex)).toEqual([0, 1, 2]);
    expect(wheels().every((wheel) => wheel.showContainer)).toBe(true);
  });

  it('only sends to the channels a fixture which has nothing else to set', () => {
    light('strobe');

    expect(panels()).toEqual([]);
    expect(message()).toBe('designer.fixture.no-capabilities-available');
  });

  it('leaves a gobo wheel to the channels', () => {
    light('gobo');

    expect(panels()).toEqual([]);
    expect(message()).toBe('designer.fixture.no-capabilities-available');
  });

  it('sets a dimmer on its own, without sending to the channels', () => {
    light('dimmer');

    expect(panels()).toEqual(['dimmer']);
    expect(message()).toBeUndefined();
  });

  it('follows the preset and the step being picked', () => {
    preset.fixtures = [new PresetFixture({ fixtureUuid: 'par' })];
    presetService.previewSelectionChanged.next();
    expect(panels()).toEqual(['dimmer', 'color']);

    preset.fixtures = [new PresetFixture({ fixtureUuid: 'dimmer' })];
    presetService.stepsChanged.next();
    expect(panels()).toEqual(['dimmer']);
  });

  it('stretches the panels to its height in Chrome only', () => {
    light('par');
    expect(element.querySelector('.row').classList).toContain('h-100');

    spyOnProperty(Navigator.prototype, 'appVersion', 'get').and.returnValue('5.0 (Macintosh) Version/17.0 Safari/605.1.15');
    light('par');

    expect(element.querySelector('.row').classList).not.toContain('h-100');
  });

  it('highlights itself on its step of the intro', () => {
    const introService = TestBed.inject(IntroService);
    introService.showIntro = true;
    introService.activeStep = 'capabilities';
    introService.stepChanged.next();

    expect(element.querySelector('.card').classList).toContain('card-intro-active');
  });

  it('stops following the preset once it is gone', () => {
    fixture.destroy();

    light('par');
    presetService.previewSelectionChanged.next();
    presetService.stepsChanged.next();

    expect(fixture.componentInstance.hasCapabilityDimmer).toBe(false);
  });
});
