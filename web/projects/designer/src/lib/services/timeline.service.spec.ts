import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';
import WaveSurfer from 'wavesurfer.js';

import { Composition } from '../models/composition';
import { CompositionMarker } from '../models/composition-marker';
import { ExternalComposition } from '../models/external-composition';
import { Preset } from '../models/preset';
import { Project } from '../models/project';
import { Scene } from '../models/scene';
import { ScenePlaybackRegion } from '../models/scene-playback-region';
import { Track } from '../models/track';
import { ConfigService } from './config.service';
import { LivePreviewService } from './live-preview.service';
import { PresetService } from './preset.service';
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

  // the scene fades in before its clip and out past it: its presets play along meanwhile
  it('plays a scene while it fades in or out outside its clip', () => {
    const fading = projectService.project.scenes[0];
    fading.fadeInMillis = 1000;
    fading.fadeInPre = true;
    fading.fadeOutMillis = 2000;
    fading.fadeOutPost = true;
    play('first', 'bottom', 5000, 10000);

    expect(scenesAt(3900)).toEqual([]);
    expect(scenesAt(4500)).toEqual(['first']);
    expect(scenesAt(11500)).toEqual(['first']);
    expect(scenesAt(12100)).toEqual([]);
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

// The analysis of the audio of the composition the pixel effects follow: worked out the first time one asks for it
describe('TimelineService analyzing the audio of a composition', () => {
  let service: TimelineService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    service = TestBed.inject(TimelineService);
  });

  it('analyzes the audio once a pixel effect asks for it, and forgets it with the composition', async () => {
    // a tenth of a second of a loud sine
    const samples = new Float32Array(4800).map((_, i) => Math.sin(i / 10));
    (service as any).waveSurfer = {
      backend: { buffer: { sampleRate: 48000, numberOfChannels: 1, length: samples.length, getChannelData: () => samples } },
      destroy: () => {},
    };

    // nothing yet, while it is analyzed
    expect(service.audioFrames).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(service.audioFrames(2)[0]).toBeGreaterThan(-10);
    expect(service.audioFrames(99)).toBeUndefined();

    service.destroyWaveSurfer();
    expect(service.audioFrames).toBeUndefined();
  });
});

