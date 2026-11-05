import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';
import { ToastrModule } from 'ngx-toastr';

import { Project } from '../../models/project';
import { FixtureService } from '../../services/fixture.service';
import { LivePreviewService } from '../../services/live-preview.service';
import { PreviewService } from '../../services/preview.service';
import { ProjectService } from '../../services/project.service';
import { FixtureSettingsPositionComponent } from './fixture-settings-position/fixture-settings-position.component';
import { FixtureSettingsStageComponent } from './fixture-settings-stage/fixture-settings-stage.component';
import { FixtureSettingsComponent } from './fixture-settings.component';

// The settings tab: where the fixtures picked in the fixture panel hang, next to the size of
// the stage.
describe('FixtureSettingsComponent', () => {
  let fixture: ComponentFixture<FixtureSettingsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [FixtureSettingsComponent, FixtureSettingsPositionComponent, FixtureSettingsStageComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    TestBed.inject(ProjectService).project = new Project();
  });

  function open() {
    fixture = TestBed.createComponent(FixtureSettingsComponent);
    fixture.detectChanges();
  }

  it('shows the position of the fixtures and the stage side by side', () => {
    open();

    expect(fixture.nativeElement.querySelector('lib-app-fixture-settings-position .card-header').textContent).toContain(
      'designer.fixture.setting-position-title'
    );
    expect(fixture.nativeElement.querySelector('lib-app-fixture-settings-stage .card-header').textContent).toContain(
      'designer.fixture.setting-stage'
    );
  });

  it('lets a color alone light the fixtures lighting in colors, or not, and plays it at once', () => {
    open();
    const fixtureService = TestBed.inject(FixtureService);
    const previewService = TestBed.inject(PreviewService);
    const livePreviewService = TestBed.inject(LivePreviewService);
    spyOn(fixtureService, 'updateCachedFixtures');
    spyOn(previewService, 'updateFixtureSetup');
    spyOn(livePreviewService, 'previewLive');
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector('#color-dimmers-at-full');

    // on in a new project
    fixture.detectChanges();
    return fixture.whenStable().then(() => {
      expect(checkbox.checked).toBe(true);
      expect(fixture.nativeElement.querySelector('.color-dimmers .card-header').textContent).toContain('designer.fixture.setting-dimmers');

      checkbox.click();

      expect(TestBed.inject(ProjectService).project.colorDimmersAtFull).toBe(false);
      expect(fixtureService.updateCachedFixtures).toHaveBeenCalled();
      expect(previewService.updateFixtureSetup).toHaveBeenCalled();
      expect(livePreviewService.previewLive).toHaveBeenCalled();
    });
  });

  // a full height keeps chrome from laying the tab out again and again while a slider moves,
  // other browsers get the bottom margin wrong with it
  it('takes the full height in chrome only', () => {
    open();

    expect(fixture.nativeElement.querySelector('.row').classList).toContain('h-100');

    spyOnProperty(navigator, 'appVersion').and.returnValue('5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15');
    open();

    expect(fixture.nativeElement.querySelector('.row').classList).not.toContain('h-100');
  });
});
