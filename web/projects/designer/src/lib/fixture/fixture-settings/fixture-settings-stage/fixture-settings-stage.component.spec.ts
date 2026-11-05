import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule, SliderComponent } from 'ngx-bootstrap-slider';
import { ToastrModule } from 'ngx-toastr';

import { Project } from '../../../models/project';
import { PreviewService } from '../../../services/preview.service';
import { ProjectService } from '../../../services/project.service';
import { FixtureSettingsStageComponent } from './fixture-settings-stage.component';

// The size of the stage the preview shows the fixtures on, set with a slider per measure.
describe('FixtureSettingsStageComponent', () => {
  let fixture: ComponentFixture<FixtureSettingsStageComponent>;
  let project: Project;
  let updateStage: jasmine.Spy;
  let updates: number;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      declarations: [FixtureSettingsStageComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    project = new Project({
      stageWidthCm: 800,
      stageHeightCm: 400,
      stageDepthCm: 500,
      stageFloorHeightCm: 40,
      stageCeilingHeightCm: 20,
      stagePillarWidthCm: 30,
    });
    TestBed.inject(ProjectService).project = project;

    const previewService = TestBed.inject(PreviewService);
    updateStage = spyOn(previewService, 'updateStage');
    updates = 0;
    previewService.doUpdateStageAndPositions.subscribe(() => updates++);

    fixture = TestBed.createComponent(FixtureSettingsStageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const sliders = (): any[] =>
    fixture.debugElement.queryAll(By.directive(SliderComponent)).map((slider) => slider.componentInstance.slider);
  const values = (): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll('input.slider-input-readonly')).map((input: HTMLInputElement) => input.value);

  it('shows the size of the stage', () => {
    expect(values()).toEqual(['800', '400', '500', '40', '20', '30']);
    expect(sliders().map((slider) => slider.getValue())).toEqual([800, 400, 500, 40, 20, 30]);
  });

  it('sets the size of the stage with the sliders, and builds the stage of the preview again', async () => {
    const measures = [1000, 500, 700, 50, 25, 35];

    sliders().forEach((slider, index) => slider.setValue(measures[index], false, true));
    fixture.detectChanges();
    await fixture.whenStable();

    expect([
      project.stageWidthCm,
      project.stageHeightCm,
      project.stageDepthCm,
      project.stageFloorHeightCm,
      project.stageCeilingHeightCm,
      project.stagePillarWidthCm,
    ]).toEqual(measures);
    expect(values()).toEqual(['1000', '500', '700', '50', '25', '35']);
    expect(updateStage).toHaveBeenCalledTimes(6);
    expect(updates).toBe(6);
  });
});