// The audio buses of Rocket Show a pixel effect can follow, and the files of a composition playing on them, analyzed
describe('TimelineService analyzing the audio buses of Rocket Show', () => {
  let service: TimelineService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    service = TestBed.inject(TimelineService);
    http = TestBed.inject(HttpTestingController);
  });

  // a WAV file of 16 bits in one channel
  function wav(samples: Float32Array, sampleRate = 48000): ArrayBuffer {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const text = (offset: number, value: string) => value.split('').forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));

    text(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, i) => view.setInt16(44 + i * 2, Math.round(sample * 32767), true));

    return buffer;
  }

  async function analyzed(buses: string[]) {
    for (let attempt = 0; attempt < 100 && !service.audioFramesFor(buses); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    return service.audioFramesFor(buses);
  }

  it('loads the buses once, when the designer runs in Rocket Show', () => {
    expect(service.audioBuses).toEqual([]);
    http.expectNone('audio-buses');

    service.externalCompositionsAvailable = true;
    expect(service.audioBuses).toEqual([]);
    http.expectOne('audio-buses').flush([{ uuid: 'music', name: 'Music' }, { uuid: 'click' }]);

    expect(service.audioBuses).toEqual([
      { uuid: 'music', name: 'Music' },
      { uuid: 'click', name: '' },
    ]);
    http.expectNone('audio-buses');
  });

  it('offers no buses where Rocket Show cannot tell them', () => {
    spyOn(console, 'error');
    service.externalCompositionsAvailable = true;
    expect(service.audioBuses).toEqual([]);
    http.expectOne('audio-buses').flush(null, { status: 500, statusText: 'Server Error' });

    expect(service.audioBuses).toEqual([]);
    http.expectNone('audio-buses');
  });

  it('analyzes the files of the composition playing on the buses an effect follows, mixed', async () => {
    // all buses, or no files known, follow the audio file of the composition
    expect(service.previewsAudioBuses()).toBe(false);
    expect(service.audioFramesFor(['drums'])).toBe(service.audioFrames);

    service.externalComposition = new ExternalComposition({
      compositionFileList: [
        { audioFile: { name: 'Drums.wav', outputBusUuid: 'drums', offsetMillis: 50, volume: 0.5 } },
        { audioFile: { name: 'Click.wav', outputBusUuid: 'click' } },
        // a file which loops or is switched off isn't analyzed in Rocket Show either
        { audioFile: { name: 'Loop.wav', outputBusUuid: 'drums', loop: true } },
        { audioFile: { name: 'Off.wav', outputBusUuid: 'drums', active: false } },
        { midiFile: { name: 'Lights.mid' } },
        null,
      ],
    });

    expect(service.previewsAudioBuses()).toBe(true);
    expect(service.externalComposition.audioFiles.map((file) => [file.name, file.busUuid, file.offsetMillis, file.volume])).toEqual([
      ['Drums.wav', 'drums', 50, 0.5],
      ['Click.wav', 'click', 0, 1],
    ]);
    expect(service.audioFramesFor([])).toBe(service.audioFrames);

    // the drums: a tenth of a second of a loud sine, starting 50 ms in
    expect(service.audioFramesFor(['drums'])).toBeUndefined();
    expect(service.audioFramesFor(['drums'])).toBeUndefined();
    http.expectOne('file/get?name=Drums.wav&type=AUDIO').flush(wav(new Float32Array(4800).map((_, i) => Math.sin(i / 10))));
    const drums = await analyzed(['drums']);

    expect(drums(0)[0]).toBe(-100);
    expect(drums(4)[0]).toBeGreaterThan(-20);
    expect(drums(99)).toBeUndefined();

    // a bus without files is silent
    const silent = await analyzed(['nothing']);
    expect(silent(3)).toBeUndefined();

    // a file Rocket Show can't hand over leaves nothing to follow
    spyOn(console, 'error');
    service.audioFramesFor(['click']);
    http.expectOne('file/get?name=Click.wav&type=AUDIO').flush(null, { status: 404, statusText: 'Not Found' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(console.error).toHaveBeenCalled();
    expect(service.audioFramesFor(['click'])).toBeUndefined();
  });
});

describe('TimelineService showing times', () => {
  let service: TimelineService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    service = TestBed.inject(TimelineService);
  });

  it('shows minutes, seconds and milliseconds', () => {
    expect(service.msToTime(0)).toBe('00:00.000');
    expect(service.msToTime(83456)).toBe('01:23.456');
    expect(service.msToTime(83456, false)).toBe('01:23');
    expect(service.msToTime(undefined)).toBe('00:00.000');
  });

  it('cuts the milliseconds off rather than rounding them up to a thousand', () => {
    expect(service.msToTime(999.6)).toBe('00:00.999');
    expect(service.msToTime(59999.7)).toBe('00:59.999');
  });

  it('counts the minutes on past the hour', () => {
    expect(service.msToTime(75 * 60000 + 1000)).toBe('75:01.000');
  });
});

