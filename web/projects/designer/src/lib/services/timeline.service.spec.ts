import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';

import { Composition } from '../models/composition';
import { Preset } from '../models/preset';
import { Project } from '../models/project';
import { Scene } from '../models/scene';
import { ScenePlaybackRegion } from '../models/scene-playback-region';
import { Track } from '../models/track';
import { ProjectService } from './project.service';
import { SceneService } from './scene.service';
import { TimelineService } from './timeline.service';

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
    // The waveform of the next composition needs the timeline on the page
    spyOn(service, 'createWaveSurfer');

    service.deleteSelectedComposition();

    expect(projectService.project.compositions.length).toBe(1);
    expect(projectService.project.compositions[0].uuid).toBe('composition-2');
  });
});

// The tracks are layered like the presets of a scene: the topmost one is on top. The presets
// are handed out from the bottom up, so the ones handed out later overwrite the earlier ones.
describe('TimelineService playing the tracks of a composition', () => {
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

    for (const name of ['first', 'second', 'third']) {
      const preset = new Preset();
      preset.uuid = name + '-preset';
      projectService.project.presets.push(preset);

      const scene = new Scene();
      scene.uuid = name;
      scene.presetUuids = [preset.uuid];
      projectService.project.scenes.push(scene);
    }

    const playing = new Composition();
    playing.tracks = [track('top'), track('bottom')];
    projectService.project.compositions.push(playing);
    service.selectedComposition = playing;
  });

  function track(uuid: string): Track {
    const named = new Track();
    named.uuid = uuid;
    named.name = uuid;

    return named;
  }

  function play(sceneUuid: string, trackUuid: string, startMillis: number, endMillis: number) {
    const region = new ScenePlaybackRegion();
    region.sceneUuid = sceneUuid;
    region.trackUuid = trackUuid;
    region.startMillis = startMillis;
    region.endMillis = endMillis;
    service.selectedComposition.scenePlaybackRegions.push(region);
  }

  const scenesAt = (millis: number) => service.getPresetsInTime(millis).map((preset) => preset.scene.uuid);

  it('puts the scenes of the top track on top, whatever the order of the scenes', () => {
    // the third scene comes last in the project, but plays on the top track
    play('first', 'bottom', 0, 10000);
    play('third', 'top', 0, 10000);

    expect(scenesAt(5000)).toEqual(['first', 'third']);
  });

  it('plays only the scenes whose clips run at that time', () => {
    play('first', 'bottom', 0, 4000);
    play('second', 'bottom', 4000, 8000);
    play('third', 'top', 6000, 10000);

    expect(scenesAt(2000)).toEqual(['first']);
    expect(scenesAt(7000)).toEqual(['second', 'third']);
  });

  it('follows the tracks when they are moved', () => {
    play('first', 'bottom', 0, 10000);
    play('third', 'top', 0, 10000);

    service.selectedComposition.tracks.reverse();

    expect(scenesAt(5000)).toEqual(['third', 'first']);
  });

  it('moves a track in front of another one, or to the end', () => {
    const [top, bottom] = service.selectedComposition.tracks;
    const names = () => service.selectedComposition.tracks.map((t) => t.uuid);

    service.moveTrack(top, 2);
    expect(names()).toEqual(['bottom', 'top']);

    service.moveTrack(top, 0);
    expect(names()).toEqual(['top', 'bottom']);

    // in front of itself or right behind it, it stays where it is
    service.moveTrack(bottom, 1);
    service.moveTrack(bottom, 2);
    expect(names()).toEqual(['top', 'bottom']);
  });

  // the designer is a preview: hiding and soloing tracks helps working on the show
  it('leaves a hidden track out of the preview', () => {
    play('first', 'bottom', 0, 10000);
    play('third', 'top', 0, 10000);

    service.toggleTrackHidden(service.selectedComposition.tracks[0]);

    expect(scenesAt(5000)).toEqual(['first']);
  });

  it('plays only the soloed tracks in the preview', () => {
    play('first', 'bottom', 0, 10000);
    play('third', 'top', 0, 10000);

    service.toggleTrackSolo(service.selectedComposition.tracks[1]);

    expect(scenesAt(5000)).toEqual(['first']);
  });
});

