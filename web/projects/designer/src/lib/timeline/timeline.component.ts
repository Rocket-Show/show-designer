import { HttpClient } from '@angular/common/http';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { Composition } from '../models/composition';
import { Scene } from '../models/scene';
import { ScenePlaybackRegion } from '../models/scene-playback-region';
import { getOpenTimelineMillis } from '../models/timeline-length';
import { getGridSpacing, getRulerTicks } from '../models/timeline-ruler';
import { getStepMarkers, TimelineStepMarker } from '../models/timeline-step-marker';
import { getFreeGap, getPreviewTracks, getTrackRegions, isFreeOnTrack, TrackGap } from '../models/timeline-track';
import { Track } from '../models/track';
import { getPeak } from '../models/waveform-peaks';
import { ColorService } from '../services/color.service';
import { ConfigService } from '../services/config.service';
import { HotkeyTargetExcludeService } from '../services/hotkey-target-exclude.service';
import { IntroService } from '../services/intro.service';
import { LayoutService } from '../services/layout.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { SceneService } from '../services/scene.service';
import { TimelineService } from '../services/timeline.service';
import { UuidService } from '../services/uuid.service';
import { WarningDialogService } from '../services/warning-dialog.service';
import { TreeDragService } from '../tree/tree-drag.service';
import { CompositionSettingsComponent } from './composition-settings/composition-settings.component';
import { TimelineGridComponent } from './timeline-grid/timeline-grid.component';

// a clip on a track, as it is drawn
interface ClipView {
  region: ScenePlaybackRegion;
  scene: Scene;
  leftPx: number;
  widthPx: number;
  background: string;
  border: string;
  color: string;
  selected: boolean;
  sceneSelected: boolean;

  // a clip which is still being dragged in from the scene list
  ghost: boolean;

  // it would overlap another clip of its track: it goes back, if it is dropped there
  invalid: boolean;

  // the fades of the scene, inside the clip or running past its edges
  fadeInPx: number;
  fadeOutPx: number;
  fadeInPre: boolean;
  fadeOutPost: boolean;

  // the steps of the preset being edited, if it is played in the scene
  markers: TimelineStepMarker[];
}

// an action Rocket Show fires while the composition plays, as it is drawn
interface ActionMarkerView {
  millis: number;
  leftPx: number;
  time: string;
  actionTypes: string[];

  // the room up to the next action, which the name of this one may take
  labelWidthPx: number;
}

interface TrackView {
  track: Track;
  clips: ClipView[];

  // left out of the preview: hidden, or another track is soloed
  silent: boolean;
}

// what the pointer is doing on the timeline since it went down
interface PointerGesture {
  kind: 'move' | 'start' | 'end' | 'create' | 'seek' | 'track';
  startClientX: number;
  startClientY?: number;
  moved: boolean;
  region?: ScenePlaybackRegion;
  track?: Track;

  // where the clip was, to put it back if it is dropped onto another one
  originalStartMillis?: number;
  originalEndMillis?: number;
  originalTrackUuid?: string;

  // the time between the start of the clip and the pointer
  grabMillis?: number;

  // the room the clip may be resized or drawn in
  gap?: TrackGap;

  // where a new clip has been started
  anchorMillis?: number;
}

// a scene being dragged in from the scene list, over a track (or the row below them)
interface SceneDrop {
  scene: Scene;
  track: Track;
  startMillis: number;
  endMillis: number;
  valid: boolean;
}

@Component({
  selector: 'lib-app-timeline',
  templateUrl: './timeline.component.html',
  styleUrls: ['./timeline.component.css'],
  standalone: false,
})
export class TimelineComponent implements AfterViewInit, OnDestroy {
  // the width of the column with the names of the tracks
  static readonly headerWidthPx = 200;

  // the pointer has to travel that far before a click becomes a drag
  private static readonly dragThresholdPx = 4;

  @ViewChild('frame')
  frame: ElementRef<HTMLElement>;

  @ViewChild('scroller')
  scroller: ElementRef<HTMLElement>;

  @ViewChild('rulerCanvas')
  rulerCanvas: ElementRef<HTMLCanvasElement>;

  @ViewChild('waveCanvas')
  waveCanvas: ElementRef<HTMLCanvasElement>;

  @ViewChild('playhead')
  playhead: ElementRef<HTMLElement>;

  @ViewChild('timeLabel')
  timeLabel: ElementRef<HTMLElement>;

  headerWidthPx = TimelineComponent.headerWidthPx;

  // pixels per second the song is drawn at
  pxPerSecond = 1;

  // how far the tracks are scrolled to the right
  scrollLeftPx = 0;

  // the length of the timeline: the song, or the clips and some room after them if there is no song
  timelineMillis = 0;

  // where a composition without an audio file ends (undefined with one): past it, the
  // timeline is room to make it longer
  endPx: number;