// WaveSurfer loads and plays the audio file of a composition: the timeline runs along it.
describe('TimelineService playing along an audio file', () => {
  let service: TimelineService;
  let projectService: ProjectService;
  let configService: ConfigService;
  let livePreviewService: LivePreviewService;
  let waveSurfer: FakeWaveSurfer;

  class FakeWaveSurfer {
    handlers: { [event: string]: (argument?: any) => void } = {};
    isReady = false;
    currentTime = 0;
    duration = 0;
    backend = { buffer: new AudioBuffer({ length: 8000, sampleRate: 8000, numberOfChannels: 1 }) };
    load = jasmine.createSpy('load');
    play = jasmine.createSpy('play');
    pause = jasmine.createSpy('pause');
    destroy = jasmine.createSpy('destroy');
    seekTo = jasmine.createSpy('seekTo').and.callFake((progress: number) => (this.currentTime = progress * this.duration));

    on(event: string, handler: (argument?: any) => void) {
      this.handlers[event] = handler;
    }

    getCurrentTime(): number {
      return this.currentTime;
    }

    getDuration(): number {
      return this.duration;
    }
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    service = TestBed.inject(TimelineService);
    projectService = TestBed.inject(ProjectService);
    configService = TestBed.inject(ConfigService);
    configService.restUrl = 'https://show/api/';
    livePreviewService = TestBed.inject(LivePreviewService);
    spyOn(livePreviewService, 'previewLive');
    spyOn(livePreviewService, 'stopPreviewPlay');

    waveSurfer = new FakeWaveSurfer();
    spyOn(WaveSurfer, 'create').and.callFake(() => waveSurfer as any);

    projectService.project = new Project();
    const composition = new Composition();
    composition.uuid = 'song';
    composition.name = 'Rock & Roll';
    composition.audioFileName = 'Rock & Roll #1.mp3';
    composition.tempoGuessed = true;
    projectService.project.compositions.push(composition);

    const scene = new Scene();
    scene.uuid = 'scene';
    scene.name = 'Verse';
    projectService.project.scenes.push(scene);
  });

  afterEach(() => {
    service.destroyWaveSurfer();
  });

  // select the composition and let WaveSurfer read a song of a minute
  function load() {
    service.selectCompositionIndex(0);
    tick();
    waveSurfer.isReady = true;
    waveSurfer.duration = 60;
    waveSurfer.handlers.ready();
    tick();
  }

  it('loads the audio file of a composition from the server of the designer', fakeAsync(() => {
    service.selectCompositionIndex(0);
    expect(service.loadingAudioFile).toBe(true);
    tick();

    expect(waveSurfer.load).toHaveBeenCalledWith('https://show/api/composition-files/?file=song.mp3');
  }));

  it('loads the audio file of a composition from the media library of Rocket Show, named for an address', fakeAsync(() => {
    configService.enableMediaLibrary = true;

    service.selectCompositionIndex(0);
    tick();

    expect(waveSurfer.load).toHaveBeenCalledWith('https://show/api/file/get?name=Rock%20%26%20Roll%20%231.mp3&type=AUDIO');
  }));

  it('lasts as long as the song, once it has been read', fakeAsync(() => {
    const ready = jasmine.createSpy('ready');
    service.waveSurferReady.subscribe(ready);
    service.selectCompositionIndex(0);
    tick();
    expect(service.duration).toBeUndefined();

    waveSurfer.isReady = true;
    waveSurfer.duration = 60;
    waveSurfer.handlers.ready();
    tick();

    expect(service.loadingAudioFile).toBe(false);
    expect(service.duration).toBe('01:00.000');
    expect(service.getEndMillis()).toBe(60000);
    expect(service.peaks.length).toBe(TimelineService.peaksPerSecond);
    expect(service.currentTime).toBe('00:00.000');
    expect(ready).toHaveBeenCalled();
  }));

  it('plays and pauses the song, Rocket Show along with it', fakeAsync(() => {
    load();
    waveSurfer.currentTime = 2.5;

    service.play();
    expect(waveSurfer.play).toHaveBeenCalled();
    expect(service.playState).toBe('playing');
    expect(livePreviewService.previewLive).toHaveBeenCalledWith('Rock & Roll', 2500);

    service.pause();
    expect(waveSurfer.pause).toHaveBeenCalled();
    expect(service.playState).toBe('paused');
    expect(livePreviewService.stopPreviewPlay).toHaveBeenCalled();
  }));

  it('does not play a song which has not been read yet', fakeAsync(() => {
    service.selectCompositionIndex(0);
    tick();

    service.play();
    service.seekToMillis(1000);

    expect(waveSurfer.play).not.toHaveBeenCalled();
    expect(waveSurfer.seekTo).not.toHaveBeenCalled();
    expect(service.playState).not.toBe('playing');
  }));

  it('jumps within the song only', fakeAsync(() => {
    load();

    service.seekToMillis(15000);
    expect(waveSurfer.seekTo).toHaveBeenCalledWith(0.25);
    expect(livePreviewService.previewLive).toHaveBeenCalledWith('Rock & Roll', 15000);

    service.seekToMillis(90000);
    expect(waveSurfer.seekTo).toHaveBeenCalledWith(1);
    service.seekToMillis(-5);
    expect(waveSurfer.seekTo).toHaveBeenCalledWith(0);

    waveSurfer.seekTo.calls.reset();
    service.rewind();
    expect(waveSurfer.seekTo).toHaveBeenCalledWith(0);
  }));

  it('shows the position while the song plays', fakeAsync(() => {
    load();
    const positions: number[] = [];
    service.positionChanged.subscribe((millis) => positions.push(millis));

    waveSurfer.currentTime = 1;
    waveSurfer.handlers.play();
    tick(0);
    waveSurfer.currentTime = 1.04;
    tick(40);
    waveSurfer.handlers.pause();
    tick(200);

    expect(positions).toEqual([1000, 1040, 1040]);
    expect(service.currentTime).toBe('00:01.040');

    waveSurfer.currentTime = 30;
    waveSurfer.handlers.seek();
    expect(service.currentTime).toBe('00:30.000');
  }));

  it('stops where the song ends', fakeAsync(() => {
    load();
    service.play();

    waveSurfer.currentTime = 60;
    waveSurfer.handlers.finish();

    expect(service.playState).toBe('paused');
    expect(livePreviewService.stopPreviewPlay).toHaveBeenCalled();
    expect(service.currentTime).toBe('01:00.000');
  }));

  it('runs on its own clock, once the song can not be read', fakeAsync(() => {
    service.selectCompositionIndex(0);
    tick();

    waveSurfer.handlers.error('not found');

    expect(service.audioFileError).toBe(true);
    expect(service.playsAudioFile()).toBe(false);
  }));

  it('puts a scene into the song only, at the grid', fakeAsync(() => {
    load();
    const sceneService = TestBed.inject(SceneService);
    sceneService.selectScenes([projectService.project.scenes[0]]);

    // near the end: the clip ends with the song
    waveSurfer.currentTime = 58.1;
    service.addRegion();
    const atTheEnd = service.selectedComposition.scenePlaybackRegions[0];
    expect([atTheEnd.startMillis, atTheEnd.endMillis]).toEqual([58000, 60000]);

    // past the end: it starts right before it
    waveSurfer.currentTime = 70;
    service.addRegion();
    const pastTheEnd = service.selectedComposition.scenePlaybackRegions[1];
    expect([pastTheEnd.startMillis, pastTheEnd.endMillis]).toEqual([60000 - TimelineService.minRegionMillis, 60000]);
  }));

  it('pauses the song right at a hold point, and plays it on from there with GO', fakeAsync(() => {
    let now = 0;
    spyOn(performance, 'now').and.callFake(() => now);
    projectService.project.compositions[0].markers.push(
      new CompositionMarker({ uuid: 'hold', name: 'Bridge', positionMillis: 2000, type: 'hold' })
    );
    load();

    service.play();
    waveSurfer.handlers.play();
    tick(0);
    waveSurfer.currentTime = 2.03;
    tick(40);

    expect(service.holding).toBe(true);
    expect(service.playState).toBe('playing');
    expect(waveSurfer.pause).toHaveBeenCalled();
    expect(waveSurfer.seekTo).toHaveBeenCalledWith(2000 / 60000);
    expect(service.getCurrentMillis()).toBeCloseTo(2000, 6);
    expect(livePreviewService.previewLive).toHaveBeenCalledWith('Rock & Roll', 2000);
    expect(livePreviewService.stopPreviewPlay).not.toHaveBeenCalled();

    // the song is paused, while the time held keeps growing
    waveSurfer.handlers.pause();
    now += 400;
    tick(40);
    expect(service.holds).toEqual([{ positionMillis: 2000, heldMillis: 400 }]);

    service.go();
    waveSurfer.currentTime = 2.5;
    tick(40);

    expect(waveSurfer.play).toHaveBeenCalledTimes(2);
    expect(service.holding).toBe(false);
    expect(service.currentTime).toBe('00:02.500');
    expect(service.holds).toEqual([{ positionMillis: 2000, heldMillis: 400 }]);

    service.pause();
  }));

  it('destroys the player of the song left', fakeAsync(() => {
    load();
    service.play();

    service.destroyWaveSurfer();

    expect(waveSurfer.destroy).toHaveBeenCalled();
    expect(service.waveSurfer).toBeUndefined();
    expect(service.playState).toBe('paused');
    expect(service.peaks.length).toBe(0);
  }));
});