// Without an audio file, the timeline runs on its own clock, and the composition lasts as
// long as its scenes: a scene put past the end makes it longer.
describe('TimelineService without an audio file', () => {
  let service: TimelineService;
  let projectService: ProjectService;
  let sceneService: SceneService;
  let http: HttpTestingController;
  let now: number;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    service = TestBed.inject(TimelineService);
    projectService = TestBed.inject(ProjectService);
    sceneService = TestBed.inject(SceneService);
    http = TestBed.inject(HttpTestingController);

    now = 1000;
    spyOn(performance, 'now').and.callFake(() => now);

    projectService.project = new Project();

    const preset = new Preset();
    preset.uuid = 'preset';
    projectService.project.presets.push(preset);

    const scene = new Scene();
    scene.uuid = 'scene';
    scene.name = 'Scene';
    scene.presetUuids = [preset.uuid];
    projectService.project.scenes.push(scene);

    // it still knows the file it played along before, but does not play it anymore
    const composition = new Composition();
    composition.uuid = 'composition';
    composition.name = 'Song One';
    composition.syncType = 'none';
    composition.audioFileName = 'Song One.mp3';
    projectService.project.compositions.push(composition);

    play(0, 10000);
    service.selectCompositionIndex(0);
  });

  afterEach(() => {
    service.destroyWaveSurfer();
  });

  function play(startMillis: number, endMillis: number) {
    const region = new ScenePlaybackRegion();
    region.sceneUuid = 'scene';
    region.startMillis = startMillis;
    region.endMillis = endMillis;
    projectService.project.compositions[0].scenePlaybackRegions.push(region);
  }

  it('does not play the audio file', () => {
    expect(service.playsAudioFile()).toBe(false);
    expect(service.waveSurfer).toBeUndefined();
  });

  it('lasts until its last scene has ended', () => {
    expect(service.getEndMillis()).toBe(10000);
    expect(service.duration).toBe('00:10.000');
  });

  it('gets longer with a scene put past the end', () => {
    play(20000, 30000);

    expect(service.getEndMillis()).toBe(30000);
  });

  it('runs on its own clock while playing', () => {
    service.play();
    now += 2500;

    expect(service.playState).toBe('playing');
    expect(service.getCurrentMillis()).toBe(2500);

    service.pause();
    now += 1000;

    expect(service.playState).toBe('paused');
    expect(service.getCurrentMillis()).toBe(2500);
  });

  it('keeps running from where it has been moved to', () => {
    service.seekToMillis(4000);
    expect(service.getCurrentMillis()).toBe(4000);

    service.play();
    now += 1000;
    service.seekToMillis(8000);
    now += 500;

    expect(service.getCurrentMillis()).toBe(8500);
  });

  it('stops at the end of the composition', () => {
    service.play();
    now += 10030;
    (service as any).stopClockAtTheEnd();

    expect(service.playState).toBe('paused');
    expect(service.getCurrentMillis()).toBe(10000);
  });

  it('plays from the start again, once it has reached the end', () => {
    service.seekToMillis(10000);
    service.play();

    expect(service.getCurrentMillis()).toBe(0);
  });

  it('goes back to the start', () => {
    service.seekToMillis(4000);
    service.rewind();

    expect(service.getCurrentMillis()).toBe(0);
  });

  it('starts another composition at its beginning', () => {
    service.play();
    now += 3000;

    service.selectCompositionIndex(0);

    expect(service.playState).toBe('paused');
    expect(service.getCurrentMillis()).toBe(0);
  });

  it('puts the selected scene at the position, past the end as well', () => {
    sceneService.selectScenes([projectService.project.scenes[0]]);
    service.seekToMillis(12000);

    service.addRegion();

    const added = service.selectedComposition.scenePlaybackRegions[1];
    expect(added.startMillis).toBe(12000);
    expect(added.endMillis).toBeGreaterThan(12000);
    expect(service.getEndMillis()).toBe(added.endMillis);
  });

  describe('in Rocket Show', () => {
    beforeEach(() => {
      service.externalCompositionsAvailable = true;
      service.selectCompositionIndex(0);
    });

    afterEach(() => {
      http.verify();
    });

    it('shows the actions Rocket Show fires', () => {
      http.expectOne('composition?name=Song%20One').flush({
        name: 'Song One',
        durationMillis: 4000,
        actionTriggerList: [{ positionMillis: 4000, actionList: [{ actionMidi: { type: 'MIDI' } }] }],
      });

      expect(service.externalComposition.actionTriggers.map((trigger) => trigger.positionMillis)).toEqual([4000]);
    });

    it('lasts as long as Rocket Show plays the composition, if that is longer', () => {
      http.expectOne('composition?name=Song%20One').flush({ name: 'Song One', durationMillis: 45000, actionTriggerList: [] });

      expect(service.getEndMillis()).toBe(45000);
    });

    it('shows nothing, if Rocket Show has no composition of that name', () => {
      http.expectOne('composition?name=Song%20One').flush(null);

      expect(service.externalComposition).toBeUndefined();
      expect(service.getEndMillis()).toBe(10000);
    });
  });
});
