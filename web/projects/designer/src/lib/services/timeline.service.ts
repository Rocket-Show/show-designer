import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { Observable, Subject, Subscription, timer } from 'rxjs';
import { map } from 'rxjs/operators';
import WaveSurfer from 'wavesurfer.js';
import { guess } from 'web-audio-beat-detector';
import { Composition } from '../models/composition';
import { PresetRegionScene } from '../models/preset-region-scene';
import { Scene } from '../models/scene';
import { ScenePlaybackRegion } from '../models/scene-playback-region';
import { assignTracks, createTrack, getFreeGap, getTrackRegions } from '../models/timeline-track';
import { Track } from '../models/track';
import { computePeaks } from '../models/waveform-peaks';
import { ConfigService } from './config.service';
import { PresetService } from './preset.service';
import { ProjectService } from './project.service';
import { SceneService } from './scene.service';
import { TimelineStateService } from './timeline-state.service';
import { LivePreviewService } from './live-preview.service';
import { UuidService } from './uuid.service';

@Injectable({
  providedIn: 'root',
})
export class TimelineService {
  // how finely the waveform is kept: enough for the closest zoom
  static readonly peaksPerSecond = 400;

  // the shortest clip, so that a click on a track does not leave an invisible one behind
  static readonly minRegionMillis = 100;

  // WaveSurfer loads, decodes and plays the audio file. The timeline draws the waveform,
  // the tracks and the clips on them itself.
  public waveSurfer: WaveSurfer;

  // the loudness of the audio file over time, see computePeaks
  public peaks: Float32Array = new Float32Array(0);

  // 0 = the whole song fits the width, otherwise pixels per second
  public zoom = 0;

  private timeUpdateSubscription: Subscription;
  public currentTime: string;
  public selectedPlaybackRegion: ScenePlaybackRegion;

  // the track a new clip is put on
  public selectedTrackUuid: string;

  public duration: string;
  public durationMillis = 0;
  public waveSurferReady: Subject<void> = new Subject();

  // the timeline has to be drawn again: the clips, the tracks or the grid changed
  public detectChanges: Subject<void> = new Subject();

  // the position of the playback moved (outside of the Angular zone while playing)
  public positionChanged: Subject<number> = new Subject();

  // can we add new compositions based on an external pool and
  // should new compositions not available in this pool be added there?
  public externalCompositionsAvailable = false;

  public loadingAudioFile = false;

  // could the audio file of the selected composition not be read? (it is missing, the
  // server did not hand it out or the browser cannot play it)
  public audioFileError = false;

  constructor(
    private sceneService: SceneService,
    private presetService: PresetService,
    private projectService: ProjectService,
    private http: HttpClient,
    private configService: ConfigService,
    private ngZone: NgZone,
    private timelineStateService: TimelineStateService,
    private livePreviewService: LivePreviewService,
    private uuidService: UuidService
  ) {
    this.presetService.previewSelectionChanged.subscribe(() => {
      this.selectedPlaybackRegion = undefined;
      this.detectChanges.next();
    });
    // the clips show the steps of the preset being edited, and are painted in the colors
    // of their scenes, which follow the presets played in them
    this.presetService.stepsChanged.subscribe(() => this.detectChanges.next());
    this.presetService.presetsChanged.subscribe(() => this.detectChanges.next());
    this.sceneService.sceneDeleted.subscribe(() => this.redrawAllRegions());
    this.sceneService.sceneSelected.subscribe(() => this.detectChanges.next());
    this.sceneService.scenesChanged.subscribe(() => this.detectChanges.next());
  }

  get playState(): string {
    return this.timelineStateService.playState;
  }

  set playState(playState: string) {
    this.timelineStateService.playState = playState;
  }

  get selectedComposition(): Composition {
    return this.timelineStateService.selectedComposition;
  }

  set selectedComposition(selectedComposition: Composition) {
    this.timelineStateService.selectedComposition = selectedComposition;
  }

  get selectedCompositionIndex(): number {
    return this.timelineStateService.selectedCompositionIndex;
  }