  actionMarkers: ActionMarkerView[] = [];

  trackViews: TrackView[] = [];
  gridStyle: { [key: string]: string } = {};

  // the band on the ruler and the waveform, which marks where the selected clip plays
  selectedBand: { leftPx: number; widthPx: number };

  sceneDrop: SceneDrop;

  // a scene is being dragged over the row below the tracks: dropped, it gets a new one
  sceneDropOnNewTrack = false;
  newTrackGhost: ClipView;

  gesture: PointerGesture;

  // where a track being dragged would be put: in front of the track at this index
  trackInsertIndex: number;

  // the name of a track has been clicked last (not a clip or a lane): the delete key
  // removes that track
  private trackFocused = false;
  private drawFrame: number;
  private subscriptions: Subscription[] = [];

  private moveListener = (event: MouseEvent) => this.ngZone.run(() => this.onPointerMove(event));
  private upListener = (event: MouseEvent) => this.ngZone.run(() => this.onPointerUp(event));

  constructor(
    public timelineService: TimelineService,
    private changeDetectorRef: ChangeDetectorRef,
    private modalService: BsModalService,
    private uuidService: UuidService,
    public projectService: ProjectService,
    private hotkeyTargetExcludeService: HotkeyTargetExcludeService,
    private warningDialogService: WarningDialogService,
    private http: HttpClient,
    private configService: ConfigService,
    public introService: IntroService,
    public sceneService: SceneService,
    public presetService: PresetService,
    private colorService: ColorService,
    private treeDragService: TreeDragService,
    private ngZone: NgZone,
    private layoutService: LayoutService
  ) {
    this.subscriptions.push(
      this.timelineService.waveSurferReady.subscribe(() => {
        this.onResize();
      }),
      this.timelineService.detectChanges.subscribe(() => {
        this.update();
      }),
      // runs outside of the Angular zone while playing: only move what shows the position
      this.timelineService.positionChanged.subscribe((millis) => {
        this.showPosition(millis);
      })
    );
  }

  ngAfterViewInit() {
    // the composition may have been selected before the timeline was there
    setTimeout(() => this.update());
  }

  ngOnDestroy() {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    this.stopListening();
  }

  get composition(): Composition {
    return this.timelineService.selectedComposition;
  }

  // folded down to its toolbar (see LayoutService)
  get folded(): boolean {
    return this.layoutService.isFolded('timeline');
  }

  get laneWidthPx(): number {
    return Math.max(0, (this.timelineMillis / 1000) * this.pxPerSecond);
  }

  // the width of the part of the tracks which is visible
  private get viewportWidthPx(): number {
    return this.scroller ? Math.max(1, this.scroller.nativeElement.clientWidth - this.headerWidthPx) : 1;
  }

  @HostListener('window:resize')
  public onResize() {
    this.update();
  }

  // lay the timeline out again and draw it
  private update() {
    const hadScroller = !!this.scroller;

    this.refresh();
    this.changeDetectorRef.detectChanges();

    // the tracks have just appeared: now their width is known to lay them out by
    if (!hadScroller && this.scroller) {
      this.refresh();
      this.changeDetectorRef.detectChanges();
    }

    this.scheduleDraw();
  }

  // ---- layout ---------------------------------------------------------------

  // work out the scale and what is drawn where, from the composition as it is now
  private refresh() {
    const composition = this.composition;

    if (!composition) {
      this.trackViews = [];
      return;
    }

    // a clip being dragged leaves the length alone, so that the scale stays put under the pointer
    if (!this.draggingClip) {
      this.timelineMillis = this.getTimelineMillis(composition);
    }

    const fitPxPerSecond = this.viewportWidthPx / (this.timelineMillis / 1000);
    this.pxPerSecond = this.timelineService.zoom > 0 ? Math.max(fitPxPerSecond, this.timelineService.zoom) : fitPxPerSecond;

    this.endPx = this.timelineService.playsAudioFile() ? undefined : this.toPx(this.timelineService.getEndMillis());
    this.actionMarkers = this.getActionMarkers();
    this.gridStyle = this.getGridStyle();
    const played = getPreviewTracks(composition);
    this.trackViews = composition.tracks.map((track) => ({ track, clips: this.getClipViews(track), silent: played.indexOf(track) < 0 }));
    this.newTrackGhost =
      this.sceneDrop && !this.sceneDrop.track ? this.getClipView(this.ghostRegion(), this.sceneDrop.scene, true) : undefined;

    const selected = this.timelineService.selectedPlaybackRegion;
    this.selectedBand = selected
      ? { leftPx: this.toPx(selected.startMillis), widthPx: this.toPx(selected.endMillis - selected.startMillis) }
      : undefined;
  }

