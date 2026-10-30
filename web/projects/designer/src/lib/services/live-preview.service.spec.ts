import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { Composition } from '../models/composition';
import { Fixture } from '../models/fixture';
import { Project } from '../models/project';
import { AnimationService } from './animation.service';
import { ConfigService } from './config.service';
import { LivePreviewService } from './live-preview.service';
import { ProjectService } from './project.service';
import { TimelineStateService } from './timeline-state.service';

// The live preview hands the project to Rocket Show, which lights the stage with it while the
// designer edits it: a composition being played right away, every other change at most every 50 ms.
describe('LivePreviewService', () => {
  let service: LivePreviewService;
  let http: HttpTestingController;
  let configService: ConfigService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    configService = TestBed.inject(ConfigService);
    configService.livePreview = true;
    TestBed.inject(ProjectService).project = new Project({ name: 'Show' });
    service = TestBed.inject(LivePreviewService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('sends nothing while the live preview is off', () => {
    configService.livePreview = false;

    service.previewLive();
    service.previewLive('Song', 1000);
    service.stopPreviewPlay();

    http.expectNone(() => true);
  });

  it('sends the project with the position of the preview clock', fakeAsync(() => {
    TestBed.inject(AnimationService).timeMillis = 1234.6;

    service.previewLive();

    const request = http.expectOne('preview?positionMillis=1235&compositionName=');
    expect(request.request.method).toBe('POST');
    expect(JSON.parse(request.request.body).name).toBe('Show');
    request.flush(null);
    tick(50);
  }));

  it('sends the patch the fixture pool edits instead of the one of the project, until it is done', fakeAsync(() => {
    const project = TestBed.inject(ProjectService).project;
    project.fixtures = [new Fixture({ uuid: 'par', dmxFirstChannel: 0 })];
    project.identifyFixtureUuids = ['par'];

    service.previewPatch([new Fixture({ uuid: 'par', dmxFirstChannel: 30 })]);

    const patched = JSON.parse(http.expectOne('preview?positionMillis=0&compositionName=').request.body);
    expect(patched.name).toBe('Show');
    expect(patched.fixtures.map((fixture) => fixture.dmxFirstChannel)).toEqual([30]);
    expect(patched.identifyFixtureUuids).toEqual(['par']);
    // the project keeps its own patch
    expect(project.fixtures[0].dmxFirstChannel).toBe(0);
    tick(50);

    service.endPatchPreview();
    service.previewLive();

    expect(JSON.parse(http.expectOne('preview?positionMillis=0&compositionName=').request.body).fixtures[0].dmxFirstChannel).toBe(0);
    tick(50);
  }));

  it('sends a composition being played right away, named for an address', () => {
    service.previewLive('Rock & Roll #1', 500);
    service.previewLive('Rock & Roll #1', 520);

    http.expectOne('preview?positionMillis=500&compositionName=Rock%20%26%20Roll%20%231').flush(null);
    http.expectOne('preview?positionMillis=520&compositionName=Rock%20%26%20Roll%20%231').flush(null);
  });

  it('names the composition the timeline plays', () => {
    const timelineState = TestBed.inject(TimelineStateService);
    timelineState.playState = 'playing';
    timelineState.selectedComposition = new Composition({ name: 'Song' });

    service.previewLive(undefined, 100);

    http.expectOne('preview?positionMillis=100&compositionName=Song').flush(null);
  });

  it('sends only the last of the changes coming in while it waits', fakeAsync(() => {
    service.previewLive(undefined, 0);
    http.expectOne('preview?positionMillis=0&compositionName=').flush(null);

    service.previewLive(undefined, 10);
    service.previewLive(undefined, 20);
    http.expectNone(() => true);

    tick(50);
    http.expectOne('preview?positionMillis=20&compositionName=').flush(null);

    // and keeps waiting as long as the changes keep coming
    service.previewLive(undefined, 60);
    tick(50);
    http.expectOne('preview?positionMillis=60&compositionName=').flush(null);

    // until they stop
    tick(50);
    service.previewLive(undefined, 200);
    http.expectOne('preview?positionMillis=200&compositionName=').flush(null);
    tick(50);
  }));

  it('stops the composition played in the preview', () => {
    service.stopPreviewPlay();

    http.expectOne('stop-preview-play').flush(null);
  });
});
