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
import { EffectPixel } from '../models/effect-pixel';
import { Preset } from '../models/preset';
import { PresetStep } from '../models/preset-step';
import { Project } from '../models/project';
import { EffectService } from '../services/effect.service';
import { LivePreviewService } from '../services/live-preview.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { WarningDialogService } from '../services/warning-dialog.service';
import { EffectComponent } from './effect.component';

// The effects of the preset being edited, one of them opened to be edited at a time: they
// are added, hidden, copied and deleted here, and once the preset runs through more than one
// step, switched on and off for the step being edited. The curve editor is not rendered.
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

  it('adds a movement of the moving heads, moving them all together', () => {
    fixture.componentInstance.addPanTiltEffect();

    const movement = preset.effects[2] as EffectPanTilt;
    expect(movement instanceof EffectPanTilt).toBe(true);
    expect(movement.uuid).toBeTruthy();
    expect(movement.phasingMode).toBe('spread');
    expect(movement.phasingCycles).toBe(0);
    expect(effectService.selectedEffect).toBe(movement);
  });

  it('adds a pixel effect in the colors of the rainbow, so it shows on a preset without a color', () => {
    fixture.componentInstance.addPixelEffect();

    const pixels = preset.effects[2] as EffectPixel;
    expect(pixels instanceof EffectPixel).toBe(true);
    expect(pixels.uuid).toBeTruthy();
    expect(pixels.palette.ref).toBe('rainbow');
    expect(pixels.palette.repeat).toBe('wrap');
    expect(pixels.palette.stops.length).toBe(7);
    expect(effectService.selectedEffect).toBe(pixels);
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
    // the step says nothing about it anymore
    expect(preset.steps[0].effectAmounts).toEqual([]);
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

  describe('following the step being edited', () => {
    // a second step, which lets all the effects through, being edited
    async function editSecondStep() {
      preset.steps.push(new PresetStep({ uuid: 'second', startMillis: 1000 }));
      presetService.selectStep(preset.steps[1]);
      await update();
      previewLive.calls.reset();
    }

    function stepSwitch(index: number): HTMLElement {
      return headingIcon(index, 'fa-check-square-o') || headingIcon(index, 'fa-square-o');
    }

    it('shows no switch for the step of a preset running through a single one', async () => {
      presetService.selectStep(preset.steps[0]);
      await update();

      expect(stepSwitch(0)).toBeNull();
      expect(stepSwitch(1)).toBeNull();
    });

    it('switches an effect off and on again for the step being edited, without opening it', async () => {
      await editSecondStep();

      expect(stepSwitch(0).classList).toContain('fa-check-square-o');
      expect(stepSwitch(0).classList).toContain('text-primary');

      stepSwitch(0).click();
      await update();

      expect(preset.steps[1].getEffectAmount('dimmer')).toBe(0);
      expect(stepSwitch(0).classList).toContain('fa-square-o');
      expect(headings()[0].querySelector('.text-muted').textContent).toContain('designer.effect.type-curve');
      expect(effectService.selectedEffect).toBeUndefined();
      expect(effectsChanged).toHaveBeenCalled();
      expect(previewLive).toHaveBeenCalled();
      // the other step goes on as it did
      expect(preset.steps[0].getEffectAmount('dimmer')).toBe(0.5);

      stepSwitch(0).click();
      await update();

      expect(preset.steps[1].getEffectAmount('dimmer')).toBe(1);
      expect(headings()[0].querySelector('.text-muted')).toBeNull();
    });

    it('tells the step the effect runs in, and how much of it the step lets through', async () => {
      await editSecondStep();
      const component = fixture.componentInstance;

      expect(component.runsInStepDescription(preset.effects[0])).toBe('designer.effect.runs-in-step');

      presetService.selectStep(preset.steps[0]);
      expect(component.runsInStepDescription(preset.effects[0])).toBe('designer.effect.runs-in-step (50 %)');
    });

    it('adds a new effect to the step being edited only', async () => {
      await editSecondStep();

      fixture.componentInstance.addCurveEffect();
      await update();

      const added = preset.effects[2];
      expect(preset.steps[0].getEffectAmount(added.uuid)).toBe(0);
      expect(preset.steps[1].getEffectAmount(added.uuid)).toBe(1);
      expect(stepSwitch(2).classList).toContain('fa-check-square-o');
    });
  });
});
