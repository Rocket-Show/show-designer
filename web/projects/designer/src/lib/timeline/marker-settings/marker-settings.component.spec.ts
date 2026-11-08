import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';

import { Composition } from '../../models/composition';
import { CompositionMarker } from '../../models/composition-marker';
import { LivePreviewService } from '../../services/live-preview.service';
import { TimelineService } from '../../services/timeline.service';
import { MarkerSettingsComponent } from './marker-settings.component';

// The settings of a marker: its name, whether it is a label or a hold point, and where it is. The dialog edits them on
// the side and hands them over on OK; the marker is removed here as well.
describe('MarkerSettingsComponent', () => {
  let fixture: ComponentFixture<MarkerSettingsComponent>;
  let element: HTMLElement;
  let composition: Composition;
  let marker: CompositionMarker;
  let timelineService: TimelineService;
  let hide: jasmine.Spy;
  let previewLive: jasmine.Spy;
  let redrawn: jasmine.Spy;

  beforeEach(async () => {
    hide = jasmine.createSpy('hide');

    await TestBed.configureTestingModule({
      declarations: [MarkerSettingsComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [{ provide: BsModalRef, useValue: { hide } }, provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    marker = new CompositionMarker({ uuid: 'chorus', name: 'Chorus', positionMillis: 30000, type: 'label' });
    composition = new Composition();
    composition.markers = [marker, new CompositionMarker({ uuid: 'outro', name: 'Outro', positionMillis: 60000, type: 'hold' })];

    timelineService = TestBed.inject(TimelineService);
    timelineService.selectedComposition = composition;
    timelineService.selectedMarkerUuid = marker.uuid;
    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');
    redrawn = jasmine.createSpy('detectChanges');
    timelineService.detectChanges.subscribe(redrawn);

    fixture = TestBed.createComponent(MarkerSettingsComponent);
    fixture.componentInstance.marker = marker;
    element = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const field = (id: string): HTMLInputElement => element.querySelector('#' + id);

  function type(id: string, value: string) {
    field(id).value = value;
    field(id).dispatchEvent(new Event(field(id).tagName === 'SELECT' ? 'change' : 'input'));
    fixture.detectChanges();
  }

  const button = (text: string): HTMLElement =>
    Array.from(element.querySelectorAll<HTMLElement>('.modal-footer a, .modal-footer button')).find(
      (candidate) => candidate.textContent.trim() === text
    );

  it('shows the marker as it is', () => {
    expect(field('markerName').value).toBe('Chorus');
    expect(field('markerType').value).toBe('label');
    expect(field('markerPosition').value).toBe('30000');
    expect(element.querySelector('.form-text').textContent.trim()).toBe('designer.timeline.marker-type-label-hint');
  });

  it('renames the marker, turns it into a hold point and moves it on OK', () => {
    type('markerName', '  Big chorus ');
    type('markerType', 'hold');
    type('markerPosition', '31250.4');
    expect(element.querySelector('.form-text').textContent.trim()).toBe('designer.timeline.marker-type-hold-hint');
    expect(marker.name).toBe('Chorus');

    button('designer.misc.ok').click();

    expect([marker.name, marker.type, marker.positionMillis]).toEqual(['Big chorus', 'hold', 31250]);
    expect(redrawn).toHaveBeenCalled();
    expect(previewLive).toHaveBeenCalled();
    expect(hide).toHaveBeenCalled();
  });

  it('keeps the name and the position, unless a name and a point in time from the start on are typed in', () => {
    type('markerName', '   ');
    type('markerPosition', '-200');
    button('designer.misc.ok').click();
    expect([marker.name, marker.positionMillis]).toEqual(['Chorus', 30000]);

    fixture.componentInstance.positionMillis = 'soon';
    fixture.componentInstance.ok();
    expect(marker.positionMillis).toBe(30000);
  });

  it('takes the settings over with the enter key', () => {
    type('markerType', 'hold');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(marker.type).toBe('hold');
    expect(hide).toHaveBeenCalled();
  });

  it('leaves the marker as it was, when the settings are cancelled', () => {
    type('markerName', 'Bridge');

    button('designer.misc.cancel').click();

    expect(marker.name).toBe('Chorus');
    expect(hide).toHaveBeenCalled();
    expect(previewLive).not.toHaveBeenCalled();
  });

  it('removes the marker', () => {
    button('designer.timeline.remove-marker').click();

    expect(composition.markers.map((candidate) => candidate.name)).toEqual(['Outro']);
    expect(timelineService.selectedMarker).toBeUndefined();
    expect(previewLive).toHaveBeenCalled();
    expect(hide).toHaveBeenCalled();
  });
});