  set selectedCompositionIndex(selectedCompositionIndex: number) {
    this.timelineStateService.selectedCompositionIndex = selectedCompositionIndex;
  }

  // the composition has been replaced (e.g. by an undo): show what it holds now
  redrawAllRegions() {
    if (this.selectedComposition) {
      this.ensureTracks(this.selectedComposition);

      if (this.selectedPlaybackRegion && this.selectedComposition.scenePlaybackRegions.indexOf(this.selectedPlaybackRegion) < 0) {
        this.selectedPlaybackRegion = undefined;
      }
    }

    this.detectChanges.next();
  }

  private pad(num: number, size: number): string {
    if (!num) {
      num = 0;
    }

    let padded: string = num.toString();
    while (padded.length < size) {
      padded = '0' + padded;
    }

    return padded;
  }

  msToTime(millis: number, includeMillis: boolean = true): string {
    const ms: number = Math.round(millis % 1000);
    const seconds: number = Math.floor(((millis % 360000) % 60000) / 1000);
    const minutes: number = Math.floor((millis % 3600000) / 60000);

    if (includeMillis) {
      return this.pad(minutes, 2) + ':' + this.pad(seconds, 2) + '.' + this.pad(ms, 3);
    } else {
      return this.pad(minutes, 2) + ':' + this.pad(seconds, 2);
    }
  }

  getCurrentMillis(): number {
    if (!this.waveSurfer) {
      return 0;
    }

    return this.waveSurfer.getCurrentTime() * 1000;
  }

  private updateCurrentTime() {
    if (!this.waveSurfer) {
      return;
    }

    const millis = this.getCurrentMillis();
    this.currentTime = this.msToTime(millis);
    this.positionChanged.next(millis);
  }

  private startTimeUpdater() {
    this.stopTimeUpdater();

    // Avoid triggering change detection with each animation frame -> run outside zone
    this.ngZone.runOutsideAngular(() => {
      const timeUpdater = timer(0, 40);
      this.timeUpdateSubscription = timeUpdater.subscribe(() => {
        this.updateCurrentTime();
      });
    });
  }

  private stopTimeUpdater() {
    if (this.timeUpdateSubscription) {
      this.timeUpdateSubscription.unsubscribe();
    }
  }

  // jump to a point in time of the song, e.g. when the ruler is clicked
  seekToMillis(millis: number) {
    if (!this.isWaveSurferReady() || !this.durationMillis) {
      return;
    }

    const progress = Math.min(1, Math.max(0, millis / this.durationMillis));

    this.waveSurfer.seekTo(progress);
    this.livePreviewService.previewLive(this.selectedComposition.name, Math.round(progress * this.durationMillis));
  }

  applyZoom(zoom: any) {
    if (zoom < 0 || zoom > 200) {
      return;
    }

    this.zoom = zoom;
    this.detectChanges.next();
  }

  private isWaveSurferReady(): boolean {
    if (!this.waveSurfer) {
      return false;
    }

    if (!this.waveSurfer.isReady) {
      return false;
    }

    return true;
  }

  // ---- grid -----------------------------------------------------------------

  private getSnapToGridInterval(): number {
    if (this.selectedComposition.snapToGrid) {
      return 60 / this.selectedComposition.beatsPerMinute / this.selectedComposition.gridResolution;
    }

    return undefined;
  }

  private getSnapToGridOffset(): number {
    return this.selectedComposition.gridOffsetMillis / 1000;
  }

  // the point in time on the grid closest to the passed one, if the clips snap to the grid
  snapMillis(millis: number): number {
    const interval = this.selectedComposition ? this.getSnapToGridInterval() : undefined;

    if (!interval) {
      return Math.round(millis);
    }

    const offset = (this.getSnapToGridOffset() || 0) * 1000;
    const intervalMillis = interval * 1000;

    return Math.round(Math.round((millis - offset) / intervalMillis) * intervalMillis + offset);
  }

  // the length of a clip which is put on a track without being drawn: four bars
  private getDefaultRegionMillis(): number {
    const composition = this.selectedComposition;

    return (4 * (composition.timeSignatureUpper || 4) * 60000) / (composition.beatsPerMinute || 120);
  }

