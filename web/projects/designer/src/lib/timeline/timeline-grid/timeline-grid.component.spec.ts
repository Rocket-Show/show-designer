import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';

import { Composition } from '../../models/composition';
import { getRulerTicks } from '../../models/timeline-ruler';
import { TimelineService } from '../../services/timeline.service';
import { TimelineGridComponent } from './timeline-grid.component';

// The grid of a composition: the lines across the tracks, the bars on the ruler and the
// points the clips snap to. The dialog edits a copy and hands it over on OK.
describe('TimelineGridComponent', () => {
  let fixture: ComponentFixture<TimelineGridComponent>;
  let element: HTMLElement;
  let composition: Composition;
  let timelineService: TimelineService;
  let hide: jasmine.Spy;
  let redrawn: jasmine.Spy;

  beforeEach(async () => {
    hide = jasmine.createSpy('hide');

    await TestBed.configureTestingModule({
      declarations: [TimelineGridComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [{ provide: BsModalRef, useValue: { hide } }, provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    composition = new Composition();
    composition.beatsPerMinute = 120;
    composition.timeSignatureUpper = 4;
    composition.timeSignatureLower = 4;
    composition.gridResolution = 4;
    composition.gridOffsetMillis = 0;
    composition.snapToGrid = true;

    timelineService = TestBed.inject(TimelineService);
    timelineService.selectedComposition = composition;
    redrawn = jasmine.createSpy('detectChanges');
    timelineService.detectChanges.subscribe(redrawn);

    fixture = TestBed.createComponent(TimelineGridComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const textInputs = (): HTMLInputElement[] => Array.from(element.querySelectorAll('input[type=text]'));
  const selects = (): HTMLSelectElement[] => Array.from(element.querySelectorAll('select'));
  const snapToGrid = (): HTMLInputElement => element.querySelector('#snapToGrid');

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
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

  it('shows the grid of the composition', () => {
    expect(selects()[0].value).toBe('musical');
    expect(textInputs().map((input) => input.value)).toEqual(['120', '4', '4', '0']);
    expect(selects()[1].value).toBe('4');
    expect(snapToGrid().checked).toBe(true);
  });

  it('asks for the tempo and the time signature only for a musical grid', () => {
    choose(selects()[0], 'time');

    expect(textInputs().length).toBe(0);
    expect(selects().length).toBe(1);
    expect(snapToGrid()).not.toBeNull();
  });

  it('leaves the composition alone until OK is pressed', () => {
    type(textInputs()[0], '90');
    choose(selects()[0], 'time');

    expect(composition.beatsPerMinute).toBe(120);
    expect(composition.gridType).toBe('musical');
  });

  it('puts the grid into the composition on OK and draws the timeline again', () => {
    const [bpm, upper, lower, offset] = textInputs();
    type(bpm, '96');
    type(upper, '3');
    type(lower, '8');
    type(offset, '250');
    choose(selects()[1], '16');
    snapToGrid().click();

    button('designer.misc.ok').click();

    expect(composition.beatsPerMinute).toBe(96);
    expect(composition.timeSignatureUpper).toBe(3);
    expect(composition.timeSignatureLower).toBe(8);
    expect(composition.gridOffsetMillis).toBe(250);
    expect(composition.gridResolution).toBe(16);
    expect(composition.snapToGrid).toBe(false);
    expect(redrawn).toHaveBeenCalled();
    expect(hide).toHaveBeenCalled();
  });

  // the fields hand out text: kept as such, the offset was added to the bars of the ruler
  // as a string and they were drawn far off
  it('counts the bars of the ruler from the offset typed in', () => {
    type(textInputs()[3], '250');
    button('designer.misc.ok').click();

    expect(getRulerTicks(composition, 100, 0, 4500).filter((tick) => tick.label)).toEqual([
      { millis: 250, label: '0' },
      { millis: 2250, label: '1' },
      { millis: 4250, label: '2' },
    ]);
  });

  it('keeps what is set, for a field which holds no number', () => {
    const [bpm, , , offset] = textInputs();
    type(bpm, 'fast');
    type(offset, '');

    button('designer.misc.ok').click();

    expect(composition.beatsPerMinute).toBe(120);
    expect(composition.gridOffsetMillis).toBe(0);
  });

  it('switches the grid to plain time', () => {
    choose(selects()[0], 'time');
    button('designer.misc.ok').click();

    expect(composition.gridType).toBe('time');
  });

  it('takes the grid with the enter key', () => {
    type(textInputs()[0], '140');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(composition.beatsPerMinute).toBe(140);
    expect(hide).toHaveBeenCalled();
  });

  it('closes without a change, when it is cancelled', () => {
    type(textInputs()[0], '140');

    button('designer.misc.cancel').click();

    expect(composition.beatsPerMinute).toBe(120);
    expect(redrawn).not.toHaveBeenCalled();
    expect(hide).toHaveBeenCalled();
  });

  it('closes with the cross in the corner', () => {
    element.querySelector<HTMLElement>('button.close').click();

    expect(hide).toHaveBeenCalled();
    expect(redrawn).not.toHaveBeenCalled();
  });
});
