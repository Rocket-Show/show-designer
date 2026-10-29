import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';
import { ToastrModule } from 'ngx-toastr';

import { Project } from '../models/project';
import { LivePreviewService } from '../services/live-preview.service';
import { ProjectService } from '../services/project.service';
import { MasterDimmerComponent } from './master-dimmer.component';

// The master dimmer dims the whole preview, typed in percent or set with its slider.
describe('MasterDimmerComponent', () => {
  let fixture: ComponentFixture<MasterDimmerComponent>;
  let project: Project;
  let previewLive: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MasterDimmerComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    }).compileComponents();

    project = new Project({ masterDimmerValue: 0.75 });
    TestBed.inject(ProjectService).project = project;
    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    fixture = TestBed.createComponent(MasterDimmerComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  // the fields to type the value into (the one for larger screens first)
  function inputs(): HTMLInputElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('input.sd-value-input'));
  }

  it('shows the value in percent', () => {
    expect(inputs().map((input) => input.value)).toEqual(['75', '75']);

    project.masterDimmerValue = 0.12345;
    expect(fixture.componentInstance.getValue()).toBe(12.35);
  });

  it('dims the preview to the percentage typed in', () => {
    const input = inputs()[0];

    input.value = '40';
    input.dispatchEvent(new Event('input'));

    expect(project.masterDimmerValue).toBe(0.4);
    expect(previewLive).toHaveBeenCalled();
  });

  it('keeps its value for anything which is no percentage', () => {
    for (const typed of ['abc', '101', '-1']) {
      const input = inputs()[0];
      input.value = typed;
      input.dispatchEvent(new Event('input'));
    }

    expect(project.masterDimmerValue).toBe(0.75);
    expect(previewLive).not.toHaveBeenCalled();
  });

  it('dims the preview with the slider', () => {
    fixture.componentInstance.setValue(0);

    expect(project.masterDimmerValue).toBe(0);
    expect(previewLive).toHaveBeenCalled();
  });
});