// The hold points of a composition: the playback stops at each one it comes to and waits for GO there, while the
// effects and the steps of the clips spanning it run on (see getHeldMillis). The labels only mark a point in time.
describe('TimelineService holding at the hold points', () => {
  let service: TimelineService;
  let projectService: ProjectService;
  let previewLive: jasmine.Spy;
  let now: number;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    service = TestBed.inject(TimelineService);
    projectService = TestBed.inject(ProjectService);
    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');
    spyOn(TestBed.inject(LivePreviewService), 'stopPreviewPlay');

    now = 1000;
    spyOn(performance, 'now').and.callFake(() => now);

    projectService.project = new Project({
      scenes: [{ uuid: 'scene', name: 'Scene' }],
      compositions: [
        {
          uuid: 'composition',
          name: 'Song One',
          syncType: 'none',
          scenePlaybackRegions: [{ sceneUuid: 'scene', startMillis: 0, endMillis: 10000 }],
          markers: [
            { uuid: 'intro', name: 'Intro', positionMillis: 1000, type: 'label' },
            { uuid: 'verse', name: 'Verse', positionMillis: 3000, type: 'hold' },
            { uuid: 'chorus', name: 'Chorus', positionMillis: 6000, type: 'hold' },
          ],
        },
      ],
    });

    service.selectCompositionIndex(0);
  });

  afterEach(() => {
    service.destroyWaveSurfer();
  });

  // the clock moves on, and the playback follows it (as it does every few frames while it plays)
  function run(millis: number) {
    now += millis;
    (service as any).followPlayback();
  }

  it('passes the labels, and stops at a hold point, right on it', () => {
    service.play();
    run(2000);
    expect(service.holding).toBe(false);
    expect(service.getCurrentMillis()).toBe(2000);

    run(1040);

    expect(service.holding).toBe(true);
    expect(service.heldMarker.name).toBe('Verse');
    expect(service.playState).toBe('playing');
    expect(service.getCurrentMillis()).toBe(3000);
    expect(service.currentTime).toBe('00:03.000');
    expect(service.holds).toEqual([{ positionMillis: 3000, heldMillis: 0 }]);
  });

  it('keeps the position while it holds, and the time held growing', () => {
    service.play();
    run(3040);

    run(5000);
    expect(service.getCurrentMillis()).toBe(3000);
    expect(service.holds).toEqual([{ positionMillis: 3000, heldMillis: 5000 }]);

    // the preview asks for it in each frame it draws
    now += 16;
    service.updateHeldMillis();
    expect(service.holds[0].heldMillis).toBe(5016);
  });

  it('goes on from the hold point with GO, the time held staying as long as it has been', () => {
    service.play();
    run(3040);
    run(5000);

    service.go();
    run(1000);

    expect(service.holding).toBe(false);
    expect(service.heldMarker).toBeUndefined();
    expect(service.getCurrentMillis()).toBe(4000);
    expect(service.holds).toEqual([{ positionMillis: 3000, heldMillis: 5000 }]);
  });

  it('takes play for GO while it holds', () => {
    service.play();
    run(3040);

    service.play();
    run(500);

    expect(service.holding).toBe(false);
    expect(service.getCurrentMillis()).toBe(3500);
  });

  it('holds at each hold point it comes to, also at two passed between two updates', () => {
    projectService.project.compositions[0].markers[2].positionMillis = 3020;

    service.play();
    run(3100);
    expect(service.heldMarker.name).toBe('Verse');

    run(1000);
    service.go();
    run(40);

    expect(service.heldMarker.name).toBe('Chorus');
    expect(service.getCurrentMillis()).toBe(3020);
    expect(service.holds).toEqual([
      { positionMillis: 3000, heldMillis: 1000 },
      { positionMillis: 3020, heldMillis: 0 },
    ]);
  });

  it('does not hold at a hold point it is started from', () => {
    service.seekToMillis(3000);

    service.play();
    run(500);

    expect(service.holding).toBe(false);
    expect(service.getCurrentMillis()).toBe(3500);
  });

  it('does not hold at a hold point past the end', () => {
    projectService.project.compositions[0].markers[2].positionMillis = 12000;

    service.seekToMillis(4000);
    service.play();
    run(6040);
    (service as any).stopClockAtTheEnd();

    expect(service.holding).toBe(false);
    expect(service.playState).toBe('paused');
    expect(service.getCurrentMillis()).toBe(10000);
  });

  it('keeps the holds when it is paused and played on, and starts over when it is played from the start', () => {
    service.play();
    run(3040);
    run(2000);
    service.go();
    run(500);

    service.pause();
    service.play();
    run(100);
    expect(service.holds).toEqual([{ positionMillis: 3000, heldMillis: 2000 }]);

    service.rewind();
    expect(service.holds).toEqual([]);

    service.play();
    run(3040);
    expect(service.holds).toEqual([{ positionMillis: 3000, heldMillis: 0 }]);
  });

  it('stops holding when it is paused, with the time held so far', () => {
    service.play();
    run(3040);
    run(1500);

    service.pause();
    run(1000);

    expect(service.holding).toBe(false);
    expect(service.playState).toBe('paused');
    expect(service.getCurrentMillis()).toBe(3000);
    expect(service.holds).toEqual([{ positionMillis: 3000, heldMillis: 1500 }]);

    // played on from the hold point, it does not hold there again
    service.play();
    run(500);
    expect(service.holding).toBe(false);
    expect(service.getCurrentMillis()).toBe(3500);
  });

  it('starts over when it is moved, and stands where it has been moved to, if it held', () => {
    service.play();
    run(1000);
    service.seekToMillis(2900);
    run(140);
    expect(service.holding).toBe(true);

    service.seekToMillis(5000);
    run(1000);

    expect(service.holding).toBe(false);
    expect(service.playState).toBe('paused');
    expect(service.getCurrentMillis()).toBe(5000);
    expect(service.holds).toEqual([]);
  });

  it('starts over with another composition', () => {
    service.play();
    run(3040);

    service.selectCompositionIndex(0);

    expect(service.holding).toBe(false);
    expect(service.holds).toEqual([]);
  });

  it('lets the live preview hold along with it', () => {
    const project = projectService.project;

    service.play();
    expect(project.previewHolding).toBe(false);

    previewLive.calls.reset();
    run(3040);
    expect(project.previewHolding).toBe(true);
    expect(project.previewHolds).toEqual([{ positionMillis: 3000, heldMillis: 0 }]);
    expect(previewLive.calls.allArgs()).toEqual([['Song One', 3000]]);

    previewLive.calls.reset();
    run(2500);
    service.go();
    expect(project.previewHolding).toBe(false);
    expect(project.previewHolds).toEqual([{ positionMillis: 3000, heldMillis: 2500 }]);
    expect(previewLive.calls.allArgs()).toEqual([['Song One', 3000]]);

    service.rewind();
    expect(project.previewHolds).toEqual([]);
  });

  it('never opens a project holding, or with the holds of another one', () => {
    const project = projectService.project;
    service.play();
    run(3040);

    const opened = new Project(JSON.parse(JSON.stringify(project)));

    expect(opened.previewHolding).toBe(false);
    expect(opened.previewHolds).toEqual([]);
  });
});