  updateGrid() {
    this.detectChanges.next();
  }

  // ---- tracks ---------------------------------------------------------------

  // every clip of the composition is on one of its tracks, and there is at least one
  // track to put a scene on
  private ensureTracks(composition: Composition) {
    assignTracks(composition, this.projectService.project.scenes, () => this.uuidService.getUuid());

    if (!composition.tracks.some((track) => track.uuid === this.selectedTrackUuid)) {
      this.selectedTrackUuid = composition.tracks[0].uuid;
    }
  }

  getTrack(uuid: string): Track {
    return this.selectedComposition ? this.selectedComposition.tracks.find((track) => track.uuid === uuid) : undefined;
  }

  // add a track at the passed position (at the bottom, if none is passed)
  addTrack(index?: number): Track {
    const composition = this.selectedComposition;
    const track = createTrack(composition, this.uuidService.getUuid());

    if (index === undefined || index < 0 || index > composition.tracks.length) {
      composition.tracks.push(track);
    } else {
      composition.tracks.splice(index, 0, track);
    }

    this.selectedTrackUuid = track.uuid;
    this.detectChanges.next();

    return track;
  }

  // remove a track together with the scenes played on it
  removeTrack(track: Track) {
    const composition = this.selectedComposition;
    const index = composition.tracks.indexOf(track);

    if (index < 0) {
      return;
    }

    composition.tracks.splice(index, 1);
    composition.scenePlaybackRegions = composition.scenePlaybackRegions.filter((region) => region.trackUuid !== track.uuid);

    if (this.selectedPlaybackRegion && this.selectedPlaybackRegion.trackUuid === track.uuid) {
      this.selectedPlaybackRegion = undefined;
    }

    this.ensureTracks(composition);
    this.detectChanges.next();
    this.livePreviewService.previewLive();
  }

  // move a track up (-1) or down (+1): the one higher up is on top
  moveTrack(track: Track, delta: number) {
    const tracks = this.selectedComposition.tracks;
    const index = tracks.indexOf(track);
    const target = index + delta;

    if (index < 0 || target < 0 || target >= tracks.length) {
      return;
    }

    tracks.splice(index, 1);
    tracks.splice(target, 0, track);
    this.detectChanges.next();
    this.livePreviewService.previewLive();
  }

  selectTrack(track: Track) {
    this.selectedTrackUuid = track.uuid;
    this.detectChanges.next();
  }

  // ---- clips ----------------------------------------------------------------

  // select a clip, and the scene played in it with it
  selectRegion(region: ScenePlaybackRegion) {
    const scene = this.sceneService.getSceneByUuid(region.sceneUuid);

    if (scene && !(this.sceneService.selectedScenes.length === 1 && this.sceneService.selectedScenes[0] === scene)) {
      // forgets the selected clip -> select it afterwards
      this.sceneService.selectScenes([scene]);
    }

    this.selectedPlaybackRegion = region;
    this.selectedTrackUuid = region.trackUuid;
    this.detectChanges.next();
  }

  // put a scene on a track. The caller makes sure the time is still free there.
  createRegion(track: Track, scene: Scene, startMillis: number, endMillis: number): ScenePlaybackRegion {
    const region = new ScenePlaybackRegion();
    region.sceneUuid = scene.uuid;
    region.trackUuid = track.uuid;
    region.startMillis = Math.round(startMillis);
    region.endMillis = Math.round(endMillis);

    this.selectedComposition.scenePlaybackRegions.push(region);
    this.selectRegion(region);
    this.livePreviewService.previewLive();

    return region;
  }

  // a clip has been moved or resized
  regionChanged() {
    this.detectChanges.next();
    this.livePreviewService.previewLive();
  }

