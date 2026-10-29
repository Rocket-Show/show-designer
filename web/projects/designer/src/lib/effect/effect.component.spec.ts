import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AccordionModule } from 'ngx-bootstrap/accordion';
import { BsModalService } from 'ngx-bootstrap/modal';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { ToastrModule } from 'ngx-toastr';
import { of } from 'rxjs';

import { Effect } from '../models/effect';
import { EffectCurve } from '../models/effect-curve';
import { EffectPanTilt } from '../models/effect-pan-tilt';
import { Preset } from '../models/preset';
import { Project } from '../models/project';
import { EffectService } from '../services/effect.service';
import { LivePreviewService } from '../services/live-preview.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { WarningDialogService } from '../services/warning-dialog.service';
import { EffectComponent } from './effect.component';

// The effects of the preset being edited, one of them opened to be edited at a time: they
// are added, hidden, copied and deleted here. The curve editor is not rendered.
describe('EffectComponent', () => {
  let fixture: ComponentFixture<EffectComponent>;
  let element: HTMLElement;
  let preset: Preset;
  let presetService: PresetService;
  let effectService: EffectService;
  let previewLive: jasmine.Spy;
  let effectsChanged: jasmine.Spy;
  let warning: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [EffectComponent],
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot(), AccordionModule.forRoot(), PopoverModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        // the warning is answered by the spec
        { provide: BsModalService, useValue: {} },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');
    warning = spyOn(TestBed.inject(WarningDialogService), 'show');

    const project = new Project({
      presets: [
        {
          uuid: 'wave',
          steps: [{ uuid: 'step', effectAmounts: [{ effectUuid: 'dimmer', amount: 0.5 }] }],
          effects: [
            { type: 'curve', uuid: 'dimmer' },
            { type: 'curve', uuid: 'color', curveType: 'square' },
          ],
        },
      ],
    });
    TestBed.inject(ProjectService).project = project;
    preset = project.presets[0];

    presetService = TestBed.inject(PresetService);
    presetService.selectedPreset = preset;

    effectService = TestBed.inject(EffectService);
    effectsChanged = jasmine.createSpy('effectsChanged');
    effectService.effectsChanged.subscribe(effectsChanged);

    fixture = TestBed.createComponent(EffectComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function headings(): HTMLElement[] {
    return Array.from(element.querySelectorAll('.panel-heading'));
  }

  // the eye, the copy and the trash of an effect
  function headingIcon(index: number, icon: string): HTMLElement {
    return headings()[index].querySelector('.' + icon);
  }

  function effectUuids(): string[] {
    return preset.effects.map((effect: Effect) => effect.uuid);
  }

  it('shows nothing while no preset is being edited', async () => {
    presetService.selectedPreset = undefined;
    await update();

    expect(element.querySelector('accordion')).toBeNull();
  });

  it('lists the effects of the preset being edited', () => {
    expect(headings().length).toBe(2);
    expect(headings()[0].textContent).toContain('designer.effect.type-curve');
    expect(headings()[0].querySelector('.fa-area-chart')).not.toBeNull();
    expect(headings()[0].querySelector('.fa-caret-right')).not.toBeNull();
  });

  it('opens an effect clicked to edit it, one at a time', async () => {
    headings()[0].click();
    await update();

    expect(effectService.selectedEffect).toBe(preset.effects[0]);
    expect(headings()[0].querySelector('.fa-caret-down')).not.toBeNull();

    headings()[1].click();
    await update();

    expect(effectService.selectedEffect).toBe(preset.effects[1]);
    expect(headings()[0].querySelector('.fa-caret-right')).not.toBeNull();

    headings()[1].click();
    await update();

    expect(effectService.selectedEffect).toBeUndefined();
  });

  it('keeps the effect opened, when another one is closed', () => {
    const component = fixture.componentInstance;
    effectService.selectedEffect = preset.effects[0];

    component.openEffect(preset.effects[1], false);

    expect(effectService.selectedEffect).toBe(preset.effects[0]);
  });

  it('adds a curve and opens it', async () => {
    (element.querySelector('.dropdown-item') as HTMLElement).click();
    await update();

    expect(preset.effects.length).toBe(3);

    const added = preset.effects[2];

    expect(added instanceof EffectCurve).toBe(true);
    expect(added.uuid).toBeTruthy();
    expect(effectService.selectedEffect).toBe(added);
    expect(effectsChanged).toHaveBeenCalled();
    expect(previewLive).toHaveBeenCalled();
    expect(headings().length).toBe(3);
  });

  it('adds a pan/tilt effect', () => {
    fixture.componentInstance.addPanTiltEffect();

    expect(preset.effects[2] instanceof EffectPanTilt).toBe(true);
    expect(effectService.selectedEffect).toBe(preset.effects[2]);
  });

  it('opens a new effect, even without a preset to add it to', () => {
    presetService.selectedPreset = undefined;

    fixture.componentInstance.addCurveEffect();

    expect(effectService.selectedEffect instanceof EffectCurve).toBe(true);
    expect(preset.effects.length).toBe(2);
  });

  it('hides an effect and shows it again, without opening it', async () => {
    headingIcon(0, 'fa-eye').click();
    await update();

    expect(preset.effects[0].visible).toBe(false);
    expect(headingIcon(0, 'fa-eye').classList).not.toContain('text-primary');
    expect(effectService.selectedEffect).toBeUndefined();
    expect(effectsChanged).toHaveBeenCalled();
    expect(previewLive).toHaveBeenCalled();

    headingIcon(0, 'fa-eye').click();
    await update();

    expect(preset.effects[0].visible).toBe(true);
    expect(headingIcon(0, 'fa-eye').classList).toContain('text-primary');
  });

  it('copies an effect right below it, and opens the copy', async () => {
    headingIcon(0, 'fa-clone').click();
    await update();

    expect(preset.effects.length).toBe(3);
    expect(effectUuids()[0]).toBe('dimmer');
    expect(effectUuids()[2]).toBe('color');

    const copy = preset.effects[1] as EffectCurve;

    expect(copy.uuid).not.toBe('dimmer');
    expect(effectService.selectedEffect).toBe(copy);

    // the step lets the copy through as far as the original
    expect(preset.steps[0].getEffectAmount(copy.uuid)).toBe(0.5);
    expect(previewLive).toHaveBeenCalled();
  });

  it('copies nothing while no preset is being edited', () => {
    const effect = preset.effects[0];
    presetService.selectedPreset = undefined;

    fixture.componentInstance.duplicateEffect(effect);

    expect(preset.effects.length).toBe(2);
    expect(previewLive).not.toHaveBeenCalled();
  });

  it('deletes an effect once the warning is confirmed', async () => {
    warning.and.returnValue(of(true));

    headingIcon(0, 'fa-trash').click();
    await update();

    expect(warning).toHaveBeenCalledWith('designer.effect.delete-warning');
    expect(effectUuids()).toEqual(['color']);
    expect(effectsChanged).toHaveBeenCalled();
    expect(previewLive).toHaveBeenCalled();
    expect(headings().length).toBe(1);
  });

  it('keeps an effect when the warning is cancelled', () => {
    warning.and.returnValue(of(false));

    headingIcon(1, 'fa-trash').click();

    expect(effectUuids()).toEqual(['dimmer', 'color']);
    expect(effectsChanged).not.toHaveBeenCalled();
  });
});
