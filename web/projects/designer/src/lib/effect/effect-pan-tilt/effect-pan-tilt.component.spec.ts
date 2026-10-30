import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

import { EffectPanTilt } from '../../models/effect-pan-tilt';
import { LivePreviewService } from '../../services/live-preview.service';
import { EffectPanTiltComponent } from './effect-pan-tilt.component';

// The editor of a movement of the moving heads: its shape, its size, its period, its chase and how long it runs
describe('EffectPanTiltComponent', () => {
  let fixture: ComponentFixture<EffectPanTiltComponent>;
  let component: EffectPanTiltComponent;
  let element: HTMLElement;
  let effect: EffectPanTilt;
  let previewLive: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [EffectPanTiltComponent],
      imports: [FormsModule, TranslateModule.forRoot()],
      providers: [{ provide: LivePreviewService, useValue: { previewLive: () => {} } }],
    }).compileComponents();

    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');
    effect = new EffectPanTilt({ uuid: 'move' });

    fixture = TestBed.createComponent(EffectPanTiltComponent);
    component = fixture.componentInstance;
    component.effect = effect;
    element = fixture.nativeElement;
    await update();
  });

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function type(name: string, value: string) {
    const input: HTMLInputElement = element.querySelector(`[name="${name}"]`);
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
  }

  it('draws the shape of the movement, the bigger size reaching the edges', () => {
    const path = element.querySelector('path.pan-tilt-grid-shape').getAttribute('d');

    expect(path.startsWith('M75.0 40.5')).toBe(true);
    expect(component.getShapePath().split('L').length).toBe(121);

    component.effect = undefined;
    expect(component.getShapePath()).toBe('');
  });

  it('picks the shape', async () => {
    (element.querySelector('button[name="shape-figure8"]') as HTMLButtonElement).click();
    await update();

    expect(effect.shape).toBe('figure8');
    expect(element.querySelector('button[name="shape-figure8"]').classList).toContain('active');
    expect(previewLive).toHaveBeenCalled();
  });

  it('sizes the movement in degrees, never below nothing', () => {
    type('sizePan', '120');
    type('sizeTilt', '45');
    expect(effect.sizePanDegrees).toBe(120);
    expect(effect.sizeTiltDegrees).toBe(45);

    type('sizePan', '-5');
    type('sizeTilt', 'far');
    expect(effect.sizePanDegrees).toBe(120);
    expect(effect.sizeTiltDegrees).toBe(45);
  });

  it('runs a period in seconds, or in beats following the tempo', async () => {
    expect(component.getLength()).toBe(2.5);

    type('length', '4');
    expect(effect.lengthMillis).toBe(4000);
    type('length', '0.01');
    expect(effect.lengthMillis).toBe(100);

    component.setLengthMode('beats');
    await update();
    expect(component.getLength()).toBe(4);

    type('length', '2');
    expect(effect.lengthBeats).toBe(2);
    type('length', '0');
    expect(effect.lengthBeats).toBe(0.25);
  });

  it('chases over the heads by the cycles spread over them', () => {
    effect.phasingMode = 'millis';
    expect(component.getChase()).toBe(0);

    type('chase', '1');
    expect(effect.phasingMode).toBe('spread');
    expect(effect.phasingCycles).toBe(1);
    expect(component.getChase()).toBe(1);
  });

  it('runs forever, or a number of cycles and then holds or returns', async () => {
    expect(component.getRunCycles()).toBe(0);
    expect(element.querySelector('select[name="endMode"]')).toBeNull();

    type('runCycles', '2.4');
    await update();
    expect(effect.runMode).toBe('cycles');
    expect(effect.runCycles).toBe(2);
    expect(component.getRunCycles()).toBe(2);

    component.setEndMode('base');
    expect(effect.endMode).toBe('base');

    type('runCycles', '0');
    expect(effect.runMode).toBe('infinite');
  });
});