  // Put the selected scene on the selected track, at the position of the playback. If
  // another scene plays there already, it goes onto a new track right below.
  addRegion() {
    if (!this.isWaveSurferReady() || !this.selectedComposition) {
      return;
    }

    if (!this.sceneService.selectedScenes || this.sceneService.selectedScenes.length !== 1) {
      return;
    }

    const composition = this.selectedComposition;
    this.ensureTracks(composition);

    let track = this.getTrack(this.selectedTrackUuid);
    const startMillis = Math.max(
      0,
      Math.min(this.snapMillis(this.getCurrentMillis()), this.durationMillis - TimelineService.minRegionMillis)
    );
    let gap = getFreeGap(composition, track.uuid, startMillis);

    if (!gap || gap.endMillis - startMillis < TimelineService.minRegionMillis) {
      track = this.addTrack(composition.tracks.indexOf(track) + 1);
      gap = { startMillis: 0, endMillis: Infinity };
    }

    const endMillis = Math.min(startMillis + this.getDefaultRegionMillis(), gap.endMillis, this.durationMillis);

    this.createRegion(track, this.sceneService.selectedScenes[0], startMillis, endMillis);
  }

  removeRegion() {
    if (!this.selectedPlaybackRegion) {
      return;
    }

    const regions = this.selectedComposition.scenePlaybackRegions;
    const index = regions.indexOf(this.selectedPlaybackRegion);

    if (index >= 0) {
      regions.splice(index, 1);
    }

    this.selectedPlaybackRegion = undefined;
    this.detectChanges.next();
    this.livePreviewService.previewLive();
  }

  // the start or the end of the selected clip has been typed in
  updateSelectedRegion() {
    this.regionChanged();
  }

  // ---- playback -------------------------------------------------------------

  getPresetsInTime(timeMillis: number): PresetRegionScene[] {
    // Return all presets which should be active during the specified time, the ones at
    // the bottom first: the ones processed later overwrite them
    const activePresets: PresetRegionScene[] = [];
    const composition = this.selectedComposition;

    // the tracks are layered like the presets inside a scene: the topmost one is
    // processed last, so it overwrites the ones below it. On a track, a clip fading out
    // past its end lies below the one following it.
    for (let trackIndex = composition.tracks.length - 1; trackIndex >= 0; trackIndex--) {
      for (const region of getTrackRegions(composition, composition.tracks[trackIndex].uuid)) {
        const scene = this.sceneService.getSceneByUuid(region.sceneUuid);

        if (!scene) {
          continue;
        }

        // the presets are ordered inside their scene: the first one is the topmost
        // layer -> process it last, so it overwrites the ones below it
        const scenePresets = this.sceneService.getScenePresets(scene);

        for (let presetIndex = scenePresets.length - 1; presetIndex >= 0; presetIndex--) {
          const preset = scenePresets[presetIndex];

          let presetStartMillis = preset.startMillis === undefined ? region.startMillis : region.startMillis + preset.startMillis;
          let presetEndMillis = preset.endMillis === undefined ? region.endMillis : region.startMillis + preset.endMillis;

          // extend the running time, if fading is done outside the boundaries
          presetStartMillis -= preset.fadeInPre ? preset.fadeInMillis : 0;
          presetEndMillis += preset.fadeOutPost ? preset.fadeOutMillis : 0;

          if (presetStartMillis <= timeMillis && presetEndMillis >= timeMillis) {
            activePresets.push(new PresetRegionScene(preset, region, scene));
          }
        }
      }
    }

    return activePresets;
  }

  // ---- compositions and the audio file --------------------------------------

  deleteSelectedComposition() {
    this.projectService.project.compositions.splice(this.selectedCompositionIndex, 1);
    this.selectedComposition = undefined;
    this.selectedCompositionIndex = undefined;
    this.destroyWaveSurfer();
    if (this.projectService.project.compositions.length > 0) {
      this.selectCompositionIndex(0);
    }
  }

  // the audio file of the selected composition could not be read: it is missing, the
  // server did not hand it out or the browser cannot play it. The composition itself is
  // kept - it carries the scenes played over the song, which is the work of the show and
  // not the file's to take with it. Say that the file is the part which is missing, so
  // that another one can be picked in the composition settings instead.
  private audioFileLoadFailed(error: any) {
    console.error('Could not load the audio file of the composition', error);

    this.audioFileError = true;
    this.loadingAudioFile = false;
    this.detectChanges.next();
  }

