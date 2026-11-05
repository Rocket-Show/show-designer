import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';

import { ColorPickerComponent } from '../../color-picker/color-picker.component';
import { IconPickerComponent } from '../../icon-picker/icon-picker.component';
import { Project } from '../../models/project';
import { Scene } from '../../models/scene';
import { ColorService } from '../../services/color.service';
import { LivePreviewService } from '../../services/live-preview.service';
import { ProjectService } from '../../services/project.service';
import { SceneService } from '../../services/scene.service';
import { SceneSettingsComponent } from './scene-settings.component';

// The settings of a scene: its name, how it is marked, how much of it reaches the stage
// and how it fades in and out. The dialog edits a copy and hands it over on OK.
describe('SceneSettingsComponent', () => {
  let fixture: ComponentFixture<SceneSettingsComponent>;
  let element: HTMLElement;
  let scene: Scene;
  let hide: jasmine.Spy;
  let previewLive: jasmine.Spy;
  let scenesChanged: jasmine.Spy;

  beforeEach(async () => {
    hide = jasmine.createSpy('hide');

    await TestBed.configureTestingModule({
      declarations: [SceneSettingsComponent, IconPickerComponent, ColorPickerComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [{ provide: BsModalRef, useValue: { hide } }, provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    const project = new Project({
      presets: [{ uuid: 'red', color: '#ff0000', colorAuto: false }],
      scenes: [
        {
          uuid: 'verse',
          name: 'Verse',
          color: '#00ff00',
          colorAuto: false,
          dimmer: 0.12345,
          presetUuids: ['red'],
          fadeInMillis: 500,
          fadeOutMillis: 1500,
          fadeInCurve: 'ease-in',
          fadeOutCurve: 'snap',
          fadeOutPost: true,
        },
      ],
    });
    TestBed.inject(ProjectService).project = project;
    scene = project.scenes[0];

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');
    scenesChanged = jasmine.createSpy('scenesChanged');
    TestBed.inject(SceneService).scenesChanged.subscribe(scenesChanged);

    fixture = TestBed.createComponent(SceneSettingsComponent);
    fixture.componentInstance.scene = scene;
    element = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const component = () => fixture.componentInstance;
  const nameInput = (): HTMLInputElement => element.querySelector('.modal-body input.form-control');
  const timeFields = (): HTMLInputElement[] => Array.from(element.querySelectorAll('input.sd-time-field'));
  const curveSelects = (): HTMLSelectElement[] => Array.from(element.querySelectorAll('select.sd-time-field'));
  const dimmerInput = (): HTMLInputElement => element.querySelector('input.slider-input');
  const iconButtons = (): HTMLButtonElement[] => Array.from(element.querySelectorAll('.icon-picker-item'));

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function choose(select: HTMLSelectElement, value: string) {
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function button(text: string): HTMLElement {
    return Array.from(element.querySelectorAll<HTMLElement>('.modal-footer a, .modal-footer button')).find(
      (candidate) => candidate.textContent.trim() === text
    );
  }

  it('shows the settings of the scene', () => {
    expect(element.querySelector('.modal-title').textContent).toBe('Verse');
    expect(nameInput().value).toBe('Verse');
    expect(timeFields().map((input) => input.value)).toEqual(['500', '1500']);
    expect(curveSelects().map((select) => select.value)).toEqual(['ease-in', 'snap']);
    expect(element.querySelector<HTMLInputElement>('#fadeInPre').checked).toBe(false);
    expect(element.querySelector<HTMLInputElement>('#fadeOutPost').checked).toBe(true);
  });

  it('offers every curve for the fades', () => {
    expect(Array.from(curveSelects()[0].options).map((option) => option.value)).toEqual([
      'linear',
      'ease-in',
      'ease-out',
      'ease-in-out',
      'snap',
    ]);
  });

  it('shows the dimmer in percent', () => {
    expect(dimmerInput().value).toBe('12.35');
  });

  it('leaves the scene alone until OK is pressed', () => {
    type(nameInput(), 'Chorus');
    type(timeFields()[0], '800');

    expect(scene.name).toBe('Verse');
    expect(scene.fadeInMillis).toBe(500);
    expect(scenesChanged).not.toHaveBeenCalled();
  });

  it('puts the settings into the scene on OK and shows them everywhere', () => {
    type(nameInput(), 'Chorus');
    type(timeFields()[0], '800');
    type(timeFields()[1], '0');
    choose(curveSelects()[0], 'ease-out');
    choose(curveSelects()[1], 'linear');
    element.querySelector<HTMLInputElement>('#fadeInPre').click();
    element.querySelector<HTMLInputElement>('#fadeOutPost').click();
    type(dimmerInput(), '50');

    button('designer.misc.ok').click();

    expect(scene.name).toBe('Chorus');
    expect(scene.fadeInMillis).toBe(800);
    expect(scene.fadeOutMillis).toBe(0);
    expect(scene.fadeInCurve).toBe('ease-out');
    expect(scene.fadeOutCurve).toBe('linear');
    expect(scene.fadeInPre).toBe(true);
    expect(scene.fadeOutPost).toBe(false);
    expect(scene.dimmer).toBe(0.5);
    expect(scenesChanged).toHaveBeenCalled();
    expect(previewLive).toHaveBeenCalled();
    expect(hide).toHaveBeenCalled();
  });

  it('keeps the fades for anything which is no time', () => {
    type(timeFields()[0], 'long');
    type(timeFields()[1], '-100');

    button('designer.misc.ok').click();

    expect(scene.fadeInMillis).toBe(500);
    expect(scene.fadeOutMillis).toBe(1500);
  });

  it('keeps the dimmer for anything which is no percentage', () => {
    for (const typed of ['abc', '101', '-1']) {
      type(dimmerInput(), typed);
    }

    expect(component().dimmer).toBe(0.12345);
  });

  it('dims the scene with the slider', async () => {
    fixture.debugElement.query(By.css('mv-slider')).triggerEventHandler('change', { oldValue: 0.12345, newValue: 0.25 });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(dimmerInput().value).toBe('25');

    button('designer.misc.ok').click();
    expect(scene.dimmer).toBe(0.25);
  });

  it('marks the scene with an icon picked, or the default one again', () => {
    iconButtons()[1].click();
    button('designer.misc.ok').click();
    expect(scene.icon).toBe(component().icon);
    expect(scene.icon).toBeTruthy();

    iconButtons()[0].click();
    button('designer.misc.ok').click();
    expect(scene.icon).toBeUndefined();
  });

  it('shows the icons in the color the scene is marked with', () => {
    const iconColor = () => iconButtons()[0].querySelector<HTMLElement>('i').style.color;

    expect(iconColor()).toBe('rgb(0, 255, 0)');
    expect(component().derivedColor).toBe(TestBed.inject(ColorService).getDerivedSceneColor(scene));

    // left to its presets, the scene is marked with their color
    component().colorAuto = true;
    fixture.detectChanges();
    expect(component().shownColor()).toBe(component().derivedColor);
  });

  it('takes a color picked from the palette as its own one', () => {
    scene.colorAuto = true;
    fixture = TestBed.createComponent(SceneSettingsComponent);
    fixture.componentInstance.scene = scene;
    element = fixture.nativeElement;
    fixture.detectChanges();

    const swatch = element.querySelector<HTMLElement>('.color-picker-swatch[aria-label="#ff7f00"]');
    swatch.click();
    button('designer.misc.ok').click();

    expect(scene.color).toBe('#ff7f00');
    expect(scene.colorAuto).toBe(false);
  });

  it('takes the settings with the enter key', () => {
    type(nameInput(), 'Bridge');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(scene.name).toBe('Bridge');
    expect(hide).toHaveBeenCalled();
  });

  it('closes without a change, when it is cancelled', () => {
    type(nameInput(), 'Bridge');

    button('designer.misc.cancel').click();

    expect(scene.name).toBe('Verse');
    expect(scenesChanged).not.toHaveBeenCalled();
    expect(previewLive).not.toHaveBeenCalled();
    expect(hide).toHaveBeenCalled();
  });

  it('closes with the cross in the corner', () => {
    element.querySelector<HTMLElement>('button.close').click();

    expect(scene.name).toBe('Verse');
    expect(hide).toHaveBeenCalled();
  });
});
