import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';
import { ToastrModule } from 'ngx-toastr';

import { FixtureCapabilityColor, FixtureCapabilityType } from '../../../models/fixture-capability';
import { PresetStep } from '../../../models/preset-step';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { FixtureCapabilityPositionComponent } from './fixture-capability-position.component';

// A capability of the step being edited which plays the same on every model of fixture: a position between the ends
// of what a fixture does (e.g. the zoom from narrow to wide), the prism in or out and an emitter (e.g. white). Switched
// off, the step leaves it alone.
describe('FixtureCapabilityPositionComponent', () => {
  let fixture: ComponentFixture<FixtureCapabilityPositionComponent>;
  let component: FixtureCapabilityPositionComponent;
  let element: HTMLElement;
  let presetService: PresetService;
  let step: PresetStep;
  let previewLive: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FixtureCapabilityPositionComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    }).compileComponents();

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    step = new PresetStep({ uuid: 'step' });
    presetService = TestBed.inject(PresetService);
    presetService.selectedStep = step;
  });

  afterEach(() => fixture.destroy());

  async function render(type: FixtureCapabilityType, color?: FixtureCapabilityColor, blade?: string) {
    fixture = TestBed.createComponent(FixtureCapabilityPositionComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.componentRef.setInput('type', type);
    fixture.componentRef.setInput('color', color);
    fixture.componentRef.setInput('blade', blade);
    await update();
  }

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function checkbox(): HTMLInputElement {
    return element.querySelector('input[type=checkbox]');
  }

  function input(): HTMLInputElement {
    return element.querySelector('input.sd-value-input');
  }

  function type(value: string) {
    input().value = value;
    input().dispatchEvent(new Event('input'));
  }

  function valueOf(capabilityType: FixtureCapabilityType, color?: FixtureCapabilityColor): number {
    return presetService.getCapabilityValue(step, capabilityType, color)?.valuePercentage;
  }

  function ends(): string[] {
    return Array.from(element.querySelectorAll('.position-end')).map((end) => end.textContent.trim());
  }

  it('is off while the step leaves the capability alone', async () => {
    await render(FixtureCapabilityType.Zoom);

    expect(element.querySelector('.card').classList).toContain('capability-deactivated');
    expect(checkbox().checked).toBe(false);
    expect(input().value).toBe('0');
    expect(component.getValue()).toBeUndefined();
  });

  it('is named after its capability, its ends after what they do', async () => {
    await render(FixtureCapabilityType.Zoom);

    expect(element.querySelector('label').textContent.trim()).toBe('designer.fixtureCapabilityType.Zoom');
    // the high end on top of the slider
    expect(ends()).toEqual(['designer.fixture.capability-position-high.Zoom', 'designer.fixture.capability-position-low.Zoom']);
  });

  it('starts at its low end when switched on, and leaves the capability alone when switched off', async () => {
    await render(FixtureCapabilityType.Iris);

    component.changeActive(true);
    await update();
    expect(valueOf(FixtureCapabilityType.Iris)).toBe(0);
    expect(checkbox().checked).toBe(true);

    component.changeActive(false);
    await update();
    expect(presetService.getCapabilityValue(step, FixtureCapabilityType.Iris)).toBeUndefined();
    expect(previewLive).toHaveBeenCalledTimes(2);
  });

  it('takes a position typed in percent', async () => {
    await render(FixtureCapabilityType.Frost);

    type('25');
    await update();

    expect(valueOf(FixtureCapabilityType.Frost)).toBe(0.25);
    expect(input().value).toBe('25');
  });

  it('keeps a position outside of the range or no number away', async () => {
    await render(FixtureCapabilityType.Focus);
    component.setValue(0.5);

    component.setValue(1.5);
    component.setValue(-0.1);
    component.setValue('a');

    expect(valueOf(FixtureCapabilityType.Focus)).toBe(0.5);
  });

  it('sets the speed of the strobe along with it, for a fixture with a channel of its own for it', async () => {
    await render(FixtureCapabilityType.ShutterStrobe);

    component.setValue(0.7);
    expect(valueOf(FixtureCapabilityType.ShutterStrobe)).toBe(0.7);
    expect(valueOf(FixtureCapabilityType.StrobeSpeed)).toBe(0.7);

    component.changeActive(false);
    expect(step.fixtureCapabilityValues).toEqual([]);
  });

  it('puts the prism in and takes it out', async () => {
    await render(FixtureCapabilityType.Prism);
    const [inButton, outButton] = Array.from(element.querySelectorAll('button')) as HTMLButtonElement[];

    expect(input()).toBeNull();

    component.changeActive(true);
    await update();
    expect(valueOf(FixtureCapabilityType.Prism)).toBe(1);
    expect(inButton.classList).toContain('active');

    outButton.click();
    await update();
    expect(valueOf(FixtureCapabilityType.Prism)).toBe(0);
    expect(outButton.classList).toContain('active');
    expect(inButton.classList).not.toContain('active');
  });

  it('sets an emitter at full when switched on, without touching the other colors', async () => {
    presetService.setCapabilityValue(step, FixtureCapabilityType.ColorIntensity, 0.5, undefined, FixtureCapabilityColor.Red);
    await render(FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Amber);

    expect(element.querySelector('label').textContent.trim()).toBe('designer.fixtureCapabilityColor.Amber');
    expect((element.querySelector('.emitter-swatch') as HTMLElement).style.backgroundColor).toBe('rgb(255, 191, 0)');
    expect(component.getValue()).toBeUndefined();

    component.changeActive(true);
    expect(valueOf(FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Amber)).toBe(1);

    component.changeActive(false);
    expect(valueOf(FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Amber)).toBeUndefined();
    expect(valueOf(FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Red)).toBe(0.5);
  });

  it('gives each card a checkbox of its own', async () => {
    await render(FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor['Warm White']);

    expect(checkbox().id).toBe('capabilityPositionColorIntensityWarmWhite');
    expect(element.querySelector('label').getAttribute('for')).toBe('capabilityPositionColorIntensityWarmWhite');
  });

  it('sets nothing without a step being edited', async () => {
    await render(FixtureCapabilityType.Zoom);
    presetService.selectedStep = undefined;

    component.setValue(0.5);

    expect(step.fixtureCapabilityValues).toEqual([]);
  });

  it('starts a rotation and a turned blade standing still, a pulse pulsing and a blade out', async () => {
    for (const [capabilityType, start] of [
      [FixtureCapabilityType.WheelSlotRotation, 0.5],
      [FixtureCapabilityType.PrismRotation, 0.5],
      [FixtureCapabilityType.BladeSystemRotation, 0.5],
      [FixtureCapabilityType.IrisEffect, 0.5],
      [FixtureCapabilityType.FrostEffect, 0.5],
      [FixtureCapabilityType.Zoom, 0],
    ] as [FixtureCapabilityType, number][]) {
      await render(capabilityType);
      component.changeActive(true);

      expect(valueOf(capabilityType)).toBe(start, capabilityType);
      fixture.destroy();
    }
  });

  it('sets each blade of a framing shutter on its own', async () => {
    await render(FixtureCapabilityType.BladeInsertion, undefined, 'Top');
    expect(component.labelKey).toBe('designer.fixture.capability-blade.BladeInsertion.Top');
    expect(checkbox().id).toBe('capabilityPositionBladeInsertionTop');

    component.changeActive(true);
    component.setValue(0.75);
    fixture.destroy();

    await render(FixtureCapabilityType.BladeInsertion, undefined, 'Left');
    component.changeActive(true);

    const blades = step.fixtureCapabilityValues.map((value) => [value.type, value.blade, value.valuePercentage]);
    expect(blades).toEqual([
      ['BladeInsertion', 'Top', 0.75],
      ['BladeInsertion', 'Left', 0],
    ]);
    expect(component.getValue()).toBe(0);

    component.changeActive(false);
    expect(step.fixtureCapabilityValues.map((value) => value.blade)).toEqual(['Top']);
  });
});
