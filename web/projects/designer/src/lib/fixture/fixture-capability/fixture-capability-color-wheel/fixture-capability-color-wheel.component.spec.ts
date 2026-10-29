import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { profiles } from '../../../../../conformance/index';
import { CachedFixtureCapability } from '../../../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../../../models/cached-fixture-channel';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../../../models/fixture-capability';
import { FixtureProfile } from '../../../models/fixture-profile';
import { PresetStep } from '../../../models/preset-step';
import { Project } from '../../../models/project';
import { FixtureService } from '../../../services/fixture.service';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { ProjectService } from '../../../services/project.service';
import { FixtureCapabilityColorWheelComponent } from './fixture-capability-color-wheel.component';

// The color wheel of a profile in the preset: the step being edited picks one of its slots.
// The wheel is the one of the moving head of the conformance cases: open, red, red and blue
// split, and blue.
describe('FixtureCapabilityColorWheelComponent', () => {
  let fixture: ComponentFixture<FixtureCapabilityColorWheelComponent>;
  let component: FixtureCapabilityColorWheelComponent;
  let element: HTMLElement;
  let presetService: PresetService;
  let step: PresetStep;
  let profile: FixtureProfile;
  let channel: CachedFixtureChannel;
  let previewLive: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FixtureCapabilityColorWheelComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    }).compileComponents();

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    const project = new Project({
      fixtureProfiles: [{ ...JSON.parse(JSON.stringify(profiles['test/moving-head'])), uuid: 'test/moving-head' }],
      fixtures: [{ uuid: 'head', profileUuid: 'test/moving-head', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 0 }],
      presetFixtures: [{ fixtureUuid: 'head' }],
      presets: [{ uuid: 'look', fixtures: [{ fixtureUuid: 'head' }], steps: [{ uuid: 'step' }] }],
    });
    TestBed.inject(ProjectService).project = project;

    const fixtureService = TestBed.inject(FixtureService);
    fixtureService.updateCachedFixtures();

    const head = fixtureService.getCachedFixtureByUuid('head', undefined);
    profile = head.profile;
    channel = head.channels.find((headChannel) => headChannel.name === 'Color Wheel');

    step = project.presets[0].steps[0];
    presetService = TestBed.inject(PresetService);
    presetService.selectedPreset = project.presets[0];
    presetService.selectedStep = step;
  });

  afterEach(() => fixture.destroy());

  async function render(wheelChannel = channel) {
    fixture = TestBed.createComponent(FixtureCapabilityColorWheelComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.componentRef.setInput('profile', profile);
    fixture.componentRef.setInput('channel', wheelChannel);
    fixture.componentRef.setInput('wheelIndex', 0);
    await update();
  }

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function swatches(): HTMLElement[] {
    return Array.from(element.querySelectorAll('.color'));
  }

  function selectedSwatches(): number[] {
    return swatches()
      .map((swatch, index) => (swatch.classList.contains('color-selected') ? index : -1))
      .filter((index) => index >= 0);
  }

  function checkbox(): HTMLInputElement {
    return element.querySelector('#capabilityColorWheel0Active');
  }

  function slotNumber(): number {
    return presetService.getCapabilityValue(step, FixtureCapabilityType.WheelSlot, undefined, 'Color Wheel', 'test/moving-head')
      ?.slotNumber;
  }

  function setColor(red: number, green: number, blue: number) {
    presetService.setCapabilityValue(step, FixtureCapabilityType.ColorIntensity, red, undefined, FixtureCapabilityColor.Red);
    presetService.setCapabilityValue(step, FixtureCapabilityType.ColorIntensity, green, undefined, FixtureCapabilityColor.Green);
    presetService.setCapabilityValue(step, FixtureCapabilityType.ColorIntensity, blue, undefined, FixtureCapabilityColor.Blue);
  }

  it('shows the slots of the wheel in their colors', async () => {
    await render();

    expect(component.wheelName).toBe('Color Wheel');
    expect(component.slotCapabilities.map((capability) => component.getCapabilityColorStyle(capability))).toEqual([
      { 'background-color': '#fff' },
      { 'background-color': '#ff0000' },
      { 'background-image': 'linear-gradient(to bottom right, #ff0000, #0000ff)' },
      { 'background-color': '#0000ff' },
    ]);
    expect(swatches().length).toBe(4);
    expect(swatches()[1].style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('is off while the step picks no slot', async () => {
    await render();

    expect(element.querySelector('.card').classList).toContain('capability-deactivated');
    expect(checkbox().checked).toBe(false);
    expect(selectedSwatches()).toEqual([]);
  });

  it('marks the slot closest to the color of the step, while it picks none', async () => {
    setColor(1, 0.1, 0);
    await render();

    expect(selectedSwatches()).toEqual([1]);
    expect(checkbox().checked).toBe(false);
  });

  it('follows the color of the fixtures being changed', async () => {
    await render();

    setColor(0, 0, 1);
    presetService.fixtureColorChanged.next();

    expect(selectedSwatches()).toEqual([3]);
  });

  it('picks the slot clicked', async () => {
    await render();

    swatches()[2].click();
    await update();

    expect(slotNumber()).toBe(2.5);
    expect(selectedSwatches()).toEqual([2]);
    expect(checkbox().checked).toBe(true);
    expect(previewLive).toHaveBeenCalled();

    // the slot picked wins over the color
    setColor(0, 0, 1);
    await update();

    expect(selectedSwatches()).toEqual([2]);
  });

  it('switches on at the first slot, and off again', async () => {
    await render();

    checkbox().click();
    expect(slotNumber()).toBe(1);

    await update();
    checkbox().click();

    expect(slotNumber()).toBeUndefined();
    expect(step.fixtureCapabilityValues).toEqual([]);
    expect(previewLive).toHaveBeenCalled();
  });

  it('names the wheel while several are shown', async () => {
    await render();
    expect(element.querySelector('.card-body').textContent).not.toContain('Moving head - Color Wheel');

    fixture.componentRef.setInput('showContainer', true);
    await update();

    expect(element.querySelector('.card-body').textContent).toContain('Moving head - Color Wheel');
  });

  it('takes the wheel named like its channel, if none of the slots names one', async () => {
    const unnamed = new CachedFixtureChannel();
    unnamed.name = 'Color Wheel';
    unnamed.capabilities = channel.capabilities.map((capability) => ({ ...capability, wheel: undefined }));

    await render(unnamed);

    expect(component.wheelName).toBe('Color Wheel');
    expect(swatches().length).toBe(4);
  });

  it('shows a slot without colors white', async () => {
    await render();

    const capability = new CachedFixtureCapability();
    capability.wheelSlots = undefined;

    expect(component.getCapabilityColorStyle(capability)).toEqual({ 'background-color': '#fff' });
  });

  it('stops redrawing once it is gone', async () => {
    await render();
    fixture.destroy();

    expect(() => presetService.fixtureColorChanged.next()).not.toThrow();
  });
});