// The markers of a composition: labels and hold points, put where the playback is and moved along the time
describe('TimelineService editing the markers', () => {
  let service: TimelineService;
  let projectService: ProjectService;
  let previewLive: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    service = TestBed.inject(TimelineService);
    projectService = TestBed.inject(ProjectService);
    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    projectService.project = new Project({
      scenes: [{ uuid: 'scene', name: 'Scene' }],
      compositions: [
        {
          uuid: 'composition',
          name: 'Song One',
          syncType: 'none',
          gridType: 'musical',
          beatsPerMinute: 120,
          gridResolution: 1,
          gridOffsetMillis: 0,
          snapToGrid: true,
          scenePlaybackRegions: [{ sceneUuid: 'scene', startMillis: 0, endMillis: 10000 }],
        },
      ],
    });

    service.selectCompositionIndex(0);
  });

  afterEach(() => {
    service.destroyWaveSurfer();
  });

  const markers = () => service.selectedComposition.markers;

  it('puts a label or a hold point where the playback is, on the grid, numbered on and selected', () => {
    service.seekToMillis(4200);
    previewLive.calls.reset();

    const label = service.addMarker('label', 'Label');
    const hold = service.addMarker('hold', 'Hold');
    service.seekToMillis(6000);
    const secondHold = service.addMarker('hold', 'Hold');

    expect(markers().map((marker) => [marker.name, marker.type, marker.positionMillis])).toEqual([
      ['Label 1', 'label', 4000],
      ['Hold 1', 'hold', 4000],
      ['Hold 2', 'hold', 6000],
    ]);
    expect(label.uuid).toBeTruthy();
    expect(hold.uuid).not.toBe(label.uuid);
    expect(service.selectedMarker).toBe(secondHold);
    expect(previewLive).toHaveBeenCalled();
  });

  it('selects the marker of the kind which is there already, instead of putting another one there', () => {
    const first = service.addMarker('hold', 'Hold');
    service.selectMarker(undefined);

    expect(service.addMarker('hold', 'Hold')).toBe(first);
    expect(markers().length).toBe(1);
    expect(service.selectedMarker).toBe(first);
  });

  it('selects either a marker or a clip', () => {
    const marker = service.addMarker('label', 'Label');
    const region = service.selectedComposition.scenePlaybackRegions[0];

    service.selectRegion(region);
    expect(service.selectedMarker).toBeUndefined();

    service.selectMarker(marker);
    expect(service.selectedMarker).toBe(marker);
    expect(service.selectedPlaybackRegion).toBeUndefined();
  });

  it('keeps a marker selected through an undo, which puts back another object of it', () => {
    const marker = service.addMarker('label', 'Label');

    service.selectedComposition.markers = [new CompositionMarker(JSON.parse(JSON.stringify(marker)))];

    expect(service.selectedMarker).toBe(service.selectedComposition.markers[0]);
  });

  it('moves a marker onto the grid, not before the start', () => {
    const marker = service.addMarker('label', 'Label');

    service.moveMarker(marker, 7340);
    expect(marker.positionMillis).toBe(7500);

    service.moveMarker(marker, -800);
    expect(marker.positionMillis).toBe(0);
  });

  it('removes a marker, and forgets it was selected', () => {
    const marker = service.addMarker('hold', 'Hold');
    previewLive.calls.reset();

    service.removeMarker(marker);

    expect(markers()).toEqual([]);
    expect(service.selectedMarker).toBeUndefined();
    expect(service.selectedMarkerUuid).toBeUndefined();
    expect(previewLive).toHaveBeenCalled();
  });

  it('forgets the selected marker with another composition', () => {
    service.addMarker('hold', 'Hold');

    service.selectCompositionIndex(0);

    expect(service.selectedMarkerUuid).toBeUndefined();
  });
});