  destroyWaveSurfer() {
    this.stopTimeUpdater();
    this.duration = undefined;
    this.durationMillis = 0;
    this.peaks = new Float32Array(0);
    this.loadingAudioFile = false;
    this.audioFileError = false;

    if (this.waveSurfer) {
      this.waveSurfer.destroy();
      this.waveSurfer = undefined;
    }
  }

  createWaveSurfer() {
    this.destroyWaveSurfer();

    if (!this.selectedComposition.audioFileName) {
      return;
    }

    this.loadingAudioFile = true;

    setTimeout(() => {
      // the container is hidden: only the audio is used, the timeline draws the waveform
      this.waveSurfer = WaveSurfer.create({
        container: '#waveform',
        height: 1,
        interact: false,
        cursorWidth: 0,
        xhr: {
          credentials: 'include',
        },
      });

      let audioFileName: string;

      if (this.configService.enableMediaLibrary) {
        // the file name is also used for the real file name
        audioFileName = 'file/get?name=' + this.selectedComposition.audioFileName + '&type=AUDIO';
      } else {
        // the composition uuid and extension is used as the file name
        audioFileName =
          'composition-files/?file=' +
          this.selectedComposition.uuid +
          '.' +
          this.selectedComposition.audioFileName.substr(this.selectedComposition.audioFileName.lastIndexOf('.') + 1);
      }

      this.waveSurfer.load(this.configService.restUrl + audioFileName);

      this.waveSurfer.on('ready', () => {
        setTimeout(() => {
          // try guessing the bpm and offset from the file, if necessary
          if (this.selectedComposition.tempoGuessed) {
            // we already guessed the BPM of this file --> don't do it again
            this.loadingAudioFile = false;
          } else {
            // we have not yet guessed the BPM --> do it now
            this.selectedComposition.tempoGuessed = true;
            guess(this.waveSurfer.backend.buffer)
              .then(({ bpm, offset }) => {
                // the bpm and offset could be guessed
                this.selectedComposition.beatsPerMinute = bpm;
                this.selectedComposition.gridOffsetMillis = offset * 1000;
                this.loadingAudioFile = false;
                this.detectChanges.next();
              })
              .catch((err) => {
                // something went wrong
                console.error('Could not detect the BPM from the audio file', err);
                this.loadingAudioFile = false;
                this.detectChanges.next();
              });
          }

          this.durationMillis = this.waveSurfer.getDuration() * 1000;
          this.duration = this.msToTime(this.durationMillis);
          this.peaks = computePeaks(this.waveSurfer.backend.buffer, TimelineService.peaksPerSecond);

          this.updateCurrentTime();

          this.detectChanges.next();
          this.waveSurferReady.next();
        }, 0);
      });

      this.waveSurfer.on('error', (error: any) => {
        this.audioFileLoadFailed(error);
      });

      this.waveSurfer.on('seek', () => {
        this.updateCurrentTime();
      });

      this.waveSurfer.on('play', () => {
        this.startTimeUpdater();
      });

      this.waveSurfer.on('pause', () => {
        this.stopTimeUpdater();
        this.updateCurrentTime();
      });
    }, 0);
  }

  getExternalCompositionNames(): Observable<string[]> {
    // get available compositions from an external pool (e.g. Rocket Show)
    return this.http.get('composition/list').pipe(
      map((response: object[]) => {
        const compositionNames: string[] = [];

        for (const responseComposition of response) {
          compositionNames.push((responseComposition as any).name);
        }

        return compositionNames;
      })
    );
  }

  selectCompositionIndex(index: number) {
    this.selectedComposition = this.projectService.project.compositions[index];
    this.selectedCompositionIndex = index;
    this.projectService.project.selectedCompositionUuid = this.selectedComposition.uuid;
    this.selectedPlaybackRegion = undefined;
    this.ensureTracks(this.selectedComposition);
    this.createWaveSurfer();

    // required to trigger timeline.component.resize()
    this.waveSurferReady.next();

    this.applyZoom(0);
  }
}
