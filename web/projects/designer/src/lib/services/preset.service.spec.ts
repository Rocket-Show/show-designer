import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { profiles as conformanceProfiles } from '../../../conformance/index';
import { CachedFixtureCapability } from '../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../models/cached-fixture-channel';
import { EffectCurve } from '../models/effect-curve';
import { Fixture } from '../models/fixture';
import { FixtureCapability, FixtureCapabilityColor, FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { FolderPosition } from '../models/folder-position';
import { Preset } from '../models/preset';
import { PresetFixture } from '../models/preset-fixture';
import { PresetStepEffectAmount } from '../models/preset-step-effect-amount';
import { Project } from '../models/project';
import { AnimationService } from './animation.service';
import { EffectService } from './effect.service';
import { FixturePixelGroupResolveService } from './fixture-pixel-group-resolve.service';
import { FixtureService } from './fixture.service';
import { LivePreviewService } from './live-preview.service';
import { PresetService } from './preset.service';
import { ProjectService } from './project.service';

// what a preset drives a capability of its fixtures to. The mirror of a preset is
// applied here, so the preview, the channels and the player all show the same position.
describe('PresetService pan/tilt mirror', () => {
  let service: PresetService;

  beforeEach(() => {
    // the value is worked out from the passed capability, channel and preset alone (and the
    // brightness by the fixture service), so the service is built without its other
    // dependencies rather than dragging the whole designer into the spec
    const fixtureService = new FixtureService(undefined, undefined, undefined, undefined, undefined, new FixturePixelGroupResolveService());
    service = new PresetService(undefined, undefined, undefined, undefined, fixtureService, undefined, undefined, undefined);
  });

  // a channel of a moving head driving the passed capability over its whole range
  function channel(type: FixtureCapabilityType): CachedFixtureChannel {
    const cachedChannel = new CachedFixtureChannel();
    cachedChannel.name = type.toString();
    cachedChannel.maxValue = 255;

    const cachedCapability = new CachedFixtureCapability();
    cachedCapability.capability = new FixtureCapability();
    cachedCapability.capability.type = type;
    cachedChannel.capabilities.push(cachedCapability);

    return cachedChannel;
  }

  // the dmx value the passed preset drives the capability to
  function valueOf(preset: Preset, type: FixtureCapabilityType, valuePercentage: number): number {
    const capabilityValue = new FixtureCapabilityValue();
    capabilityValue.type = type;
    capabilityValue.valuePercentage = valuePercentage;

    const cachedChannel = channel(type);

    return service.getCapabilityChannelValue(capabilityValue, cachedChannel, cachedChannel.capabilities[0], preset);
  }

  function preset(mirrorPan: boolean, mirrorTilt: boolean): Preset {
    const mirrored = new Preset();
    mirrored.mirrorPan = mirrorPan;
    mirrored.mirrorTilt = mirrorTilt;

    return mirrored;
  }

  it('should drive a preset which mirrors nothing to the position it is written with', () => {
    expect(valueOf(preset(false, false), FixtureCapabilityType.Pan, 0.25)).toBe(255 * 0.25);
    expect(valueOf(preset(false, false), FixtureCapabilityType.Tilt, 0.25)).toBe(255 * 0.25);
  });

  it('should drive a mirrored pan to the mirrored position and leave the tilt alone', () => {
    expect(valueOf(preset(true, false), FixtureCapabilityType.Pan, 0.25)).toBe(255 * 0.75);
    expect(valueOf(preset(true, false), FixtureCapabilityType.Tilt, 0.25)).toBe(255 * 0.25);
  });

  it('should drive a mirrored tilt to the mirrored position and leave the pan alone', () => {
    expect(valueOf(preset(false, true), FixtureCapabilityType.Pan, 0.25)).toBe(255 * 0.25);
    expect(valueOf(preset(false, true), FixtureCapabilityType.Tilt, 0.25)).toBe(255 * 0.75);
  });

  it('should leave the capabilities which are not pan or tilt to a mirrored preset', () => {
    expect(valueOf(preset(true, true), FixtureCapabilityType.Intensity, 0.25)).toBe(255 * 0.25);
  });

  it('should drive to the written position where no preset asks for a mirror', () => {
    const cachedChannel = channel(FixtureCapabilityType.Pan);
    const capabilityValue = new FixtureCapabilityValue();
    capabilityValue.type = FixtureCapabilityType.Pan;
    capabilityValue.valuePercentage = 0.25;

    expect(service.getCapabilityChannelValue(capabilityValue, cachedChannel, cachedChannel.capabilities[0])).toBe(255 * 0.25);
  });
});

// What a capability value of a preset puts on a channel, the way the preview and Rocket Show play it.
describe('PresetService putting a capability value on a channel', () => {
  let service: PresetService;

  beforeEach(() => {
    const fixtureService = new FixtureService(undefined, undefined, undefined, undefined, undefined, new FixturePixelGroupResolveService());
    service = new PresetService(undefined, undefined, undefined, undefined, fixtureService, undefined, undefined, undefined);
  });

  function capability(type: FixtureCapabilityType, dmxRange?: number[], color?: FixtureCapabilityColor): CachedFixtureCapability {
    const cachedCapability = new CachedFixtureCapability();
    cachedCapability.capability = new FixtureCapability({ type, dmxRange, color });
    return cachedCapability;
  }

  function channel(...capabilities: CachedFixtureCapability[]): CachedFixtureChannel {
    const cachedChannel = new CachedFixtureChannel();
    cachedChannel.name = 'Channel';
    cachedChannel.maxValue = 255;
    cachedChannel.capabilities = capabilities;
    return cachedChannel;
  }

  function value(type: FixtureCapabilityType, valuePercentage: number, color?: FixtureCapabilityColor): FixtureCapabilityValue {
    const capabilityValue = new FixtureCapabilityValue();
    capabilityValue.type = type;
    capabilityValue.valuePercentage = valuePercentage;
    capabilityValue.color = color;
    return capabilityValue;
  }

  it('sets nothing for a value without a percentage, or one below 0', () => {
    for (const type of [
      FixtureCapabilityType.Intensity,
      FixtureCapabilityType.ColorIntensity,
      FixtureCapabilityType.Pan,
      FixtureCapabilityType.Tilt,
    ]) {
      const cachedChannel = channel(capability(type));

      for (const valuePercentage of [undefined, -0.5]) {
        expect(
          service.getCapabilityChannelValue(value(type, valuePercentage), cachedChannel, cachedChannel.capabilities[0])
        ).toBeUndefined();
      }
      expect(service.getCapabilityChannelValue(value(type, 0), cachedChannel, cachedChannel.capabilities[0])).toBe(0);
    }
  });

  it('lights a color through the capability of that color, on a channel shared by two colors', () => {
    const green = capability(FixtureCapabilityType.ColorIntensity, [0, 127], FixtureCapabilityColor.Green);
    const red = capability(FixtureCapabilityType.ColorIntensity, [128, 255], FixtureCapabilityColor.Red);
    const shared = channel(green, red);

    expect(service.getCapabilityChannelValue(value(FixtureCapabilityType.ColorIntensity, 1, FixtureCapabilityColor.Red), shared, red)).toBe(
      255
    );
    expect(
      service.getCapabilityChannelValue(value(FixtureCapabilityType.ColorIntensity, 1, FixtureCapabilityColor.Red), shared, green)
    ).toBeUndefined();
    expect(
      service.getCapabilityChannelValue(value(FixtureCapabilityType.ColorIntensity, 1, FixtureCapabilityColor.Green), shared, green)
    ).toBe(127);
  });

  it('puts a slot of a wheel onto the middle of its range, and no other slot', () => {
    const slot = (slotNumber: number, dmxRange: number[]) => {
      const cachedCapability = capability(FixtureCapabilityType.WheelSlot, dmxRange);
      cachedCapability.capability.slotNumber = slotNumber;
      cachedCapability.centerValue = Math.floor((dmxRange[0] + dmxRange[1]) / 2);
      return cachedCapability;
    };
    const wheel = channel(slot(1, [0, 9]), slot(2, [10, 19]));
    const second = new FixtureCapabilityValue();
    second.type = FixtureCapabilityType.WheelSlot;
    second.slotNumber = 2;

    expect(service.getCapabilityChannelValue(second, wheel, wheel.capabilities[1])).toBe(14);
    expect(service.getCapabilityChannelValue(second, wheel, wheel.capabilities[0])).toBeUndefined();
  });
});

// Editing presets: which fixtures they light, the values of their steps and channels, their
// steps and how they are added, copied and removed. The fixtures are the ones of the conformance
// cases: two pars with a dimmer (the second patched twice), a moving head and a pixel bar.
describe('PresetService editing presets', () => {
  let service: PresetService;
  let fixtureService: FixtureService;
  let project: Project;
  let previewLive: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    project = new Project({
      fixtureProfiles: ['test/rgb-par', 'test/moving-head', 'chauvet-dj/colorband-pix'].map((name) => ({
        ...JSON.parse(JSON.stringify(conformanceProfiles[name])),
        uuid: name,
      })),
      fixtures: [
        { uuid: 'par-1', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 0 },
        { uuid: 'par-2', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 10 },
        { uuid: 'par-2-twin', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 10 },
        { uuid: 'head', profileUuid: 'test/moving-head', modeShortName: '6ch', dmxUniverseUuid: 'v', dmxFirstChannel: 0 },
        { uuid: 'bar', profileUuid: 'chauvet-dj/colorband-pix', modeShortName: '3ch', dmxUniverseUuid: 'w', dmxFirstChannel: 0 },
      ],
      presetFixtures: [
        { fixtureUuid: 'par-1' },
        { fixtureUuid: 'par-2' },
        { fixtureUuid: 'par-2-twin' },
        { fixtureUuid: 'head' },
        { fixtureUuid: 'bar' },
      ],
      presets: [
        { uuid: 'red', name: 'Red', fixtures: [{ fixtureUuid: 'par-1' }], steps: [{ uuid: 'red-1' }] },
        {
          uuid: 'move',
          name: 'Move',
          fixtures: [{ fixtureUuid: 'head' }],
          steps: [{ uuid: 'move-1' }, { uuid: 'move-2', startMillis: 1000 }],
        },
      ],
    });
    TestBed.inject(ProjectService).project = project;

    fixtureService = TestBed.inject(FixtureService);
    fixtureService.updateCachedFixtures();
    service = TestBed.inject(PresetService);
    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');
  });

  function preset(uuid: string): Preset {
    return service.getPresetByUuid(uuid);
  }

  function fixture(uuid: string): Fixture {
    return fixtureService.getFixtureByUuid(uuid);
  }

  function fixtureUuids(selected: Preset): string[] {
    return selected.fixtures.map(
      (presetFixture) => presetFixture.fixtureUuid + (presetFixture.pixelKey ? '/' + presetFixture.pixelKey : '')
    );
  }

  it('shows a preset with its own icon or the default one', () => {
    expect(service.getPresetIcon(preset('red'))).toBe(PresetService.defaultIcon);

    preset('red').icon = 'fa-star';
    expect(service.getPresetIcon(preset('red'))).toBe('fa-star');
  });

  it('gives a preset its own fixture order, starting from the one of the project', () => {
    const red = preset('red');
    red.fixtures = [new PresetFixture({ fixtureUuid: 'head' }), new PresetFixture({ fixtureUuid: 'par-1' })];
    red.fixtureFolders = [new FolderPosition({ folderUuid: 'f' })];

    service.setUseGlobalFixtureOrder(red, false);

    expect(red.useGlobalFixtureOrder).toBe(false);
    expect(fixtureUuids(red)).toEqual(['par-1', 'head']);
    expect(red.fixtureFolders).toEqual([]);
    expect(previewLive).toHaveBeenCalled();

    service.setUseGlobalFixtureOrder(red, true);
    expect(red.useGlobalFixtureOrder).toBe(true);
    expect(fixtureUuids(red)).toEqual(['par-1', 'head']);
  });

  it('knows the fixtures of the selected preset, or of the passed one', () => {
    expect(service.fixtureIsSelected(fixture('par-1'), undefined)).toBe(false);

    service.selectedPreset = preset('red');
    expect(service.fixtureIsSelected(fixture('par-1'), undefined)).toBe(true);
    expect(service.fixtureIsSelected(fixture('head'), undefined)).toBe(false);
    expect(service.fixtureIsSelected(fixture('head'), undefined, preset('move'))).toBe(true);
  });

  it('selects and unselects all fixtures on the same address together', () => {
    service.switchFixtureSelection(fixture('par-2'), undefined);
    expect(service.selectedPreset).toBeUndefined();

    service.selectedPreset = preset('red');
    service.switchFixtureSelection(fixture('par-2'), undefined);
    expect(fixtureUuids(preset('red'))).toEqual(['par-1', 'par-2', 'par-2-twin']);

    service.switchFixtureSelection(fixture('par-2-twin'), undefined);
    expect(fixtureUuids(preset('red'))).toEqual(['par-1']);
  });

  it('selects every fixture and pixel, or none', () => {
    service.selectAllFixtures();
    service.selectNoFixtures();
    expect(fixtureUuids(preset('red'))).toEqual(['par-1']);

    service.selectedPreset = preset('red');
    service.selectAllFixtures();

    const selected = fixtureUuids(preset('red'));
    expect(selected.slice(0, 4)).toEqual(['par-1', 'par-2', 'par-2-twin', 'head']);
    // the bar in its 3 channel mode is one lamp, a general channel
    expect(selected).toContain('bar');

    // nothing is selected twice
    service.selectAllFixtures();
    expect(fixtureUuids(preset('red'))).toEqual(selected);

    service.selectNoFixtures();
    expect(fixtureUuids(preset('red'))).toEqual([]);
  });

  it('removes the fixtures from the presets which are gone from the pool', () => {
    preset('red').fixtures.push(new PresetFixture({ fixtureUuid: 'gone' }), new PresetFixture({ fixtureUuid: 'par-1', pixelKey: '3' }));

    service.removeDeletedFixtures();

    expect(fixtureUuids(preset('red'))).toEqual(['par-1']);
  });

  it('adds the fixtures patched onto the address of a selected one', () => {
    preset('red').fixtures = [new PresetFixture({ fixtureUuid: 'par-2' })];

    service.updateFixtureSelection();

    expect(fixtureUuids(preset('red'))).toEqual(['par-2', 'par-2-twin']);
    expect(fixtureUuids(preset('move'))).toEqual(['head']);
  });

  it('sets, reads and deletes the capability values of a step', () => {
    const step = preset('red').steps[0];
    const changed = jasmine.createSpy('capabilityValuesChanged');
    service.capabilityValuesChanged.subscribe(changed);

    service.setCapabilityValue(step, FixtureCapabilityType.Intensity, 0.5);
    service.setCapabilityValue(step, FixtureCapabilityType.ColorIntensity, 1, undefined, FixtureCapabilityColor.Red);
    // a value of the same kind replaces the one there is
    service.setCapabilityValue(step, FixtureCapabilityType.Intensity, 0.75);

    expect(step.fixtureCapabilityValues.length).toBe(2);
    expect(service.getCapabilityValue(step, FixtureCapabilityType.Intensity).valuePercentage).toBe(0.75);
    expect(service.getCapabilityValue(step, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Red).valuePercentage).toBe(1);
    expect(service.getCapabilityValue(step, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Blue)).toBeUndefined();
    expect(service.getCapabilityValue(undefined, FixtureCapabilityType.Intensity)).toBeUndefined();

    service.deleteCapabilityValue(step, FixtureCapabilityType.Intensity);
    expect(service.getCapabilityValue(step, FixtureCapabilityType.Intensity)).toBeUndefined();
    expect(changed).toHaveBeenCalledTimes(4);

    // deleting a value which isn't there changes nothing else
    service.deleteCapabilityValue(step, FixtureCapabilityType.Pan);
    expect(step.fixtureCapabilityValues.length).toBe(1);
  });

  it('sets, reads and deletes the channel values of the step being edited', () => {
    service.setChannelValue('Strobe', 'test/rgb-par', 10);
    expect(service.getChannelValue('Strobe', 'test/rgb-par')).toBeUndefined();

    service.selectedStep = preset('red').steps[0];
    service.setChannelValue('Strobe', 'test/rgb-par', 10);
    service.setChannelValue('Strobe', 'test/rgb-par', 20);
    service.setChannelValue('Strobe', 'other', 30);

    expect(service.getChannelValue('Strobe', 'test/rgb-par')).toBe(20);
    expect(service.getChannelValue('Strobe', 'other')).toBe(30);
    expect(service.getChannelValue('Dimmer', 'test/rgb-par')).toBeUndefined();

    service.deleteChannelValue('Strobe', 'test/rgb-par');
    expect(service.getChannelValue('Strobe', 'test/rgb-par')).toBeUndefined();
    expect(preset('red').steps[0].fixtureChannelValues.length).toBe(1);
  });

  function cachedChannel(fixtureUuid: string, name: string): CachedFixtureChannel {
    return fixtureService.getCachedFixtureByUuid(fixtureUuid, undefined).channels.find((channel) => channel.name === name);
  }

  it('shows what the capabilities of a step drive a channel to', () => {
    const values = [
      new FixtureCapabilityValue({ type: 'Intensity', valuePercentage: 0.2 }),
      new FixtureCapabilityValue({ type: 'Intensity', valuePercentage: 0.4, profileUuid: 'test/rgb-par' }),
    ];

    // the later value wins, like in the preview
    expect(service.getChannelValueFromCapabilities(values, cachedChannel('par-1', 'Dimmer'), 'test/rgb-par')).toBeCloseTo(102, 9);
    expect(service.getChannelValueFromCapabilities(values, cachedChannel('par-1', 'Red'), 'test/rgb-par')).toBeUndefined();

    // a color wheel without a slot of its own shows the slot closest to the color
    const blue = [
      new FixtureCapabilityValue({ type: 'ColorIntensity', color: 'Red', valuePercentage: 0 }),
      new FixtureCapabilityValue({ type: 'ColorIntensity', color: 'Green', valuePercentage: 0 }),
      new FixtureCapabilityValue({ type: 'ColorIntensity', color: 'Blue', valuePercentage: 1 }),
    ];
    expect(service.getChannelValueFromCapabilities(blue, cachedChannel('head', 'Color Wheel'), 'test/moving-head')).toBe(34);
  });

  it('knows the channels an effect of a preset drives', () => {
    const move = preset('move');
    move.effects = [
      new EffectCurve({ uuid: 'pan', capabilities: [{ type: 'Pan' }] }),
      new EffectCurve({ uuid: 'strobe', channels: [{ profileUuid: 'test/rgb-par', channels: ['Strobe'] }] }),
      new EffectCurve({ uuid: 'hidden', visible: false, capabilities: [{ type: 'Intensity' }] }),
    ];

    expect(service.channelIsDrivenByEffect(move, cachedChannel('head', 'Pan'), 'test/moving-head')).toBe(true);
    expect(service.channelIsDrivenByEffect(move, cachedChannel('par-1', 'Strobe'), 'test/rgb-par')).toBe(true);
    expect(service.channelIsDrivenByEffect(move, cachedChannel('par-1', 'Strobe'), 'other')).toBe(false);
    expect(service.channelIsDrivenByEffect(move, cachedChannel('par-1', 'Dimmer'), 'test/rgb-par')).toBe(false);
  });

  it('offers the panels the fixtures of the selected preset have', () => {
    expect(service.hasCapabilityDimmer()).toBe(false);
    expect(service.hasCapabilityColorOrColorWheel()).toBe(false);

    service.selectedPreset = preset('red');
    expect(service.hasCapabilityDimmer()).toBe(true);
    expect(service.hasCapabilityColor()).toBe(true);
    expect(service.hasCapabilityPanTilt()).toBe(false);

    service.selectedPreset = preset('move');
    expect(service.hasCapabilityColor()).toBe(false);
    expect(service.hasCapabilityColorOrColorWheel()).toBe(true);
    expect(service.hasCapabilityPanTilt()).toBe(true);
  });

  it('selects a preset with its first step and opens its only effect', () => {
    const effectService = TestBed.inject(EffectService);
    const changed = jasmine.createSpy('previewSelectionChanged');
    service.previewSelectionChanged.subscribe(changed);
    preset('move').effects = [new EffectCurve({ uuid: 'only' })];

    service.selectPreset(1);

    expect(service.selectedPreset).toBe(preset('move'));
    expect(project.selectedPresetUuid).toBe('move');
    expect(service.selectedStep.uuid).toBe('move-1');
    expect(project.selectedStepUuid).toBe('move-1');
    expect(effectService.selectedEffect).toBe(preset('move').effects[0]);
    expect(changed).toHaveBeenCalled();

    service.setPreviewPreset(true);
    expect(project.previewPreset).toBe(true);
  });

  it('edits the step selected in the preset being edited, the first one of the others', () => {
    service.selectPreset(1);
    service.selectStep(preset('move').steps[1]);

    expect(service.getEditStep(preset('move')).uuid).toBe('move-2');
    expect(service.getEditStep(preset('red')).uuid).toBe('red-1');

    // a step which isn't one of the preset anymore
    service.selectedStep = preset('red').steps[0];
    expect(service.getEditStep(preset('move')).uuid).toBe('move-1');
  });

  it('picks the step of the project up after it has been loaded', () => {
    project.presets.push(new Preset({ uuid: 'old', fixtureChannelValues: [{ channelName: 'Dimmer', value: 1 }] }));
    project.selectedStepUuid = 'move-2';
    project.stepPreviewRunning = true;

    service.selectStepFromProject();
    // without a selected preset there is no step to edit
    expect(service.selectedStep).toBeUndefined();
    // an old preset gets its values as a step
    expect(preset('old').steps.length).toBe(1);
    expect(project.stepPreviewRunning).toBe(false);

    service.selectedPreset = preset('move');
    service.selectStepFromProject();
    expect(service.selectedStep.uuid).toBe('move-2');

    project.selectedStepUuid = 'gone';
    service.selectStepFromProject();
    expect(service.selectedStep.uuid).toBe('move-1');
  });

  it('adds a step after the one being edited and deletes one', () => {
    expect(service.addStep()).toBeUndefined();
    service.deleteStep(preset('move').steps[0]);
    expect(preset('move').steps.length).toBe(2);

    service.selectPreset(1);
    const added = service.addStep();

    expect(preset('move').steps.map((step) => step.startMillis)).toEqual([0, 1000, 2000]);
    expect(service.selectedStep).toBe(added);

    service.deleteStep(preset('move').steps[0]);
    expect(service.selectedStep).toBe(added);

    service.deleteStep(added);
    expect(service.selectedStep.uuid).toBe('move-2');
  });

  it('keeps the steps in the order they are reached', () => {
    service.selectPreset(1);
    preset('move').steps[0].startMillis = 2000;

    service.stepChanged();

    expect(preset('move').steps.map((step) => step.uuid)).toEqual(['move-2', 'move-1']);
  });

  it('shows the steps once a preset has more than one, or as asked', () => {
    expect(service.stepsVisible).toBe(false);

    service.selectedPreset = preset('move');
    expect(service.stepsVisible).toBe(true);

    service.switchStepsVisible();
    expect(service.stepsVisible).toBe(false);
  });

  it('watches the steps run from the moment it is asked to, until a pass is over', () => {
    const animationService = TestBed.inject(AnimationService);
    animationService.timeMillis = 5000;
    service.selectedPreset = preset('move');

    service.setStepPreviewRunning(true);

    expect(service.stepPreviewRunning).toBe(true);
    expect(service.stepPreviewStartMillis).toBe(5000);

    // a pass of the two steps a second apart lasts two seconds
    animationService.timeMillis = 6999;
    expect(service.stepPreviewFinished()).toBe(false);
    animationService.timeMillis = 7000;
    expect(service.stepPreviewFinished()).toBe(true);

    // a looping preset never finishes
    preset('move').stepsLoop = true;
    expect(service.stepPreviewFinished()).toBe(false);
  });

  it('adds a preset above the one being edited', () => {
    service.addPreset();
    expect(project.presets[0].name).toBe('New Preset');
    expect(service.selectedPreset).toBe(project.presets[0]);

    service.selectedPreset = preset('move');
    service.addPreset('Blue');
    expect(project.presets.map((candidate) => candidate.name)).toEqual(['New Preset', 'Red', 'Blue', 'Move']);
  });

  it('copies a preset with steps of its own, which open its own effects', () => {
    const move = preset('move');
    move.effects = [new EffectCurve({ uuid: 'sweep' })];
    move.steps[1].effectAmounts = [new PresetStepEffectAmount({ effectUuid: 'sweep', amount: 0 })];

    const copy = service.duplicatePreset(move, 'Move 2');

    expect(project.presets.map((candidate) => candidate.name)).toEqual(['Red', 'Move', 'Move 2']);
    expect(copy.effects[0].uuid).not.toBe('sweep');
    expect(copy.steps[1].effectAmounts[0].effectUuid).toBe(copy.effects[0].uuid);
    expect(copy.steps[0].uuid).not.toBe('move-1');
    // the original keeps its own
    expect(move.steps[1].effectAmounts[0].effectUuid).toBe('sweep');
    expect(service.selectedPreset).toBe(copy);

    expect(service.duplicatePreset(new Preset({ uuid: 'not in the project' }))).toBeUndefined();
  });

  it('removes a preset and edits the first one left', () => {
    service.removePreset(preset('red'));
    expect(service.selectedPreset).toBe(preset('move'));

    service.removePreset(preset('move'));
    expect(service.selectedPreset).toBeUndefined();
    expect(project.selectedPresetUuid).toBeUndefined();
    expect(service.selectedStep).toBeUndefined();

    service.removePreset(new Preset({ uuid: 'other' }));
    expect(project.presets).toEqual([]);
  });

  it('offers the channels of the profiles of the selected fixtures', () => {
    expect(service.getSelectedProfiles()).toEqual([]);

    service.selectedPreset = preset('red');
    preset('red').fixtures.push(new PresetFixture({ fixtureUuid: 'par-2' }), new PresetFixture({ fixtureUuid: 'head' }));

    const profiles = service.getSelectedProfiles();
    expect(profiles.map((profile) => profile.uuid)).toEqual(['test/rgb-par', 'test/moving-head']);

    const channels = service.getSelectedProfileChannels(profiles);
    expect(channels.get(profiles[0]).map((channel) => channel.name)).toEqual(['Dimmer', 'Red', 'Green', 'Blue', 'Strobe']);
    expect(channels.get(profiles[1]).map((channel) => channel.name)).toEqual(['Pan', 'Tilt', 'Dimmer', 'Color Wheel']);
  });
});