// Tracks and clips: the scenes are put on the tracks of the composition.
describe('TimelineService editing the tracks and the clips', () => {
  let service: TimelineService;
  let projectService: ProjectService;
  let sceneService: SceneService;
  let previewLive: jasmine.Spy;
  let composition: Composition;
  let changes: number;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    service = TestBed.inject(TimelineService);
    projectService = TestBed.inject(ProjectService);
    sceneService = TestBed.inject(SceneService);
    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');
    spyOn(service, 'createWaveSurfer');

    projectService.project = new Project({
      scenes: [
        { uuid: 'verse', name: 'Verse' },
        { uuid: 'chorus', name: 'Chorus' },
      ],
      compositions: [
        {
          uuid: 'song',
          name: 'Song',
          syncType: 'none',
          beatsPerMinute: 120,
          timeSignatureUpper: 4,
          snapToGrid: true,
          gridResolution: 1,
          gridOffsetMillis: 100,
          tracks: [{ uuid: 'top', name: 'Top' }],
          scenePlaybackRegions: [{ sceneUuid: 'verse', trackUuid: 'top', startMillis: 0, endMillis: 4000 }],
        },
        { uuid: 'other', name: 'Other' },
      ],
    });
    service.selectCompositionIndex(0);
    composition = service.selectedComposition;

    changes = 0;
    service.detectChanges.subscribe(() => changes++);
  });

  function region(index: number): ScenePlaybackRegion {
    return composition.scenePlaybackRegions[index];
  }

  it('selects a composition with the first of its tracks', () => {
    expect(projectService.project.selectedCompositionUuid).toBe('song');
    expect(service.selectedTrackUuid).toBe('top');
    expect(service.zoom).toBe(0);
  });

  it('snaps to the beats of the grid, from its offset', () => {
    // a beat at 120 bpm lasts 500 ms
    expect(service.snapMillis(1320)).toBe(1100);
    expect(service.snapMillis(1380)).toBe(1600);

    composition.gridResolution = 2;
    expect(service.snapMillis(1380)).toBe(1350);

    composition.snapToGrid = false;
    expect(service.snapMillis(1380.4)).toBe(1380);
  });

  it('zooms in up to 200 pixels per second', () => {
    service.applyZoom(50);
    expect(service.zoom).toBe(50);

    service.applyZoom(201);
    service.applyZoom(-1);
    expect(service.zoom).toBe(50);
    expect(changes).toBe(1);
  });

  it('adds a track at the bottom or where it is asked for', () => {
    const bottom = service.addTrack();
    const between = service.addTrack(1, 'Lights');

    expect(composition.tracks.map((track) => track.name)).toEqual(['Top', 'Lights', bottom.name]);
    expect(service.selectedTrackUuid).toBe(between.uuid);
    expect(service.getTrack(between.uuid)).toBe(between);

    service.addTrack(99);
    expect(composition.tracks.length).toBe(4);
  });

  it('removes a track with the clips on it', () => {
    service.selectRegion(region(0));
    const kept = service.addTrack();

    service.removeTrack(service.getTrack('top'));

    expect(composition.tracks).toEqual([kept]);
    expect(composition.scenePlaybackRegions).toEqual([]);
    expect(service.selectedPlaybackRegion).toBeUndefined();
    expect(service.selectedTrackUuid).toBe(kept.uuid);
    expect(previewLive).toHaveBeenCalled();

    // one which is not there anymore changes nothing
    previewLive.calls.reset();
    service.removeTrack(new Track({ uuid: 'gone' }));
    expect(previewLive).not.toHaveBeenCalled();
  });

  it('selects a clip together with its scene and its track', () => {
    const lower = service.addTrack();
    composition.scenePlaybackRegions.push(
      new ScenePlaybackRegion({ sceneUuid: 'chorus', trackUuid: lower.uuid, startMillis: 0, endMillis: 1000 })
    );
    service.selectTrack(service.getTrack('top'));

    service.selectRegion(region(1));

    expect(service.selectedPlaybackRegion).toBe(region(1));
    expect(service.selectedTrackUuid).toBe(lower.uuid);
    expect(sceneService.selectedScenes.map((scene) => scene.uuid)).toEqual(['chorus']);
  });

  it('puts the selected scene behind the one on the track, or on a new track below', () => {
    sceneService.selectScenes([sceneService.getSceneByUuid('chorus')]);
    service.selectTrack(service.getTrack('top'));

    // the verse is in the way: onto a track of its own, four bars long
    service.seekToMillis(1000);
    service.addRegion();
    const added = service.selectedPlaybackRegion;
    expect(composition.tracks.map((track) => track.name)).toEqual(['Top', 'Chorus']);
    expect([added.trackUuid, added.startMillis, added.endMillis]).toEqual([composition.tracks[1].uuid, 1100, 1100 + 8000]);

    // after the verse on the top track, until the clip which follows it
    composition.scenePlaybackRegions.push(
      new ScenePlaybackRegion({ sceneUuid: 'verse', trackUuid: 'top', startMillis: 6000, endMillis: 8000 })
    );
    service.selectTrack(service.getTrack('top'));
    service.seekToMillis(4100);
    service.addRegion();
    expect([
      service.selectedPlaybackRegion.trackUuid,
      service.selectedPlaybackRegion.startMillis,
      service.selectedPlaybackRegion.endMillis,
    ]).toEqual(['top', 4100, 6000]);
  });

  it('puts nothing on the tracks unless exactly one scene is selected', () => {
    sceneService.selectScenes([]);
    service.addRegion();

    sceneService.selectScenes(projectService.project.scenes);
    service.addRegion();

    expect(composition.scenePlaybackRegions.length).toBe(1);
  });

  it('removes the selected clip', () => {
    service.removeRegion();
    expect(composition.scenePlaybackRegions.length).toBe(1);

    service.selectRegion(region(0));
    service.removeRegion();

    expect(composition.scenePlaybackRegions).toEqual([]);
    expect(service.selectedPlaybackRegion).toBeUndefined();
    expect(previewLive).toHaveBeenCalled();
  });

  it('shows a changed clip in the preview', () => {
    service.updateSelectedRegion();
    service.updateGrid();

    expect(previewLive).toHaveBeenCalledTimes(1);
    expect(changes).toBe(2);
  });

  it('forgets a selected clip which is not in the composition anymore, e.g. after an undo', () => {
    service.selectRegion(region(0));
    composition.scenePlaybackRegions = [new ScenePlaybackRegion({ sceneUuid: 'verse', startMillis: 0, endMillis: 1000 })];

    service.redrawAllRegions();

    expect(service.selectedPlaybackRegion).toBeUndefined();
    // the clip without a track got one
    expect(region(0).trackUuid).toBeTruthy();
  });

  it('forgets the selected clip once another preset is previewed', () => {
    service.selectRegion(region(0));

    TestBed.inject(PresetService).previewSelectionChanged.next();

    expect(service.selectedPlaybackRegion).toBeUndefined();
  });

  it('selects the first composition left, once one is deleted', () => {
    service.deleteSelectedComposition();

    expect(projectService.project.compositions.map((left) => left.uuid)).toEqual(['other']);
    expect(service.selectedComposition.uuid).toBe('other');
    expect(service.selectedCompositionIndex).toBe(0);

    service.deleteSelectedComposition();
    expect(service.selectedComposition).toBeUndefined();
  });
});

