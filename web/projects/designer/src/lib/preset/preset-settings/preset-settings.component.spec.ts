import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';

import { ColorPickerComponent } from '../../color-picker/color-picker.component';
import { IconPickerComponent } from '../../icon-picker/icon-picker.component';
import { Preset } from '../../models/preset';
import { Project } from '../../models/project';
import { PresetService } from '../../services/preset.service';
import { ProjectService } from '../../services/project.service';
import { PresetSettingsComponent } from './preset-settings.component';

// The settings of a preset: its name, how it is marked in the lists, and when and how it
// fades in and out inside a scene. Nothing is changed until the dialog is confirmed.
describe('PresetSettingsComponent', () => {
  let fixture: ComponentFixture<PresetSettingsComponent>;
  let element: HTMLElement;
  let preset: Preset;
  let modalRef: jasmine.SpyObj<BsModalRef>;
  let presetsChanged: jasmine.Spy;

  beforeEach(async () => {
    modalRef = jasmine.createSpyObj('BsModalRef', ['hide']);

    await TestBed.configureTestingModule({
      declarations: [PresetSettingsComponent, IconPickerComponent, ColorPickerComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: BsModalRef, useValue: modalRef },
      ],
    }).compileComponents();

    // a preset which puts red on its fixtures, and is marked with it
    const project = new Project({
      presets: [
        {
          uuid: 'red',
          name: 'Red',
          color: '#00ff00',
          startMillis: 1000,
          fadeInMillis: 200,
          steps: [
            {
              uuid: 'step',
              fixtureCapabilityValues: [
                { type: 'ColorIntensity', color: 'Red', valuePercentage: 1 },
                { type: 'ColorIntensity', color: 'Green', valuePercentage: 0 },
                { type: 'ColorIntensity', color: 'Blue', valuePercentage: 0 },
              ],
            },
          ],
        },
      ],
    });
    TestBed.inject(ProjectService).project = project;
    preset = project.presets[0];

    presetsChanged = jasmine.createSpy('presetsChanged');
    TestBed.inject(PresetService).presetsChanged.subscribe(presetsChanged);

    fixture = TestBed.createComponent(PresetSettingsComponent);
    fixture.componentInstance.preset = preset;
    element = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  // the dialog listens to the enter key on the whole document
  afterEach(() => fixture.destroy());

  function nameInput(): HTMLInputElement {
    return element.querySelector('.modal-body > .form-group input[type="text"]');
  }

  // the start, the end, the fade in and the fade out
  function timeInputs(): HTMLInputElement[] {
    return Array.from(element.querySelectorAll('input.sd-time-field'));
  }

  // the curves of the fade in and the fade out
  function curveSelects(): HTMLSelectElement[] {
    return Array.from(element.querySelectorAll('select.sd-time-field'));
  }

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function select(selectElement: HTMLSelectElement, value: string) {
    selectElement.value = value;
    selectElement.dispatchEvent(new Event('change'));
  }

  function ok() {
    (element.querySelector('button.btn-primary') as HTMLButtonElement).click();
  }

  it('shows the preset as it is', () => {
    expect(element.querySelector('.modal-title').textContent.trim()).toBe('Red');
    expect(nameInput().value).toBe('Red');
    expect(timeInputs().map((input) => input.value)).toEqual(['1000', '', '200', '0']);
    expect(curveSelects().map((curveSelect) => curveSelect.value)).toEqual(['linear', 'linear']);
  });

  it('shows the icons in the color the preset is marked with', () => {
    // the color the preset puts on its fixtures, while it is left to the preset
    expect(fixture.componentInstance.shownColor()).toBe('#ff0000');
    expect((element.querySelector('.icon-picker-item i') as HTMLElement).style.color).toBe('rgb(255, 0, 0)');

    fixture.componentInstance.colorAuto = false;
    expect(fixture.componentInstance.shownColor()).toBe('#00ff00');
  });

  it('renames the preset and marks it with the icon and the color picked', () => {
    type(nameInput(), 'Deep red');

    const icons: HTMLButtonElement[] = Array.from(element.querySelectorAll('.icon-picker-item'));
    icons[1].click();

    const swatch: HTMLButtonElement = element.querySelector('.color-picker-swatch');
    swatch.click();

    ok();

    expect(preset.name).toBe('Deep red');
    expect(preset.icon).toBe('fa-sun-o');
    expect(preset.color).toBe(swatch.getAttribute('aria-label'));
    expect(preset.colorAuto).toBe(false);

    // the lists show the icon and the color
    expect(presetsChanged).toHaveBeenCalled();
    expect(modalRef.hide).toHaveBeenCalled();
  });

  it('plays the preset over the times typed in, or over the whole scene while they are empty', () => {
    type(timeInputs()[0], '500');
    type(timeInputs()[1], '4000');
    ok();

    expect(preset.startMillis).toBe(500);
    expect(preset.endMillis).toBe(4000);

    type(timeInputs()[0], '');
    type(timeInputs()[1], '');
    ok();

    expect(preset.startMillis).toBeUndefined();
    expect(preset.endMillis).toBeUndefined();
  });

  it('keeps the times for anything which is no time', () => {
    preset.endMillis = 4000;

    for (const typed of ['abc', '-1']) {
      timeInputs().forEach((input) => type(input, typed));
      ok();

      expect(preset.startMillis).toBe(1000);
      expect(preset.endMillis).toBe(4000);
      expect(preset.fadeInMillis).toBe(200);
      expect(preset.fadeOutMillis).toBe(0);
    }
  });

  it('fades the preset in and out over the times and the curves picked', () => {
    type(timeInputs()[2], '300');
    type(timeInputs()[3], '700');
    select(curveSelects()[0], 'ease-in');
    select(curveSelects()[1], 'snap');
    (element.querySelector('#fadeInPre') as HTMLInputElement).click();
    (element.querySelector('#fadeOutPost') as HTMLInputElement).click();

    ok();

    expect(preset.fadeInMillis).toBe(300);
    expect(preset.fadeOutMillis).toBe(700);
    expect(preset.fadeInCurve).toBe('ease-in');
    expect(preset.fadeOutCurve).toBe('snap');
    expect(preset.fadeInPre).toBe(true);
    expect(preset.fadeOutPost).toBe(true);
  });

  it('confirms with the enter key', () => {
    type(nameInput(), 'Dark red');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(preset.name).toBe('Dark red');
    expect(modalRef.hide).toHaveBeenCalled();
  });

  it('changes nothing when it is cancelled', () => {
    type(nameInput(), 'Deep red');
    type(timeInputs()[2], '300');

    (element.querySelector('.modal-footer a') as HTMLElement).click();

    expect(preset.name).toBe('Red');
    expect(preset.fadeInMillis).toBe(200);
    expect(presetsChanged).not.toHaveBeenCalled();
    expect(modalRef.hide).toHaveBeenCalled();
  });
});
