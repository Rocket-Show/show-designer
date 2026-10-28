import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { Observable, Subject, Subscription, timer } from 'rxjs';
import { map } from 'rxjs/operators';
import WaveSurfer from 'wavesurfer.js';
import { guess } from 'web-audio-beat-detector';
import { Composition } from '../models/composition';
import { ExternalComposition } from '../models/external-composition';
import { getPresetTimes, PresetRegionScene } from '../models/preset-region-scene';
import { Scene } from '../models/scene';
import { ScenePlaybackRegion } from '../models/scene-playback-region';
import { getClipsEndMillis } from '../models/timeline-length';
import { assignTracks, createTrack, getFreeGap, getPreviewTracks, getTrackRegions } from '../models/timeline-track';
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

  // Without an audio file the timeline runs on its own clock: the position it stands at,
  // and when it has been started from there (undefined while it stands still)
  private clockMillis = 0;
  private clockStartedAt: number;

  // the loudness of the audio file over time, see computePeaks
  public peaks: Float32Array = new Float32Array(0);

  // 0 = the whole song fits the width, otherwise pixels per second
  public zoom = 0;

  private timeUpdateSubscription: Subscription;
  public currentTime: string;
  public selectedPlaybackRegion: ScenePlaybackRegion;

  // the track a new clip is put on
  public selectedTrackUuid: string;

  // the length of the audio file (0 until it has been loaded)
  private audioDurationMillis = 0;
  public waveSurferReady: Subject<void> = new Subject();

  // the timeline has to be drawn again: the clips, the tracks or the grid changed
  public detectChanges: Subject<void> = new Subject();

  // the position of the playback moved (outside of the Angular zone while playing)
  public positionChanged: Subject<number> = new Subject();

  // can we add new compositions based on an external pool and
  // should new compositions not available in this pool be added there?
  public externalCompositionsAvailable = false;

  // the composition of the external pool (Rocket Show) the selected one plays along with,
  // if there is one: its actions are shown on the timeline
  public externalComposition: ExternalComposition;
  private externalCompositionSubscription: Subscription;

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

  // ---- the clock --------------------------------------------------------------

  // Does the timeline run along the audio file of the selected composition? Without one
  // (the composition is not synchronized to one, none has been picked or it could not be
  // read), it runs on its own clock.
  playsAudioFile(): boolean {
    const composition = this.selectedComposition;

    return !!composition && composition.syncType !== 'none' && !!composition.audioFileName && !this.audioFileError;
  }

  // Where the selected composition ends: with an audio file, where the song ends. Without
  // one, where its lights have gone out or where Rocket Show stops playing it (its files
  // and actions), whichever is later. A scene put past the end makes it longer.
  getEndMillis(): number {
    const composition = this.selectedComposition;

    if (!composition) {
      return 0;
    }

    if (this.playsAudioFile()) {
      return this.audioDurationMillis;
    }

    const external = this.externalComposition;
    const clipsEndMillis = getClipsEndMillis(
      composition,
      (uuid) => this.sceneService.getSceneByUuid(uuid),
      (scene) => this.sceneService.getScenePresets(scene)
    );

    return Math.max(clipsEndMillis, external ? Math.max(external.durationMillis, external.lastActionMillis) : 0);
  }

  // the length of the composition, as shown next to the position (none while the audio
  // file is still being loaded)
  get duration(): string {
    if (!this.selectedComposition || (this.playsAudioFile() && !this.audioDurationMillis)) {
      return undefined;
    }

    return this.msToTime(this.getEndMillis());
  }

  getCurrentMillis(): number {
    if (this.playsAudioFile()) {
      return this.waveSurfer ? this.waveSurfer.getCurrentTime() * 1000 : 0;
    }

    if (this.clockStartedAt === undefined) {
      return this.clockMillis;
    }

    return this.clockMillis + performance.now() - this.clockStartedAt;
  }

  private updateCurrentTime() {
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
        this.stopClockAtTheEnd();
      });
    });
  }

  private stopTimeUpdater() {
    if (this.timeUpdateSubscription) {
      this.timeUpdateSubscription.unsubscribe();
    }
  }

  // The own clock stops where the composition ends, like an audio file does. It stands
  // on the end then, unless it has been started (or moved) past it.
  private stopClockAtTheEnd() {
    if (this.playsAudioFile() || this.clockStartedAt === undefined) {
      return;
    }

    const endMillis = this.getEndMillis();

    if (this.getCurrentMillis() < endMillis) {
      return;
    }

    const fromMillis = this.clockMillis;

    this.ngZone.run(() => {
      this.pause();
      this.stopClock(Math.max(endMillis, fromMillis));
    });
  }

  // let the own clock stand still at the passed position
  private stopClock(millis: number) {
    this.clockMillis = millis;
    this.clockStartedAt = undefined;
    this.stopTimeUpdater();
    this.updateCurrentTime();
  }

  // jump to a point in time of the composition, e.g. when the ruler is clicked
  seekToMillis(millis: number) {
    if (!this.selectedComposition) {
      return;
    }

    if (this.playsAudioFile()) {
      if (!this.isWaveSurferReady() || !this.audioDurationMillis) {
        return;
      }

      const progress = Math.min(1, Math.max(0, millis / this.audioDurationMillis));

      this.waveSurfer.seekTo(progress);
      this.livePreviewService.previewLive(this.selectedComposition.name, Math.round(progress * this.audioDurationMillis));
      return;
    }

    this.clockMillis = Math.max(0, millis);

    if (this.clockStartedAt !== undefined) {
      this.clockStartedAt = performance.now();
    }

    this.updateCurrentTime();
    this.livePreviewService.previewLive(this.selectedComposition.name, Math.round(this.clockMillis));
  }

  // ---- playing ----------------------------------------------------------------

  play() {
    if (!this.selectedComposition || (this.playsAudioFile() && !this.isWaveSurferReady())) {
      return;
    }

    // at the end (or past it) -> play the composition from the start again
    if (!this.playsAudioFile() && this.clockMillis >= this.getEndMillis()) {
      this.clockMillis = 0;
    }

    this.playState = 'playing';
    this.livePreviewService.previewLive(this.selectedComposition.name, Math.round(this.getCurrentMillis()));

    if (this.playsAudioFile()) {
      this.waveSurfer.play();
      return;
    }

    this.clockStartedAt = performance.now();
    this.startTimeUpdater();
  }

  pause() {
    this.playState = 'paused';
    this.livePreviewService.stopPreviewPlay();

    if (this.playsAudioFile()) {
      if (this.waveSurfer) {
        this.waveSurfer.pause();
      }

      return;
    }

    this.stopClock(this.getCurrentMillis());
  }

  // stop and go back to the start
  rewind() {
    this.pause();

    if (this.playsAudioFile()) {
      if (this.isWaveSurferReady()) {
        this.waveSurfer.seekTo(0);
      }

      return;
    }

    this.stopClock(0);
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

  // every clip of the composition is on one of its tracks, and one of the tracks (if
  // there are any) is the one a new clip is put on
  private ensureTracks(composition: Composition) {
    assignTracks(composition, this.projectService.project.scenes, () => this.uuidService.getUuid());

    if (!composition.tracks.some((track) => track.uuid === this.selectedTrackUuid)) {
      this.selectedTrackUuid = composition.tracks.length > 0 ? composition.tracks[0].uuid : undefined;
    }
  }

  getTrack(uuid: string): Track {
    return this.selectedComposition ? this.selectedComposition.tracks.find((track) => track.uuid === uuid) : undefined;
  }

  // add a track at the passed position (at the bottom, if none is passed)
  addTrack(index?: number, name?: string): Track {
    const composition = this.selectedComposition;
    const track = createTrack(composition, this.uuidService.getUuid(), name);

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

  // Move a track to another place in the list: in front of the track at the passed index
  // as the list is now (or to the end). The one higher up is on top.
  moveTrack(track: Track, beforeIndex: number) {
    const tracks = this.selectedComposition.tracks;
    const index = tracks.indexOf(track);
    const target = beforeIndex > index ? beforeIndex - 1 : beforeIndex;

    if (index < 0 || target === index || target < 0 || target >= tracks.length) {
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

  // leave a track out of the preview, or show it again
  toggleTrackHidden(track: Track) {
    track.hidden = !track.hidden;
    this.detectChanges.next();
    this.livePreviewService.previewLive();
  }

  // play only the soloed tracks in the preview
  toggleTrackSolo(track: Track) {
    track.solo = !track.solo;
    this.detectChanges.next();
    this.livePreviewService.previewLive();
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
  // another scene plays there already, or there is no track yet, it goes onto a new one.
  addRegion() {
    if (!this.selectedComposition || (this.playsAudioFile() && !this.isWaveSurferReady())) {
      return;
    }

    if (!this.sceneService.selectedScenes || this.sceneService.selectedScenes.length !== 1) {
      return;
    }

    const composition = this.selectedComposition;
    this.ensureTracks(composition);

    const scene = this.sceneService.selectedScenes[0];
    let track = this.getTrack(this.selectedTrackUuid);

    // within the song, if there is one. Without, the composition gets longer.
    const limitMillis = this.playsAudioFile() ? this.audioDurationMillis : Infinity;
    const startMillis = Math.max(0, Math.min(this.snapMillis(this.getCurrentMillis()), limitMillis - TimelineService.minRegionMillis));
    let gap = track ? getFreeGap(composition, track.uuid, startMillis) : undefined;

    if (!gap || gap.endMillis - startMillis < TimelineService.minRegionMillis) {
      track = this.addTrack(track ? composition.tracks.indexOf(track) + 1 : undefined, scene.name);
      gap = { startMillis: 0, endMillis: Infinity };
    }

    const endMillis = Math.min(startMillis + this.getDefaultRegionMillis(), gap.endMillis, limitMillis);

    this.createRegion(track, scene, startMillis, endMillis);
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
    // past its end lies below the one following it. The designer is a preview: the
    // hidden tracks are left out, and only the soloed ones are played, if there are any.
    const tracks = getPreviewTracks(composition);

    for (let trackIndex = tracks.length - 1; trackIndex >= 0; trackIndex--) {
      for (const region of getTrackRegions(composition, tracks[trackIndex].uuid)) {
        const scene = this.sceneService.getSceneByUuid(region.sceneUuid);

        if (!scene) {
          continue;
        }

        // the presets are ordered inside their scene: the first one is the topmost
        // layer -> process it last, so it overwrites the ones below it
        const scenePresets = this.sceneService.getScenePresets(scene);

        for (let presetIndex = scenePresets.length - 1; presetIndex >= 0; presetIndex--) {
          const preset = scenePresets[presetIndex];

          // the fades running outside the boundaries (of the preset, or of the scene) included
          const presetTimes = getPresetTimes(preset, region, scene);

          if (presetTimes.startMillis <= timeMillis && presetTimes.endMillis >= timeMillis) {
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
    this.externalComposition = undefined;
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
    // what played belongs to the composition left: another one starts at its beginning
    if (this.playState === 'playing') {
      this.playState = 'paused';
      this.livePreviewService.stopPreviewPlay();
    }

    this.stopTimeUpdater();
    this.clockMillis = 0;
    this.clockStartedAt = undefined;
    this.audioDurationMillis = 0;
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

    if (!this.playsAudioFile()) {
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

          this.audioDurationMillis = this.waveSurfer.getDuration() * 1000;
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

      // the song has ended: the playback stops there
      this.waveSurfer.on('finish', () => {
        this.ngZone.run(() => {
          this.playState = 'paused';
          this.livePreviewService.stopPreviewPlay();
          this.stopTimeUpdater();
          this.updateCurrentTime();
        });
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

  // What Rocket Show plays along with the selected composition, if the designer runs in it:
  // the actions it fires are shown on the timeline to line the scenes up with, and the
  // composition lasts at least as long as its files and actions. Nothing is shown, if
  // there is no composition of that name (or Rocket Show cannot tell).
  private loadExternalComposition() {
    if (this.externalCompositionSubscription) {
      this.externalCompositionSubscription.unsubscribe();
    }

    this.externalComposition = undefined;

    const composition = this.selectedComposition;

    if (!this.externalCompositionsAvailable || !composition || !composition.name) {
      return;
    }

    this.externalCompositionSubscription = this.http.get('composition?name=' + encodeURIComponent(composition.name)).subscribe({
      next: (response) => {
        this.externalComposition = response ? new ExternalComposition(response) : undefined;
        this.detectChanges.next();
      },
      error: (error) => {
        console.error('Could not load the composition from Rocket Show', error);
      },
    });
  }

  selectCompositionIndex(index: number) {
    this.selectedComposition = this.projectService.project.compositions[index];
    this.selectedCompositionIndex = index;
    this.projectService.project.selectedCompositionUuid = this.selectedComposition.uuid;
    this.selectedPlaybackRegion = undefined;
    this.ensureTracks(this.selectedComposition);
    this.loadExternalComposition();
    this.createWaveSurfer();

    // required to trigger timeline.component.resize()
    this.waveSurferReady.next();

    this.applyZoom(0);
  }
}