describe('TimelineService with the compositions of Rocket Show', () => {
  let service: TimelineService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    service = TestBed.inject(TimelineService);
    http = TestBed.inject(HttpTestingController);
    spyOn(service, 'createWaveSurfer');
    TestBed.inject(ProjectService).project = new Project({ compositions: [{ uuid: 'song', name: 'Song' }] });
    service.externalCompositionsAvailable = true;
  });

  afterEach(() => {
    http.verify();
  });

  it('lists the names of the compositions of Rocket Show', () => {
    let names: string[];

    service.getExternalCompositionNames().subscribe((result) => (names = result));
    http.expectOne('composition/list').flush([{ name: 'One' }, { name: 'Two' }]);

    expect(names).toEqual(['One', 'Two']);
  });

  it('shows nothing of Rocket Show, if it cannot tell', () => {
    spyOn(console, 'error');

    service.selectCompositionIndex(0);
    http.expectOne('composition?name=Song').flush(null, { status: 500, statusText: 'Server Error' });

    expect(service.externalComposition).toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('asks only for the composition selected last', () => {
    service.selectCompositionIndex(0);
    const first = http.expectOne('composition?name=Song');

    service.selectCompositionIndex(0);
    const second = http.expectOne('composition?name=Song');

    expect(first.cancelled).toBe(true);
    second.flush({ name: 'Song', durationMillis: 1000, actionTriggerList: [] });
    expect(service.externalComposition.durationMillis).toBe(1000);
  });
});