  // How long the timeline is. With an audio file, as long as the song, but no clip and no
  // action is cut off. Without one, it reaches past the end of the composition: a scene
  // put there makes the composition longer.
  private getTimelineMillis(composition: Composition): number {
    if (!this.timelineService.playsAudioFile()) {
      return getOpenTimelineMillis(this.timelineService.getEndMillis());
    }

    const external = this.timelineService.externalComposition;
    const lastEnd = composition.scenePlaybackRegions.reduce(
      (end, region) => Math.max(end, region.endMillis),
      external ? external.lastActionMillis : 0
    );

    return Math.max(this.timelineService.getEndMillis() || 60000, lastEnd);
  }

  private get draggingClip(): boolean {
    return !!this.gesture && ['move', 'start', 'end', 'create'].indexOf(this.gesture.kind) >= 0;
  }

  toPx(millis: number): number {
    return (millis / 1000) * this.pxPerSecond;
  }

  // the point in time under the pointer
  private millisAt(clientX: number): number {
    const scroller = this.scroller.nativeElement;
    const laneLeft = scroller.getBoundingClientRect().left + this.headerWidthPx - scroller.scrollLeft;

    return ((clientX - laneLeft) / this.pxPerSecond) * 1000;
  }

  // the track under the pointer (undefined below the tracks)
  private trackAt(clientY: number): Track {
    const rows = this.scroller.nativeElement.querySelectorAll('.tl-track');

    for (let index = 0; index < rows.length; index++) {
      const rect = rows[index].getBoundingClientRect();

      if (clientY >= rect.top && clientY < rect.bottom) {
        return this.composition.tracks[index];
      }
    }

    return undefined;
  }

  private getGridStyle(): { [key: string]: string } {
    const spacing = getGridSpacing(this.composition, this.pxPerSecond);
    const strongPx = this.toPx(spacing.strongLineMillis);
    const linePx = this.toPx(spacing.lineMillis);
    const offsetPx = this.toPx(spacing.offsetMillis);
    const line = (color: string) => `linear-gradient(to right, ${color} 1px, transparent 1px)`;

    return {
      'background-image': `${line('rgba(255, 255, 255, 0.07)')}, ${line('rgba(255, 255, 255, 0.03)')}`,
      'background-size': `${strongPx}px 100%, ${linePx}px 100%`,
      'background-position': `${offsetPx % strongPx}px 0, ${offsetPx % linePx}px 0`,
    };
  }

  // the actions Rocket Show fires while it plays the composition, if it does
  private getActionMarkers(): ActionMarkerView[] {
    const external = this.timelineService.externalComposition;
    const triggers = external ? external.actionTriggers : [];

    return triggers.map((trigger, index) => {
      const leftPx = this.toPx(trigger.positionMillis);
      const nextPx = index + 1 < triggers.length ? this.toPx(triggers[index + 1].positionMillis) : Infinity;

      return {
        millis: trigger.positionMillis,
        leftPx,
        time: this.timelineService.msToTime(trigger.positionMillis),
        actionTypes: trigger.actionTypes,
        labelWidthPx: Math.min(160, nextPx - leftPx - 10),
      };
    });
  }

  private getClipViews(track: Track): ClipView[] {
    const clips: ClipView[] = [];

    for (const region of getTrackRegions(this.composition, track.uuid)) {
      const scene = this.sceneService.getSceneByUuid(region.sceneUuid);

      if (scene) {
        clips.push(this.getClipView(region, scene, false));
      }
    }

    if (this.sceneDrop && this.sceneDrop.track === track) {
      clips.push(this.getClipView(this.ghostRegion(), this.sceneDrop.scene, true));
    }

    return clips;
  }

  // where the scene dragged in from the scene list would land
  private ghostRegion(): ScenePlaybackRegion {
    const ghost = new ScenePlaybackRegion();
    ghost.startMillis = this.sceneDrop.startMillis;
    ghost.endMillis = this.sceneDrop.endMillis;

    return ghost;
  }

  private getClipView(region: ScenePlaybackRegion, scene: Scene, ghost: boolean): ClipView {
    const color = this.colorService.getSceneColor(scene);
    const sceneSelected = this.sceneService.sceneIsSelected(scene);
    const invalid = ghost
      ? !this.sceneDrop.valid
      : this.gesture?.region === region && this.gesture.kind === 'move' && !this.isRegionFree(region);

    return {
      region,
      scene,
      leftPx: this.toPx(region.startMillis),
      widthPx: Math.max(2, this.toPx(region.endMillis - region.startMillis)),
      background: this.colorService.toRgba(color, ghost ? 0.18 : sceneSelected ? 0.42 : 0.24),
      border: this.colorService.toRgba(color, sceneSelected ? 0.9 : 0.6),
      color,
      selected: region === this.timelineService.selectedPlaybackRegion,
      sceneSelected,
      ghost,
      invalid,
      fadeInPx: this.toPx(scene.fadeInMillis || 0),
      fadeOutPx: this.toPx(scene.fadeOutMillis || 0),
      fadeInPre: !!scene.fadeInPre,
      fadeOutPost: !!scene.fadeOutPost,
      markers: ghost ? [] : getStepMarkers(this.presetService.selectedPreset, scene, region),
    };
  }

