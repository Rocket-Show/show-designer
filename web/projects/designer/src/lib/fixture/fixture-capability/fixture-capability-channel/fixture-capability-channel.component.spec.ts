import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { ToastrModule } from 'ngx-toastr';

import { profiles } from '../../../../../conformance/index';
import { CachedFixture } from '../../../models/cached-fixture';
import { CachedFixtureCapability } from '../../../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../../../models/cached-fixture-channel';
import { EffectCurve } from '../../../models/effect-curve';
import { FixtureCapability, FixtureCapabilityType } from '../../../models/fixture-capability';
import { Preset } from '../../../models/preset';
import { Project } from '../../../models/project';
import { EffectService } from '../../../services/effect.service';
import { FixtureService } from '../../../services/fixture.service';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { PresetStepService } from '../../../services/preset-step.service';
import { ProjectService } from '../../../services/project.service';
import { FixtureCapabilityChannelComponent } from './fixture-capability-channel.component';

// One channel of a profile in the preset, set to a DMX value of its own by the step being
// edited: picked by one of its capabilities, typed in or set with the slider. Without a value
// of its own, it shows what the capabilities of the step drive it to. The fixtures are a par
// with a dimmer, colors and a strobe, and a moving head.
describe('FixtureCapabilityChannelComponent', () => {
  let fixture: ComponentFixture<FixtureCapabilityChannelComponent>;
  let component: FixtureCapabilityChannelComponent;
  let element: HTMLElement;
  let presetService: PresetService;
  let preset: Preset;
  let par: CachedFixture;
  let head: CachedFixture;
  let previewLive: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FixtureCapabilityChannelComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot(), PopoverModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    }).compileComponents();

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    const project = new Project({
      fixtureProfiles: ['test/rgb-par', 'test/moving-head'].map((name) => ({ ...JSON.parse(JSON.stringify(profiles[name])), uuid: name })),
      fixtures: [
        { uuid: 'par', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 0 },
        { uuid: 'head', profileUuid: 'test/moving-head', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 10 },
      ],
      presetFixtures: [{ fixtureUuid: 'par' }, { fixtureUuid: 'head' }],
      presets: [
        {
          uuid: 'look',
          fixtures: [{ fixtureUuid: 'par' }, { fixtureUuid: 'head' }],
          steps: [{ uuid: 'first' }, { uuid: 'second', startMillis: 1000 }],
        },
      ],
    });
    TestBed.inject(ProjectService).project = project;

    const fixtureService = TestBed.inject(FixtureService);
    fixtureService.updateCachedFixtures();
    par = fixtureService.getCachedFixtureByUuid('par', undefined);
    head = fixtureService.getCachedFixtureByUuid('head', undefined);

    preset = project.presets[0];
    presetService = TestBed.inject(PresetService);
    presetService.selectedPreset = preset;
    presetService.selectedStep = preset.steps[0];
  });

  afterEach(() => fixture.destroy());

  async function render(cachedFixture: CachedFixture, channel: CachedFixtureChannel | string) {
    fixture = TestBed.createComponent(FixtureCapabilityChannelComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.componentRef.setInput('profile', cachedFixture.profile);
    fixture.componentRef.setInput('channel', typeof channel === 'string' ? channelOf(cachedFixture, channel) : channel);
    fixture.componentRef.setInput('capabilityIndex', 3);
    await update();
  }

  // the channel only redraws on its own when it is told to
  async function update() {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  // the channel follows the changes made elsewhere a moment later
  async function afterUpdateDelay() {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await fixture.whenStable();
  }

  function channelOf(cachedFixture: CachedFixture, name: string): CachedFixtureChannel {
    return cachedFixture.channels.find((channel) => channel.name === name);
  }

  function checkbox(): HTMLInputElement {
    return element.querySelector('#capabilityGeneric3Active');
  }

  function radios(): HTMLInputElement[] {
    return Array.from(element.querySelectorAll('input[type="radio"]'));
  }

  function radioLabels(): string[] {
    return Array.from(element.querySelectorAll('.form-check-label[for^="capabilityGeneric3Option"]')).map((label) =>
      label.textContent.replace(/\s+/g, ' ').trim()
    );
  }

  function input(): HTMLInputElement {
    return element.querySelector('input.sd-value-input');
  }

  function type(value: string) {
    input().value = value;
    input().dispatchEvent(new Event('input'));
  }

  function channelValue(cachedFixture: CachedFixture, name: string): number {
    return presetService.getChannelValue(name, cachedFixture.profile.uuid);
  }

  it('is off while the step gives it no value of its own, showing its default value', async () => {
    await render(par, 'Strobe');

    expect(element.querySelector('.card-header label').textContent.trim()).toBe('Strobe');
    expect(element.querySelector('.card').classList).toContain('capability-deactivated');
    expect(checkbox().checked).toBe(false);
    expect(component.templateValue).toBe(5);
  });

  it('offers the capabilities of a channel with several of them, marking the one it is in', async () => {
    await render(par, 'Strobe');

    expect(radioLabels()).toEqual([
      'designer.fixtureCapabilityType.ShutterStrobe (Open)',
      'designer.fixtureCapabilityType.ShutterStrobe (Strobe)',
    ]);
    expect(radios().map((radio) => radio.checked)).toEqual([true, false]);

    // a capability without a range has no slider
    expect(input()).toBeNull();
  });

  it('switches on at the value it shows, and off again', async () => {
    await render(par, 'Strobe');

    checkbox().click();
    await update();

    expect(channelValue(par, 'Strobe')).toBe(5);
    expect(element.querySelector('.card').classList).not.toContain('capability-deactivated');
    expect(previewLive).toHaveBeenCalled();

    checkbox().click();
    await update();

    expect(channelValue(par, 'Strobe')).toBeUndefined();
    expect(element.querySelector('.card').classList).toContain('capability-deactivated');
  });

  it('moves into the middle of the capability picked', async () => {
    await render(par, 'Strobe');

    radios()[1].click();
    await update();

    expect(channelValue(par, 'Strobe')).toBe(132);
    expect(radios().map((radio) => radio.checked)).toEqual([false, true]);
  });

  it('marks the capability the value of the step lies in', async () => {
    presetService.setChannelValue('Strobe', 'test/rgb-par', 200);
    await render(par, 'Strobe');

    expect(checkbox().checked).toBe(true);
    expect(radios().map((radio) => radio.checked)).toEqual([false, true]);
  });

  it('slides over the whole channel with a single capability', async () => {
    await render(par, 'Dimmer');

    expect(radios().length).toBe(0);
    expect(input().value).toBe('0');
    expect(component.rangeMin).toBe(0);
    expect(component.rangeMax).toBe(255);
  });

  it('sets the value typed in as a number, so a step can travel from it', async () => {
    await render(par, 'Dimmer');

    type('200');

    expect(channelValue(par, 'Dimmer')).toBe(200);
    expect(previewLive).toHaveBeenCalled();

    // half way into a second step at 100
    presetService.selectStep(preset.steps[1]);
    presetService.setChannelValue('Dimmer', 'test/rgb-par', 100);
    const state = TestBed.inject(PresetStepService).getStateAtMillis(preset, 1500);

    expect(state.fixtureChannelValues.find((value) => value.channelName === 'Dimmer').value).toBe(150);
  });

  it('keeps its value for anything outside the capability', async () => {
    await render(par, 'Dimmer');

    type('200');

    for (const typed of ['abc', '256', '-1']) {
      type(typed);
    }

    expect(channelValue(par, 'Dimmer')).toBe(200);
  });

  it('shows a value set with the slider in its field', async () => {
    await render(par, 'Dimmer');

    component.setValue(100);
    await afterUpdateDelay();

    expect(input().value).toBe('100');
  });

  it('shows what the capabilities of the step drive it to, while it has no value of its own', async () => {
    presetService.setCapabilityValue(preset.steps[0], FixtureCapabilityType.Intensity, 0.5);
    await render(par, 'Dimmer');

    expect(checkbox().checked).toBe(false);
    expect(input().value).toBe('128');

    // switched on, it keeps that value
    checkbox().click();

    expect(channelValue(par, 'Dimmer')).toBe(128);
  });

  it('tells which channels its fixture has, so that a color wheel shows no color the fixture lights itself', async () => {
    const fromCapabilities = spyOn(presetService, 'getChannelValueFromCapabilities').and.callThrough();
    fixture = TestBed.createComponent(FixtureCapabilityChannelComponent);
    fixture.componentRef.setInput('profile', head.profile);
    fixture.componentRef.setInput('fixtureChannels', head.channels);
    fixture.componentRef.setInput('channel', channelOf(head, 'Color Wheel'));
    await update();

    expect(fromCapabilities).toHaveBeenCalledWith(
      preset.steps[0].fixtureCapabilityValues,
      channelOf(head, 'Color Wheel'),
      'test/moving-head',
      preset,
      head.channels
    );
  });

  it('follows the capabilities and the step being changed elsewhere', async () => {
    await render(par, 'Dimmer');

    presetService.setCapabilityValue(preset.steps[0], FixtureCapabilityType.Intensity, 1);
    presetService.setCapabilityValue(preset.steps[0], FixtureCapabilityType.Intensity, 0.2);
    await afterUpdateDelay();

    expect(input().value).toBe('51');

    presetService.selectStep(preset.steps[1]);
    presetService.setChannelValue('Dimmer', 'test/rgb-par', 10);
    await afterUpdateDelay();

    expect(input().value).toBe('10');
    expect(checkbox().checked).toBe(true);
  });

  it('waits for a step to be edited before following the changes', async () => {
    await render(par, 'Dimmer');

    presetService.selectedStep = undefined;
    presetService.capabilityValuesChanged.next();
    await afterUpdateDelay();

    expect(component.templateValue).toBe(0);
  });

  it('tells when an effect of the preset drives it', async () => {
    const effect = new EffectCurve();
    effect.capabilities = [new FixtureCapability({ type: 'Intensity' })];
    preset.effects.push(effect);

    await render(par, 'Dimmer');

    expect(element.querySelector('.fa-magic')).not.toBeNull();

    // a hidden effect drives nothing
    effect.visible = false;
    TestBed.inject(EffectService).effectsChanged.next();
    await afterUpdateDelay();
    fixture.detectChanges();

    expect(element.querySelector('.fa-magic')).toBeNull();
  });

  it('slides inside the capability picked, between what its ends do', async () => {
    await render(head, 'Dimmer');

    expect(radioLabels()[0]).toBe('designer.fixtureCapabilityType.Intensity (off)');
    expect(radioLabels()[1]).toContain('(dark to bright)');

    radios()[1].click();
    await update();

    expect(channelValue(head, 'Dimmer')).toBe(8);
    expect(component.rangeMin).toBe(8);
    expect(component.rangeMax).toBe(134);
    expect(element.querySelector('.card-body').textContent).toContain('dark');
    expect(element.querySelector('.card-body').textContent).toContain('bright');

    type('150');
    expect(channelValue(head, 'Dimmer')).toBe(8);

    type('100');
    expect(channelValue(head, 'Dimmer')).toBe(100);
  });

  it('starts a fine channel at its default value', async () => {
    await render(head, 'Pan');

    expect(component.rangeMax).toBe(65535);
    expect(component.templateValue).toBe(32767.5);
    expect(component.descriptionStart).toBe('0deg');
    expect(component.descriptionEnd).toBe('540deg');
  });

  it('describes the colors, the comment and the timing of a capability', async () => {
    const macro = new CachedFixtureChannel();
    macro.name = 'Macro';
    macro.maxValue = 255;

    for (const data of [
      { type: 'ColorPreset', dmxRange: [0, 127], colors: ['#ff0000', '#0000ff'], comment: 'Rainbow', soundControlled: true },
      { type: 'ColorPreset', dmxRange: [128, 255], colorsStart: ['#ffffff'], colorsEnd: ['#000000'], randomTiming: true },
    ]) {
      const capability = new CachedFixtureCapability();
      capability.capability = new FixtureCapability(data);
      macro.capabilities.push(capability);
    }

    await render(par, macro);

    expect(element.querySelectorAll('.color').length).toBe(2);
    expect(radioLabels()[0]).toContain('- Rainbow');
    expect(element.querySelector('.fa-microphone')).not.toBeNull();
    expect(element.querySelector('.fa-random')).not.toBeNull();

    // a capability with a range of colors has a slider
    radios()[1].click();
    await update();

    expect(component.hasRange).toBe(true);
    expect(channelValue(par, 'Macro')).toBe(128);
  });

  it('describes nothing without a capability', async () => {
    await render(par, 'Dimmer');

    expect(component.getDescription(undefined)).toBe('');
    expect(component.getDescriptionStart(undefined)).toBe('');
    expect(component.getDescriptionEnd(undefined)).toBe('');
  });

  it('stops following the preset once it is gone', async () => {
    await render(par, 'Dimmer');
    fixture.destroy();

    presetService.setCapabilityValue(preset.steps[0], FixtureCapabilityType.Intensity, 1);
    await afterUpdateDelay();

    expect(component.templateValue).toBe(0);
  });
});
