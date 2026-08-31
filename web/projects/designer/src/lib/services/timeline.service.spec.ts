import { inject, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { Composition } from '../models/composition';
import { Project } from '../models/project';
import { ScenePlaybackRegion } from '../models/scene-playback-region';
import { ProjectService } from './project.service';
import { TimelineService } from './timeline.service';

describe('TimelineService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TimelineService],
    });
  });

  it('should be created', inject([TimelineService], (service: TimelineService) => {
    expect(service).toBeTruthy();
  }));
});

// An audio file which cannot be read says nothing about the show written over it: the
// composition holds the scenes played along the song, so it stays where it is and only
// the missing file is reported.
describe('TimelineService with an audio file which cannot be read', () => {
  let service: TimelineService;
  let projectService: ProjectService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    service = TestBed.inject(TimelineService);
    projectService = TestBed.inject(ProjectService);

    projectService.project = new Project();
    projectService.project.compositions.push(composition('composition-1', 'Song One'), composition('composition-2', 'Song Two'));

    service.selectedComposition = projectService.project.compositions[0];
    service.selectedCompositionIndex = 0;
    service.loadingAudioFile = true;
  });

  // a composition playing one scene over its first ten seconds
  function composition(uuid: string, name: string): Composition {
    const audioComposition = new Composition();
    audioComposition.uuid = uuid;
    audioComposition.name = name;
    audioComposition.audioFileName = name + '.mp3';

    const region = new ScenePlaybackRegion();
    region.sceneUuid = 'scene-1';
    region.startMillis = 0;
    region.endMillis = 10000;
    audioComposition.scenePlaybackRegions.push(region);

    return audioComposition;
  }

  it('keeps the composition and the scenes played in it', () => {
    (service as any).audioFileLoadFailed(new Error('could not read the file'));

    expect(projectService.project.compositions.length).toBe(2);
    expect(projectService.project.compositions[0].scenePlaybackRegions.length).toBe(1);
    expect(service.selectedComposition).toBe(projectService.project.compositions[0]);
  });

  it('reports the missing file instead of waiting for it forever', () => {
    (service as any).audioFileLoadFailed(new Error('could not read the file'));

    expect(service.audioFileError).toBe(true);
    expect(service.loadingAudioFile).toBe(false);
  });

  it('forgets the missing file again once another composition is selected', () => {
    (service as any).audioFileLoadFailed(new Error('could not read the file'));
    service.destroyWaveSurfer();

    expect(service.audioFileError).toBe(false);
  });

  // deleting a composition is still what the delete button does
  it('removes the composition when it is deleted', () => {
    service.deleteSelectedComposition();

    expect(projectService.project.compositions.length).toBe(1);
    expect(projectService.project.compositions[0].uuid).toBe('composition-2');
  });
});