  private isRegionFree(region: ScenePlaybackRegion): boolean {
    return isFreeOnTrack(this.composition, region.trackUuid, region.startMillis, region.endMillis, region);
  }

  // ---- drawing the ruler, the waveform and the position ----------------------

  onScroll() {
    this.scrollLeftPx = this.scroller.nativeElement.scrollLeft;
    this.scheduleDraw();
  }

  // the name of a clip which starts left of the visible tracks moves along, so that it
  // stays readable while the clip is in view
  labelShiftPx(clip: ClipView): number {
    return Math.max(0, Math.min(this.scrollLeftPx - clip.leftPx, clip.widthPx - 60));
  }

  private scheduleDraw() {
    if (this.drawFrame) {
      return;
    }

    this.ngZone.runOutsideAngular(() => {
      this.drawFrame = requestAnimationFrame(() => {
        this.drawFrame = undefined;
        this.draw();
      });
    });
  }

  private draw() {
    if (!this.composition || !this.scroller) {
      return;
    }

    this.drawRuler();
    this.drawWaveform();
    this.showPosition(this.timelineService.getCurrentMillis());
  }

  // Size a canvas to the visible part of its lane and tell where that part starts. The
  // canvas sticks to the left edge of the visible tracks, the lane scrolls below it.
  private prepareCanvas(canvas: HTMLCanvasElement): { context: CanvasRenderingContext2D; width: number; height: number; offsetPx: number } {
    const width = this.viewportWidthPx;
    const height = canvas.parentElement.clientHeight;
    const ratio = window.devicePixelRatio || 1;

    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const offsetPx = canvas.getBoundingClientRect().left - canvas.parentElement.getBoundingClientRect().left;

    return { context, width, height, offsetPx };
  }

  private drawRuler() {
    if (!this.rulerCanvas) {
      return;
    }

    const { context, width, height, offsetPx } = this.prepareCanvas(this.rulerCanvas.nativeElement);
    const startMillis = (offsetPx / this.pxPerSecond) * 1000;
    const endMillis = ((offsetPx + width) / this.pxPerSecond) * 1000;

    this.drawSelectedBand(context, offsetPx, height);
    this.drawAfterEnd(context, offsetPx, width, height);

    context.font = '11px ' + getComputedStyle(this.rulerCanvas.nativeElement).fontFamily;
    context.textBaseline = 'top';

    for (const tick of getRulerTicks(this.composition, this.pxPerSecond, startMillis, endMillis)) {
      const x = Math.round(this.toPx(tick.millis) - offsetPx) + 0.5;
      const tickHeight = tick.label ? 14 : 6;

      context.fillStyle = tick.label ? '#99a1ac' : '#6b7280';
      context.fillRect(x - 0.5, height - tickHeight, 1, tickHeight);

      if (tick.label) {
        context.fillText(tick.label, x + 4, 4);
      }
    }
  }

  private drawWaveform() {
    if (!this.waveCanvas) {
      return;
    }

    const { context, width, height, offsetPx } = this.prepareCanvas(this.waveCanvas.nativeElement);
    const peaks = this.timelineService.peaks;
    const middle = height / 2;

    this.drawSelectedBand(context, offsetPx, height);

    context.fillStyle = 'rgba(255, 255, 255, 0.06)';
    context.fillRect(0, Math.floor(middle), width, 1);

    if (!peaks.length) {
      return;
    }

    context.fillStyle = 'rgba(139, 147, 158, 0.6)';

    for (let x = 0; x < width; x++) {
      const startMillis = ((offsetPx + x) / this.pxPerSecond) * 1000;
      const endMillis = ((offsetPx + x + 1) / this.pxPerSecond) * 1000;
      const peakHeight = getPeak(peaks, TimelineService.peaksPerSecond, startMillis, endMillis) * (middle - 3);

      if (peakHeight > 0.5) {
        context.fillRect(x, middle - peakHeight, 1, peakHeight * 2);
      }
    }
  }

  private drawSelectedBand(context: CanvasRenderingContext2D, offsetPx: number, height: number) {
    if (!this.selectedBand) {
      return;
    }

    const left = this.selectedBand.leftPx - offsetPx;

    context.fillStyle = 'rgba(253, 126, 20, 0.1)';
    context.fillRect(left, 0, this.selectedBand.widthPx, height);
    context.fillStyle = 'rgba(253, 126, 20, 0.6)';
    context.fillRect(Math.round(left), 0, 1, height);
    context.fillRect(Math.round(left + this.selectedBand.widthPx) - 1, 0, 1, height);
  }

