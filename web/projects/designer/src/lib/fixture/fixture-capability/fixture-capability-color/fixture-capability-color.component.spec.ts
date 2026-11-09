import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { FixtureCapabilityColor, FixtureCapabilityType } from '../../../models/fixture-capability';
import { Preset } from '../../../models/preset';
import { PresetStep } from '../../../models/preset-step';
import { Project } from '../../../models/project';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { ProjectService } from '../../../services/project.service';
import { FixtureCapabilityColorComponent } from './fixture-capability-color.component';
import { GradientEditorComponent } from '../../../gradient-editor/gradient-editor.component';
import { ColorPickerComponent } from '../../../color-picker/color-picker.component';

// The color of the step being edited, picked on a color wheel. It sets the red, the green and
// the blue of the fixtures; switched off, the step leaves their color alone.
describe('FixtureCapabilityColorComponent', () => {
  let fixture: ComponentFixture<FixtureCapabilityColorComponent>;
  let component: FixtureCapabilityColorComponent;
  let element: HTMLElement;
  let presetService: PresetService;
  let preset: Preset;
  let previewLive: jasmine.Spy;
  let fixtureColorChanged: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FixtureCapabilityColorComponent, GradientEditorComponent, ColorPickerComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    }).compileComponents();

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    // the second step is orange
    const project = new Project({
      presets: [
        {
          uuid: 'look',
          steps: [
            { uuid: 'first' },
            {
              uuid: 'second',
              startMillis: 1000,
              fixtureCapabilityValues: [
                { type: 'ColorIntensity', color: 'Red', valuePercentage: 1 },
                { type: 'ColorIntensity', color: 'Green', valuePercentage: 0.2 },
                { type: 'ColorIntensity', color: 'Blue', valuePercentage: 0 },
              ],
            },
          ],
        },
      ],
    });
    TestBed.inject(ProjectService).project = project;
    preset = project.presets[0];

    presetService = TestBed.inject(PresetService);
    presetService.selectedPreset = preset;
    presetService.selectedStep = preset.steps[0];

    fixtureColorChanged = jasmine.createSpy('fixtureColorChanged');
    presetService.fixtureColorChanged.subscribe(fixtureColorChanged);
  });

  afterEach(() => fixture.destroy());

  async function render() {
    fixture = TestBed.createComponent(FixtureCapabilityColorComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    await update();
  }

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function checkbox(): HTMLInputElement {
    return element.querySelector('#capabilityColorActive');
  }

  function hexInput(): HTMLInputElement {
    return element.querySelector('input.sd-value-input-hex');
  }

  // the red, the green and the blue the step puts on the fixtures
  function rgb(step: PresetStep): number[] {
    return [FixtureCapabilityColor.Red, FixtureCapabilityColor.Green, FixtureCapabilityColor.Blue].map(
      (color) => presetService.getCapabilityValue(step, FixtureCapabilityType.ColorIntensity, color)?.valuePercentage
    );
  }

  // what a drag on the wheel does: the wheel is touched, then its color changes
  function turnWheel(hex: string) {
    component.colorPicker.emit('input:start', component.colorPicker.color);
    component.colorPicker.color.hexString = hex;
  }

  it('is off and white while the step leaves the color alone', async () => {
    await render();

    expect(element.querySelector('.card').classList).toContain('capability-deactivated');
    expect(checkbox().checked).toBe(false);
    expect(hexInput().value).toBe('#ffffff');
    expect(element.querySelector('#color-picker-container svg')).not.toBeNull();
  });

  it('shows the color of the step', async () => {
    presetService.selectedStep = preset.steps[1];
    await render();

    expect(checkbox().checked).toBe(true);
    expect(hexInput().value).toBe('#ff3300');
    expect(component.colorPicker.color.hexString).toBe('#ff3300');
  });

  it('colors the fixtures with the color the wheel is turned to', async () => {
    await render();

    turnWheel('#00ff00');
    await update();

    expect(rgb(preset.steps[0])).toEqual([0, 1, 0]);
    expect(checkbox().checked).toBe(true);
    expect(hexInput().value).toBe('#00ff00');
    expect(fixtureColorChanged).toHaveBeenCalled();
    expect(previewLive).toHaveBeenCalled();
  });

  it('colors the fixtures with a color typed in, once it is one', async () => {
    await render();
    const input = hexInput();

    for (const typed of ['#f', '#f0', 'red']) {
      input.value = typed;
      input.dispatchEvent(new Event('input'));
    }
    expect(rgb(preset.steps[0])).toEqual([undefined, undefined, undefined]);
    expect(checkbox().checked).toBe(false);

    input.value = '#f00';
    input.dispatchEvent(new Event('input'));
    await update();

    expect(rgb(preset.steps[0])).toEqual([1, 0, 0]);
    expect(checkbox().checked).toBe(true);
    expect(component.colorPicker.color.hexString).toBe('#ff0000');
  });

  it('leaves the fixtures alone while the wheel is only set, not turned', async () => {
    await render();

    component.colorPicker.color.hexString = '#00ff00';

    expect(rgb(preset.steps[0])).toEqual([undefined, undefined, undefined]);
  });

  it('switches on with the color of the wheel, and off again', async () => {
    await render();

    checkbox().click();
    expect(rgb(preset.steps[0])).toEqual([1, 1, 1]);

    turnWheel('#0000ff');
    await update();
    checkbox().click();
    await update();

    // off, the step keeps the color, shown greyed out, but doesn't play it
    expect(rgb(preset.steps[0])).toEqual([0, 0, 1]);
    expect(preset.steps[0].fixtureCapabilityValues.every((value) => value.deactivated)).toBe(true);
    expect(checkbox().checked).toBe(false);
    expect(hexInput().value).toBe('#0000ff');

    // and on again as it was
    checkbox().click();
    await update();

    expect(rgb(preset.steps[0])).toEqual([0, 0, 1]);
    expect(preset.steps[0].fixtureCapabilityValues.some((value) => value.deactivated)).toBe(false);
    expect(checkbox().checked).toBe(true);
  });

  it('shows a color switched off, ready to switch on again', async () => {
    for (const value of preset.steps[1].fixtureCapabilityValues) {
      value.deactivated = true;
    }
    await render();

    presetService.selectStep(preset.steps[1]);
    await update();

    expect(checkbox().checked).toBe(false);
    expect(hexInput().value).toBe('#ff3300');
  });

  it('follows the preset being picked', async () => {
    await render();

    presetService.selectedStep = preset.steps[1];
    presetService.previewSelectionChanged.next();
    await fixture.whenStable();

    expect(hexInput().value).toBe('#ff3300');
    expect(component.colorPicker.color.hexString).toBe('#ff3300');
  });

  it('follows the step being picked', async () => {
    await render();

    presetService.selectStep(preset.steps[1]);
    await update();

    expect(checkbox().checked).toBe(true);
    expect(hexInput().value).toBe('#ff3300');
    expect(component.colorPicker.color.hexString).toBe('#ff3300');

    presetService.selectStep(preset.steps[0]);
    await update();

    expect(checkbox().checked).toBe(false);
    expect(hexInput().value).toBe('#ffffff');
  });

  it('colors nothing while no step is being edited', async () => {
    presetService.selectedStep = undefined;
    await render();

    turnWheel('#00ff00');

    expect(fixtureColorChanged).not.toHaveBeenCalled();
    expect(rgb(preset.steps[0])).toEqual([undefined, undefined, undefined]);
  });

  it('stops following the preset once it is gone', async () => {
    await render();
    fixture.destroy();

    presetService.selectedStep = preset.steps[1];
    presetService.previewSelectionChanged.next();
    presetService.stepsChanged.next();

    expect(component.color).toBe('#ffffff');
  });

  it('spans a gradient of colors over the fixtures, from the color of the step, and takes it away again', async () => {
    presetService.selectedStep = preset.steps[1];
    await render();

    (element.querySelector('button[name="gradient"]') as HTMLButtonElement).click();
    await update();

    // red, green and blue each fanned out with a stop at each place of the gradient: from orange to blue
    const step = preset.steps[1];
    const fan = (color: FixtureCapabilityColor) =>
      presetService
        .getCapabilityFan(step, FixtureCapabilityType.ColorIntensity, color)
        .map((stop) => [stop.position, stop.valuePercentage]);
    expect(fan(FixtureCapabilityColor.Red)).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(fan(FixtureCapabilityColor.Green)).toEqual([
      [0, 0.2],
      [1, 0],
    ]);
    expect(fan(FixtureCapabilityColor.Blue)).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(component.gradient).toBe(true);
    expect(component.gradientStops).toEqual([
      { position: 0, color: '#ff3300' },
      { position: 1, color: '#0000ff' },
    ]);
    expect(element.querySelector('lib-app-gradient-editor')).not.toBeNull();
    expect((element.querySelector('#color-picker-container') as HTMLElement).hidden).toBe(true);
    expect(fixtureColorChanged).toHaveBeenCalled();

    // a stop added in the middle of the gradient editor
    component.setGradient([
      { position: 0, color: '#ff0000' },
      { position: 0.5, color: '#00ff00' },
      { position: 1, color: '#0000ff' },
    ]);
    await update();
    expect(fan(FixtureCapabilityColor.Green)).toEqual([
      [0, 0],
      [0.5, 1],
      [1, 0],
    ]);

    // in steps: each fixture in one of the colors
    (element.querySelector('button[name="gradient-steps"]') as HTMLButtonElement).click();
    await update();
    expect(component.getGradientBetween()).toBe('steps');
    expect(presetService.getCapabilityValue(step, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Blue).fanBetween).toBe(
      'steps'
    );
    component.setGradientBetween('smooth');
    expect(component.getGradientBetween()).toBe('smooth');

    // the gradient is read back from the step
    await render();
    expect(component.gradient).toBe(true);
    expect(component.gradientStops.map((stop) => stop.color)).toEqual(['#ff0000', '#00ff00', '#0000ff']);

    // taken away: all the fixtures in the color of the one in the middle
    (element.querySelector('button[name="gradient"]') as HTMLButtonElement).click();
    await update();
    expect(component.gradient).toBe(false);
    expect(rgb(step)).toEqual([0, 1, 0]);
    expect(presetService.getCapabilityFan(step, FixtureCapabilityType.ColorIntensity, FixtureCapabilityColor.Red)).toBeUndefined();
  });

  it('lights the white LEDs with the white part of the colors, for the whole preset', async () => {
    await render();

    // a preset without a fixture with white LEDs doesn't offer it
    expect(element.querySelector('input[name="emittersFromColor"]')).toBeNull();

    spyOn(presetService, 'hasCapabilityType').and.returnValue(true);
    await update();
    const white = element.querySelector('input[name="emittersFromColor"]') as HTMLInputElement;
    expect(white.checked).toBe(false);

    white.click();
    await update();
    expect(preset.emittersFromColor).toBe(true);
    expect(component.getEmittersFromColor()).toBe(true);
  });
});