  // shade the time past the end of a composition without an audio file
  private drawAfterEnd(context: CanvasRenderingContext2D, offsetPx: number, width: number, height: number) {
    if (this.endPx === undefined) {
      return;
    }

    const x = Math.round(this.endPx - offsetPx);

    if (x >= width) {
      return;
    }

    context.fillStyle = 'rgba(0, 0, 0, 0.22)';
    context.fillRect(Math.max(0, x), 0, width - Math.max(0, x), height);
    context.fillStyle = '#6b7280';
    context.fillRect(x, 0, 1, height);
  }

  // move the playhead (and the time) to the position of the playback. Called many times
  // a second while playing, so it only touches the elements showing the position.
  private showPosition(millis: number) {
    if (this.timeLabel) {
      this.timeLabel.nativeElement.textContent = this.timelineService.msToTime(millis);
    }

    if (!this.playhead || !this.scroller) {
      return;
    }

    const scroller = this.scroller.nativeElement;
    const x = this.toPx(millis);

    // follow the playback, a page at a time
    if (this.timelineService.playState === 'playing' && !this.gesture) {
      if (x > scroller.scrollLeft + this.viewportWidthPx - 20 || x < scroller.scrollLeft) {
        scroller.scrollLeft = Math.max(0, x - 20);
      }
    }

    // the playhead lies over the scrolling tracks, it is only shown over their visible part
    const visibleX = x - scroller.scrollLeft;
    const style = this.playhead.nativeElement.style;
    style.transform = `translateX(${this.headerWidthPx + visibleX}px)`;
    style.visibility = visibleX < 0 || visibleX > this.viewportWidthPx ? 'hidden' : 'visible';
  }

  // zoom in or out with the wheel while ctrl is pressed, keeping the time under the pointer
  onWheel(event: WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();

    const millis = this.millisAt(event.clientX);
    const zoom = Math.round(Math.min(200, Math.max(0, this.pxPerSecond * (event.deltaY < 0 ? 1.25 : 0.8))));
    const pointerPx = event.clientX - this.scroller.nativeElement.getBoundingClientRect().left - this.headerWidthPx;

    this.timelineService.applyZoom(zoom);
    this.scroller.nativeElement.scrollLeft = Math.max(0, this.toPx(millis) - pointerPx);
    this.scheduleDraw();
  }

  // ---- the keyboard ---------------------------------------------------------

  // the timeline takes the focus when something in it is clicked, which is what the
  // delete key goes by
  private focusTimeline() {
    if (this.frame) {
      this.frame.nativeElement.focus({ preventScroll: true });
    }
  }

  // delete removes the selected clip, or the track whose name was clicked last
  onKeyDown(event: KeyboardEvent) {
    if ((event.key !== 'Delete' && event.key !== 'Backspace') || this.hotkeyTargetExcludeService.exclude(event)) {
      return;
    }

    event.preventDefault();

    if (this.timelineService.selectedPlaybackRegion) {
      this.timelineService.removeRegion();
      return;
    }

    const track = this.timelineService.getTrack(this.timelineService.selectedTrackUuid);

    if (this.trackFocused && track) {
      this.removeTrack(track);
    }
  }

  // ---- the pointer on the timeline -------------------------------------------

  private listen() {
    document.addEventListener('mousemove', this.moveListener);
    document.addEventListener('mouseup', this.upListener);
  }

  private stopListening() {
    document.removeEventListener('mousemove', this.moveListener);
    document.removeEventListener('mouseup', this.upListener);
  }

  // the ruler and the waveform jump to the time clicked, and follow the pointer from there
  onSeekStart(event: MouseEvent) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    this.focusTimeline();
    this.gesture = { kind: 'seek', startClientX: event.clientX, moved: false };
    this.seekTo(this.millisAt(event.clientX));
    this.listen();
  }

  // an action jumps to the time it is fired at
  onActionMouseDown(event: MouseEvent, marker: ActionMarkerView) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.focusTimeline();
    this.seekTo(marker.millis);
  }

  // not past the end of the timeline, while the pointer is dragged out of it
  private seekTo(millis: number) {
    this.timelineService.seekToMillis(Math.min(millis, this.timelineMillis));
  }

  onClipMouseDown(event: MouseEvent, clip: ClipView, kind: 'move' | 'start' | 'end') {
    if (event.button !== 0 || clip.ghost) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.focusTimeline();
    this.trackFocused = false;

    const region = clip.region;
    this.timelineService.selectRegion(region);

    this.gesture = {
      kind,
      startClientX: event.clientX,
      moved: false,
      region,
      originalStartMillis: region.startMillis,
      originalEndMillis: region.endMillis,
      originalTrackUuid: region.trackUuid,
      grabMillis: this.millisAt(event.clientX) - region.startMillis,
      gap: getFreeGap(this.composition, region.trackUuid, region.startMillis, region),
    };
    this.listen();
  }

  // On an empty spot of a track, the selected scene is drawn onto it. Drawn below the
  // tracks (no track passed), it gets a new track of its own.
  onLaneMouseDown(event: MouseEvent, track: Track) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    this.focusTimeline();
    this.trackFocused = false;
    this.timelineService.selectedPlaybackRegion = undefined;

    if (track) {
      this.timelineService.selectTrack(track);
    } else {
      this.timelineService.detectChanges.next();
    }

    if (this.sceneService.selectedScenes.length !== 1) {
      return;
    }

    const anchorMillis = Math.max(0, Math.min(this.timelineService.snapMillis(this.millisAt(event.clientX)), this.timelineMillis));
    const gap = track ? getFreeGap(this.composition, track.uuid, anchorMillis) : { startMillis: 0, endMillis: Infinity };

    if (!gap) {
      return;
    }

    this.gesture = { kind: 'create', startClientX: event.clientX, moved: false, track, anchorMillis, gap };
    this.listen();
  }

  // a track is selected by its name, and dragged by it to another place in the list
  onTrackHeadMouseDown(event: MouseEvent, track: Track) {
    const target = event.target as HTMLElement;

    // the buttons and the name being edited keep their clicks
    if (event.button !== 0 || target.closest('.tl-icon-button, input')) {
      return;
    }

    // no text is selected while dragging (a double click on the name still renames it)
    event.preventDefault();
    this.focusTimeline();
    this.trackFocused = true;
    this.timelineService.selectedPlaybackRegion = undefined;
    this.timelineService.selectTrack(track);

    this.gesture = { kind: 'track', startClientX: event.clientX, startClientY: event.clientY, moved: false, track };
    this.listen();
  }

  // in front of which track a track dragged to the pointer would be put
  private trackInsertIndexAt(clientY: number): number {
    const rows = this.scroller.nativeElement.querySelectorAll('.tl-track');

    for (let index = 0; index < rows.length; index++) {
      const rect = rows[index].getBoundingClientRect();

      if (clientY < rect.top + rect.height / 2) {
        return index;
      }
    }

    return rows.length;
  }

  private onPointerMove(event: MouseEvent) {
    const gesture = this.gesture;

    if (!gesture) {
      return;
    }

    if (gesture.kind === 'track') {
      if (!gesture.moved && Math.abs(event.clientY - gesture.startClientY) < TimelineComponent.dragThresholdPx) {
        return;
      }

      gesture.moved = true;
      this.trackInsertIndex = this.trackInsertIndexAt(event.clientY);
      return;
    }

    const sideways = Math.abs(event.clientX - gesture.startClientX) >= TimelineComponent.dragThresholdPx;

    if (!gesture.moved) {
      // a clip taken to another track starts moving as well
      const otherTrack = gesture.kind === 'move' && this.trackAt(event.clientY)?.uuid !== gesture.originalTrackUuid;

      if (!sideways && !otherTrack && gesture.kind !== 'seek') {
        return;
      }

      gesture.moved = true;
    }

    const millis = this.millisAt(event.clientX);

    switch (gesture.kind) {
      case 'seek':
        this.seekTo(millis);
        return;
      case 'move':
        this.moveRegion(gesture, sideways ? millis : undefined, this.trackAt(event.clientY));
        break;
      case 'start':
      case 'end':
        this.resizeRegion(gesture, millis);
        break;
      case 'create':
        this.drawRegion(gesture, millis);
        break;
    }

    this.refresh();
    this.scheduleDraw();
  }

  // move a clip in time and across the tracks. Without a time (the pointer has not left
  // where it went down), it keeps its time and only changes the track.
  private moveRegion(gesture: PointerGesture, millis: number, track: Track) {
    const region = gesture.region;
    const length = gesture.originalEndMillis - gesture.originalStartMillis;
    const startMillis =
      millis === undefined
        ? gesture.originalStartMillis
        : Math.max(0, Math.min(this.timelineService.snapMillis(millis - gesture.grabMillis), this.timelineMillis - length));

    region.startMillis = startMillis;
    region.endMillis = startMillis + length;

    if (track) {
      region.trackUuid = track.uuid;
    }
  }

  // drag an edge of a clip, but not over the clips next to it
  private resizeRegion(gesture: PointerGesture, millis: number) {
    const region = gesture.region;
    const snapped = this.timelineService.snapMillis(millis);
    const minLength = TimelineService.minRegionMillis;

    if (gesture.kind === 'start') {
      region.startMillis = Math.max(gesture.gap.startMillis, Math.min(snapped, region.endMillis - minLength));
    } else {
      region.endMillis = Math.min(gesture.gap.endMillis, this.timelineMillis, Math.max(snapped, region.startMillis + minLength));
    }
  }

  // draw a new clip of the selected scene, inside the free room around where it started
  private drawRegion(gesture: PointerGesture, millis: number) {
    const snapped = this.timelineService.snapMillis(millis);
    const minLength = TimelineService.minRegionMillis;
    const startMillis = Math.max(gesture.gap.startMillis, Math.min(gesture.anchorMillis, snapped));
    const endMillis = Math.min(gesture.gap.endMillis, this.timelineMillis, Math.max(gesture.anchorMillis, snapped));

    if (endMillis - startMillis < minLength) {
      return;
    }

    if (!gesture.region) {
      const scene = this.sceneService.selectedScenes[0];

      // drawn below the tracks: on a new track, named after the scene
      if (!gesture.track) {
        gesture.track = this.timelineService.addTrack(undefined, scene.name);
      }

      gesture.region = this.timelineService.createRegion(gesture.track, scene, startMillis, endMillis);
      return;
    }

    gesture.region.startMillis = startMillis;
    gesture.region.endMillis = endMillis;
  }

  private onPointerUp(event: MouseEvent) {
    const gesture = this.gesture;
    this.gesture = undefined;
    this.stopListening();

    if (gesture && gesture.kind === 'track') {
      const insertIndex = this.trackInsertIndex;
      this.trackInsertIndex = undefined;

      if (gesture.moved && insertIndex !== undefined) {
        this.timelineService.moveTrack(gesture.track, insertIndex);
      }

      return;
    }

    if (!gesture || !gesture.moved || gesture.kind === 'seek') {
      return;
    }

    const region = gesture.region;

    if (gesture.kind === 'move' && !this.isRegionFree(region)) {
      // another scene plays there already: one clip at a time on a track
      region.startMillis = gesture.originalStartMillis;
      region.endMillis = gesture.originalEndMillis;
      region.trackUuid = gesture.originalTrackUuid;
    }

    if (region) {
      this.timelineService.selectedTrackUuid = region.trackUuid;
      this.timelineService.regionChanged();
    }
  }

  // ---- dragging a scene in from the scene list -------------------------------

  // the scene dragged in from the scene list, if a scene is dragged at all (not a
  // preset of it or a folder)
  private get draggedScene(): Scene {
    const node = this.treeDragService.nodes.find((candidate) => candidate.scene && !candidate.preset);

    return node ? node.scene : undefined;
  }

  // where the dragged scene would land on a track: at the grid point under the pointer,
  // four bars long or up to the next clip
  onSceneDragOver(event: DragEvent, track: Track) {
    const scene = this.draggedScene;

    if (!scene || !this.composition) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }

    const startMillis = Math.max(0, Math.min(this.timelineService.snapMillis(this.millisAt(event.clientX)), this.timelineMillis));
    const lengthMillis = (4 * (this.composition.timeSignatureUpper || 4) * 60000) / (this.composition.beatsPerMinute || 120);
    const gap = track ? getFreeGap(this.composition, track.uuid, startMillis) : { startMillis: 0, endMillis: Infinity };
    const endMillis = Math.min(startMillis + lengthMillis, gap ? gap.endMillis : Infinity, this.timelineMillis);

    this.sceneDropOnNewTrack = !track;
    this.sceneDrop = track
      ? { scene, track, startMillis, endMillis: gap ? endMillis : startMillis + lengthMillis, valid: !!gap && endMillis > startMillis }
      : { scene, track: undefined, startMillis, endMillis, valid: endMillis > startMillis };

    this.refresh();
  }

  onSceneDrop(event: DragEvent) {
    const drop = this.sceneDrop;
    this.clearSceneDrop();

    if (!drop || !drop.valid) {
      return;
    }

    event.preventDefault();

    // a scene dropped below the tracks gets a track of its own, named after it
    let track = drop.track;
    if (!track) {
      track = this.timelineService.addTrack();
      track.name = drop.scene.name;
    }

    this.timelineService.createRegion(track, drop.scene, drop.startMillis, drop.endMillis);
  }

  onSceneDragLeave(event: DragEvent) {
    // leaving for one of the clips or rows inside the timeline is no leaving
    const target = event.relatedTarget as Node;
    if (target && this.scroller && this.scroller.nativeElement.contains(target)) {
      return;
    }

    this.clearSceneDrop();
  }

  // the drag ended somewhere else, or was cancelled
  @HostListener('document:dragend')
  clearSceneDrop() {
    if (!this.sceneDrop && !this.sceneDropOnNewTrack) {
      return;
    }

    this.sceneDrop = undefined;
    this.sceneDropOnNewTrack = false;
    this.refresh();
  }

  // ---- tracks ---------------------------------------------------------------

  addTrack() {
    const tracks = this.composition.tracks;
    const selected = tracks.findIndex((track) => track.uuid === this.timelineService.selectedTrackUuid);

    // right below the selected one, which is where the next scene is put
    this.timelineService.addTrack(selected < 0 ? undefined : selected + 1);
  }

  renameTrack(track: Track, name: string) {
    track.name = name;
  }

  removeTrack(track: Track) {
    if (!this.composition.scenePlaybackRegions.some((region) => region.trackUuid === track.uuid)) {
      this.timelineService.removeTrack(track);
      return;
    }

    this.warningDialogService
      .show('designer.timeline.warning-delete-track')
      .pipe(
        map((result) => {
          if (result) {
            this.timelineService.removeTrack(track);
          }
        })
      )
      .subscribe();
  }

  // ---- the toolbar ----------------------------------------------------------

  play() {
    this.timelineService.play();
  }

  pause() {
    this.timelineService.pause();
  }

  rewind() {
    this.timelineService.rewind();
  }

  addRegion() {
    this.timelineService.addRegion();
  }

  removeRegion() {
    this.timelineService.removeRegion();
  }

  openGridSettings() {
    const bsModalRef = this.modalService.show(TimelineGridComponent, { keyboard: true, ignoreBackdropClick: false, class: '' });
  }

  private afterDeleteFile() {
    this.timelineService.deleteSelectedComposition();
  }

  removeComposition() {
    this.warningDialogService
      .show('designer.timeline.warning-delete-composition')
      .pipe(
        map((result) => {
          if (result) {
            if (this.configService.enableMediaLibrary) {
              // don't delete the file from the library
              this.afterDeleteFile();
            } else {
              // the composition uuid and extension is used as the file name
              this.http
                .post('file/delete?compositionUuid=' + this.timelineService.selectedComposition.uuid, undefined)
                .pipe(
                  map((response: Response) => {
                    this.afterDeleteFile();
                  })
                )
                .subscribe();
            }
          }
        })
      )
      .subscribe();
  }

  private openCompositionSettings(compositionIndex?: number, newComposition?: Composition) {
    const editComposition: Composition =
      newComposition || JSON.parse(JSON.stringify(this.projectService.project.compositions[compositionIndex]));

    const bsModalRef = this.modalService.show(CompositionSettingsComponent, {
      keyboard: false,
      ignoreBackdropClick: true,
      class: '',
      initialState: { composition: editComposition },
    });

    (bsModalRef.content as CompositionSettingsComponent).onClose.subscribe((result) => {
      if (result === 1) {
        // OK has been pressed -> save
        if (newComposition) {
          this.projectService.project.compositions.push(editComposition);
          this.timelineService.selectedCompositionIndex = this.projectService.project.compositions.length - 1;

          // create the composition, if externally necessary
          if (this.timelineService.externalCompositionsAvailable) {
            // TODO check, if this composition already exists externally and create it, if not
            // maybe not needed and even confusing?
          }
        } else {
          this.projectService.project.compositions[compositionIndex] = editComposition;
        }

        this.selectComposition(this.timelineService.selectedCompositionIndex);
      }
    });
  }

  compositionSettings() {
    this.openCompositionSettings(this.timelineService.selectedCompositionIndex);
  }

  addComposition() {
    // create a new composition
    const composition = new Composition();
    composition.uuid = this.uuidService.getUuid();
    composition.name = 'New Composition';

    this.openCompositionSettings(undefined, composition);
  }

  selectComposition(index: number) {
    this.timelineService.selectCompositionIndex(index);
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (this.hotkeyTargetExcludeService.exclude(event)) {
      return;
    }

    if (!this.timelineService.selectedComposition) {
      return;
    }

    if (event.key === ' ') {
      if (this.timelineService.playState === 'paused') {
        this.play();
      } else {
        this.pause();
      }

      // prevent checkboxes being toggled, if in focus e.g.
      event.stopPropagation();
      event.preventDefault();
    }
  }

  // the room the selected clip has on its track, between the clips next to it
  private selectedRegionGap(): TrackGap {
    const region = this.timelineService.selectedPlaybackRegion;

    return getFreeGap(this.composition, region.trackUuid, region.startMillis, region) || { startMillis: 0, endMillis: Infinity };
  }

  setRegionStartMillis(value: any) {
    const region = this.timelineService.selectedPlaybackRegion;

    if (!region) {
      return;
    }

    if (value === '' || isNaN(value) || value < 0) {
      return;
    }

    region.startMillis = Math.max(
      this.selectedRegionGap().startMillis,
      Math.min(+value, region.endMillis - TimelineService.minRegionMillis)
    );
    this.timelineService.updateSelectedRegion();
  }

  setRegionEndMillis(value: any) {
    const region = this.timelineService.selectedPlaybackRegion;

    if (!region) {
      return;
    }

    if (value === '' || isNaN(value) || value < 0) {
      return;
    }

    region.endMillis = Math.min(this.selectedRegionGap().endMillis, Math.max(+value, region.startMillis + TimelineService.minRegionMillis));
    this.timelineService.updateSelectedRegion();
  }
}
