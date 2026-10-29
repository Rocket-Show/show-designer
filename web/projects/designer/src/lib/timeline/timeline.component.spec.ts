import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';
import { BsModalService } from 'ngx-bootstrap/modal';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { ToastrModule } from 'ngx-toastr';
import { of, Subject } from 'rxjs';
import WaveSurfer from 'wavesurfer.js';

import { InlineEditComponent } from '../inline-edit/inline-edit.component';
import { Composition } from '../models/composition';
import { Preset } from '../models/preset';
import { Project } from '../models/project';
import { ScenePlaybackRegion } from '../models/scene-playback-region';
import { Scene } from '../models/scene';
import { ConfigService } from '../services/config.service';
import { LayoutService } from '../services/layout.service';
import { LivePreviewService } from '../services/live-preview.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { SceneService } from '../services/scene.service';
import { TimelineService } from '../services/timeline.service';
import { WarningDialogService } from '../services/warning-dialog.service';
import { TreeDragService } from '../tree/tree-drag.service';
import { CompositionSettingsComponent } from './composition-settings/composition-settings.component';
import { TimelineGridComponent } from './timeline-grid/timeline-grid.component';
import { TimelineComponent } from './timeline.component';

// The timeline of a composition: the tracks with the scenes played on them as clips, the
// ruler and the song to line them up with, and the playback. The clips are moved, resized
// and drawn with the pointer, and scenes are dragged onto the tracks from the scene list.
//
// The timeline is 1200px wide, the names of the tracks take 200px of it: the composition
// below (70 seconds of clips and the room after them) is drawn at 10px per second.
describe('TimelineComponent', () => {
  let fixture: ComponentFixture<TimelineComponent>;
  let element: HTMLElement;
  let project: Project;
  let timelineService: TimelineService;
  let sceneService: SceneService;
  let http: HttpTestingController;
  let previewLive: jasmine.Spy;
  let showModal: jasmine.Spy;
  let now: number;
  let utilities: HTMLStyleElement;

  beforeEach(async () => {
    showModal = jasmine.createSpy('show');

    // the card is laid out by the utilities of bootstrap, which the test build does not
    // load: without them, the buttons floating in the toolbar narrow the tracks below
    utilities = document.createElement('style');
    utilities.textContent = '.d-flex { display: flex; } .h-100 { height: 100%; }';
    document.head.appendChild(utilities);

    await TestBed.configureTestingModule({
      declarations: [TimelineComponent, InlineEditComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, PopoverModule.forRoot(), TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        { provide: BsModalService, useValue: { show: showModal } },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
      ],
    }).compileComponents();

    TestBed.inject(LayoutService).folded = [];
    timelineService = TestBed.inject(TimelineService);
    sceneService = TestBed.inject(SceneService);
    http = TestBed.inject(HttpTestingController);
    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');
    spyOn(TestBed.inject(LivePreviewService), 'stopPreviewPlay');

    // the clock of a composition without an audio file
    now = 0;
    spyOn(performance, 'now').and.callFake(() => now);

    project = new Project({
      scenes: [
        { uuid: 'verse', name: 'Verse', color: '#ff0000', colorAuto: false },
        { uuid: 'chorus', name: 'Chorus', color: '#0000ff', colorAuto: false, fadeInMillis: 2000, fadeOutMillis: 5000, fadeOutPost: true },
        { uuid: 'outro', name: 'Outro', color: '#00ff00', colorAuto: false },
      ],
      compositions: [
        {
          uuid: 'song',
          name: 'Song',
          syncType: 'none',
          gridType: 'musical',
          beatsPerMinute: 120,
          timeSignatureUpper: 4,
          timeSignatureLower: 4,
          gridResolution: 1,
          gridOffsetMillis: 0,
          snapToGrid: true,
          tracks: [
            { uuid: 'lead', name: 'Lead' },
            { uuid: 'backing', name: 'Backing' },
          ],
          scenePlaybackRegions: [
            { sceneUuid: 'verse', trackUuid: 'lead', startMillis: 0, endMillis: 20000 },
            { sceneUuid: 'chorus', trackUuid: 'lead', startMillis: 30000, endMillis: 50000 },
            { sceneUuid: 'outro', trackUuid: 'backing', startMillis: 40000, endMillis: 70000 },
          ],
        },
        { uuid: 'empty', name: 'Empty', syncType: 'none', gridType: 'time', snapToGrid: false },
      ],
    });
    TestBed.inject(ProjectService).project = project;
  });

  afterEach(() => {
    if (fixture) {
      fixture.destroy();
      fixture.nativeElement.remove();
      fixture = undefined;
    }

    timelineService.destroyWaveSurfer();
    utilities.remove();
    http.verify();
  });

  // show the timeline with the composition at that index selected (or none)
  function render(index: number | 'none' = 0) {
    if (index !== 'none') {
      timelineService.selectCompositionIndex(index);
    }

    fixture = TestBed.createComponent(TimelineComponent);
    element = fixture.nativeElement;
    element.style.display = 'block';
    element.style.width = '1200px';
    element.style.height = '600px';
    fixture.detectChanges();
    settle();
  }

  // let the timeline lay itself out and draw
  function settle() {
    fixture.detectChanges();
    tick(20);
    fixture.detectChanges();
  }

  // the timeline draws itself again, e.g. after the composition has been changed
  function redraw() {
    timelineService.detectChanges.next();
    settle();
  }

  const component = () => fixture.componentInstance;
  const composition = (): Composition => timelineService.selectedComposition;
  const scene = (uuid: string): Scene => project.scenes.find((candidate) => candidate.uuid === uuid);
  const region = (sceneUuid: string): ScenePlaybackRegion =>
    composition().scenePlaybackRegions.find((candidate) => candidate.sceneUuid === sceneUuid);
  const frame = (): HTMLElement => element.querySelector('.tl-frame');
  const scroller = (): HTMLElement => element.querySelector('.tl-scroller');
  const trackRows = (): HTMLElement[] => Array.from(element.querySelectorAll<HTMLElement>('.tl-track'));
  const trackNames = (): string[] => composition().tracks.map((track) => track.name);
  const lane = (index: number): HTMLElement => trackRows()[index].querySelector('.tl-track-lane');
  const head = (index: number): HTMLElement => trackRows()[index].querySelector('.tl-track-head');
  const clips = (row: Element = element): HTMLElement[] => Array.from(row.querySelectorAll<HTMLElement>('.tl-clip:not(.tl-clip-ghost)'));
  const clip = (name: string): HTMLElement => clips().find((candidate) => candidate.querySelector('.tl-clip-name').textContent === name);
  const clipNames = (row: Element): string[] => clips(row).map((candidate) => candidate.querySelector('.tl-clip-name').textContent);
  const ghost = (): HTMLElement => element.querySelector('.tl-clip-ghost');
  const playhead = (): HTMLElement => element.querySelector('.tl-playhead');
  const hoverLine = (): HTMLElement => element.querySelector('.tl-hover-line');
  const dragCursor = (): HTMLElement =>
    Array.from(document.body.children).find((child: HTMLElement) => child.style.zIndex === '100000') as HTMLElement;
  const toolbarButton = (icon: string): HTMLElement => element.querySelector('.card-body > .d-flex .' + icon).closest('a');

  // where a point in time is on the screen, and the middle of a track
  const x = (millis: number) => element.querySelector('.tl-ruler').getBoundingClientRect().left + (millis / 1000) * component().pxPerSecond;
  const y = (index: number) => {
    const rect = trackRows()[index].getBoundingClientRect();
    return rect.top + rect.height / 2;
  };

  function mouse(target: EventTarget, type: string, clientX: number, clientY: number = 0, init: MouseEventInit = {}) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0, ...init });
    target.dispatchEvent(event);
    return event;
  }

  // press the pointer on an element, move it over the page and let it go where it ended up
  function drag(target: Element, from: [number, number], ...to: [number, number][]) {
    mouse(target, 'mousedown', from[0], from[1]);
    to.forEach(([clientX, clientY]) => mouse(document, 'mousemove', clientX, clientY));

    const [lastX, lastY] = to.length ? to[to.length - 1] : from;
    mouse(document, 'mouseup', lastX, lastY);
    settle();
  }

  function key(target: EventTarget, name: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    settle();
  }

  // the color of a pixel of a canvas, at a point in css pixels
  function pixel(canvas: HTMLCanvasElement, left: number, top: number): number[] {
    const ratio = window.devicePixelRatio || 1;
    return Array.from(canvas.getContext('2d').getImageData(Math.floor(left * ratio), Math.floor(top * ratio), 1, 1).data);
  }

  describe('laying out the composition', () => {
    it('fits the whole composition into its width, with room after the end to make it longer', fakeAsync(() => {
      render();

      expect(component().pxPerSecond).toBe(10);
      expect(component().timelineMillis).toBe(100000);
      expect(element.querySelector<HTMLElement>('.tl-content').style.width).toBe('1200px');
      expect(element.querySelector<HTMLElement>('.tl-after-end').style.left).toBe('900px');
    }));

    it('runs on its own clock without an audio file, so there is no waveform', fakeAsync(() => {
      render();

      expect(frame().classList).toContain('tl-no-audio');
      expect(element.querySelector('.tl-wave-row')).toBeNull();
    }));

    it('puts the clips on their tracks, where their scenes are played', fakeAsync(() => {
      render();

      expect(trackRows().map((row) => row.querySelector('.tl-track-name').textContent.trim())).toEqual(['Lead', 'Backing']);
      expect(clipNames(trackRows()[0])).toEqual(['Verse', 'Chorus']);
      expect(clipNames(trackRows()[1])).toEqual(['Outro']);
      expect([clip('Verse'), clip('Chorus'), clip('Outro')].map((candidate) => [candidate.style.left, candidate.style.width])).toEqual([
        ['0px', '200px'],
        ['300px', '200px'],
        ['400px', '300px'],
      ]);
    }));

    it('paints the clips in the colors of their scenes, the ones of the scenes played stronger', fakeAsync(() => {
      render();

      expect(clip('Verse').style.backgroundColor).toBe('rgba(255, 0, 0, 0.24)');
      expect(clip('Verse').style.borderColor).toBe('rgba(255, 0, 0, 0.6)');
      expect(clip('Verse').querySelector('.tl-clip-icon').classList).toContain(SceneService.defaultIcon);

      sceneService.selectScenes([scene('verse')]);
      settle();

      expect(clip('Verse').style.backgroundColor).toBe('rgba(255, 0, 0, 0.42)');
      expect(clip('Verse').style.borderColor).toBe('rgba(255, 0, 0, 0.9)');
    }));

    it('leaves out a clip whose scene is gone', fakeAsync(() => {
      project.scenes.splice(2, 1);
      render();

      expect(clipNames(trackRows()[1])).toEqual([]);
    }));

    it('shows the fades of a scene inside its clip, or running past its edges', fakeAsync(() => {
      render();

      const fadeIn = clip('Chorus').querySelector<HTMLElement>('.tl-fade:not(.tl-fade-out)');
      expect(fadeIn.style.width).toBe('20px');

      const fadeOut = trackRows()[0].querySelector<HTMLElement>('.tl-fade-tail');
      expect([fadeOut.style.left, fadeOut.style.width]).toEqual(['500px', '50px']);

      Object.assign(scene('chorus'), { fadeInPre: true, fadeOutPost: false });
      redraw();

      const fadeInTail = trackRows()[0].querySelector<HTMLElement>('.tl-fade-tail-in');
      expect([fadeInTail.style.left, fadeInTail.style.width]).toEqual(['280px', '20px']);
      expect(clip('Chorus').querySelector<HTMLElement>('.tl-fade-out').style.width).toBe('50px');
    }));

    it('shows the steps of the preset being edited, on the clips of the scenes playing it', fakeAsync(() => {
      const preset = new Preset({
        uuid: 'chase',
        steps: [
          { uuid: 'first', startMillis: 0 },
          { uuid: 'second', startMillis: 10000, transitionMillis: 2000 },
        ],
      });
      project.presets.push(preset);
      scene('verse').presetUuids = ['chase'];
      const presetService = TestBed.inject(PresetService);
      presetService.selectedPreset = preset;
      presetService.selectedStep = preset.steps[1];
      render();

      const ticks = Array.from(clip('Verse').querySelectorAll<HTMLElement>('.step-marker-tick'));
      expect(ticks.map((marker) => [marker.style.left, marker.getAttribute('data-step-name')])).toEqual([
        ['0%', '1'],
        ['50%', '2'],
      ]);
      expect(ticks.map((marker) => marker.getAttribute('data-step-selected'))).toEqual([null, 'true']);

      const transition = clip('Verse').querySelector<HTMLElement>('.step-marker-transition');
      expect([transition.style.left, transition.style.width]).toEqual(['50%', '10%']);
      expect(clip('Chorus').querySelector('.step-marker')).toBeNull();
    }));

    it('narrows a short clip down to its icon', fakeAsync(() => {
      project.compositions[0].scenePlaybackRegions[0].endMillis = 3000;
      render();

      expect(clip('Verse').classList).toContain('tl-clip-narrow');
      expect(clip('Verse').style.paddingLeft).toBe('0px');
      expect(clip('Chorus').classList).not.toContain('tl-clip-narrow');
      expect(clip('Chorus').style.paddingLeft).toBe('6px');
    }));

    it('keeps the name of a clip in view, while its start is scrolled out of it', fakeAsync(() => {
      render();
      timelineService.applyZoom(60);
      settle();

      scroller().scrollLeft = 300;
      scroller().dispatchEvent(new Event('scroll'));
      settle();

      expect(component().scrollLeftPx).toBe(300);
      expect(clip('Verse').style.paddingLeft).toBe('306px');
      expect(clip('Chorus').style.paddingLeft).toBe('6px');
    }));

    it('marks the track new clips go on', fakeAsync(() => {
      render();

      expect(trackRows().map((row) => row.classList.contains('tl-track-selected'))).toEqual([true, false]);
    }));

    it('dims the tracks the preview leaves out, the hidden ones or the ones not soloed', fakeAsync(() => {
      render();

      trackRows()[0].querySelector<HTMLElement>('.tl-toggle:not(.tl-solo)').click();
      settle();

      expect(composition().tracks[0].hidden).toBe(true);
      expect(trackRows().map((row) => row.classList.contains('tl-track-silent'))).toEqual([true, false]);
      expect(trackRows()[0].querySelector('.fa-eye-slash')).not.toBeNull();
      expect(previewLive).toHaveBeenCalled();

      trackRows()[0].querySelector<HTMLElement>('.tl-toggle:not(.tl-solo)').click();
      trackRows()[0].querySelector<HTMLElement>('.tl-solo').click();
      settle();

      expect(composition().tracks[0].solo).toBe(true);
      expect(trackRows()[0].querySelector('.tl-solo').classList).toContain('tl-toggle-on');
      expect(trackRows().map((row) => row.classList.contains('tl-track-silent'))).toEqual([false, true]);
    }));

    it('says how to start, while a composition has no tracks', fakeAsync(() => {
      render(1);

      expect(trackRows().length).toBe(0);
      expect(element.querySelector('.tl-empty-hint').textContent).toBe('designer.timeline.no-tracks');
    }));

    it('lays itself out again, when the window is resized', fakeAsync(() => {
      render();

      element.style.width = '700px';
      window.dispatchEvent(new Event('resize'));
      settle();

      expect(component().pxPerSecond).toBe(5);
    }));

    it('folds down to its toolbar, which still plays the composition', fakeAsync(() => {
      TestBed.inject(LayoutService).folded = ['timeline'];
      render();

      expect(frame()).toBeNull();

      toolbarButton('fa-play').click();
      expect(timelineService.playState).toBe('playing');

      timelineService.pause();
    }));
  });

  describe('with the actions of Rocket Show', () => {
    beforeEach(() => {
      timelineService.externalCompositionsAvailable = true;
    });

    // Rocket Show plays the files of the composition for that long
    function renderWithActions(durationMillis = 60000) {
      render();
      http.expectOne('composition?name=Song').flush({
        durationMillis,
        actionTriggerList: [
          { positionMillis: 50000, actionList: [{ actionMidi: { type: 'MIDI' } }, { actionAudio: { type: 'AUDIO' } }] },
          { positionMillis: 10000, actionList: [{ actionMidi: { type: 'MIDI' } }] },
          { positionMillis: 11000, actionList: [{ actionLighting: {} }] },
        ],
      });
      settle();
    }

    const actions = (): HTMLElement[] => Array.from(element.querySelectorAll<HTMLElement>('.tl-action'));

    it('shows the actions where they are fired, named if there is room', fakeAsync(() => {
      renderWithActions();

      expect(actions().map((action) => [action.style.left, action.title])).toEqual([
        ['100px', '00:10.000'],
        ['110px', '00:11.000'],
        ['500px', '00:50.000'],
      ]);
      expect(actions().map((action) => Array.from(action.querySelectorAll('.tl-action-type')).map((type) => type.textContent))).toEqual([
        [],
        ['designer.timeline.action-type.actionLighting'],
        ['designer.timeline.action-type.MIDI', 'designer.timeline.action-type.AUDIO'],
      ]);
      expect(actions()[1].querySelector<HTMLElement>('.tl-action-label').style.maxWidth).toBe('160px');
    }));

    it('lasts as long as Rocket Show plays the composition', fakeAsync(() => {
      renderWithActions(80000);

      expect(timelineService.getEndMillis()).toBe(80000);
      expect(component().timelineMillis).toBe(110000);
      expect(component().endPx).toBeCloseTo(80 * component().pxPerSecond, 5);
    }));

    it('jumps to an action clicked', fakeAsync(() => {
      renderWithActions();

      mouse(actions()[2], 'mousedown', x(50000) + 2);
      mouse(document, 'mousemove', x(70000));
      mouse(document, 'mouseup', x(70000));

      expect(timelineService.getCurrentMillis()).toBe(50000);
      expect(previewLive).toHaveBeenCalledWith('Song', 50000);
    }));

    it('shows where a click would jump to between the actions, but not on one', fakeAsync(() => {
      renderWithActions();

      mouse(element.querySelector('.tl-actions'), 'mousemove', x(30000));
      expect(hoverLine().style.visibility).toBe('visible');

      mouse(actions()[2], 'mousemove', x(50000));
      expect(hoverLine().style.visibility).toBe('hidden');
    }));

    it('only reacts to the left button on an action', fakeAsync(() => {
      renderWithActions();

      mouse(actions()[2], 'mousedown', x(50000), 0, { button: 2 });

      expect(timelineService.getCurrentMillis()).toBe(0);
    }));
  });

  describe('drawing the ruler', () => {
    function spyOnRuler(method: 'fillText' | 'fillRect'): jasmine.Spy {
      return spyOn(element.querySelector<HTMLCanvasElement>('.tl-ruler canvas').getContext('2d'), method).and.callThrough();
    }

    it('numbers the bars of a musical grid', fakeAsync(() => {
      render();
      const fillText = spyOnRuler('fillText');
      redraw();

      expect(fillText.calls.count()).toBe(26);
      expect(fillText.calls.allArgs().slice(0, 3)).toEqual([
        ['0', 4.5, 4],
        ['2', 44.5, 4],
        ['4', 84.5, 4],
      ]);
    }));

    it('counts minutes and seconds on a grid by time', fakeAsync(() => {
      project.compositions[0].gridType = 'time';
      render();
      const fillText = spyOnRuler('fillText');
      redraw();

      expect(fillText.calls.allArgs().slice(0, 3)).toEqual([
        ['0:00', 4.5, 4],
        ['0:10', 104.5, 4],
        ['0:20', 204.5, 4],
      ]);
    }));

    it('marks where the selected clip plays', fakeAsync(() => {
      render();
      timelineService.selectRegion(region('chorus'));
      settle();

      const canvas = element.querySelector<HTMLCanvasElement>('.tl-ruler canvas');
      expect(pixel(canvas, 400, 1)[3]).toBeGreaterThan(0);
      expect(pixel(canvas, 300, 1)[3]).toBeGreaterThan(pixel(canvas, 400, 1)[3]);
      expect(pixel(canvas, 250, 1)[3]).toBe(0);
      expect(component().selectedBand).toEqual({ leftPx: 300, widthPx: 200 });
    }));

    it('shades the time after the end of the composition', fakeAsync(() => {
      render();

      const canvas = element.querySelector<HTMLCanvasElement>('.tl-ruler canvas');
      expect(pixel(canvas, 650, 1)[3]).toBe(0);
      expect(pixel(canvas, 700, 1)[3]).toBe(255);
      expect(pixel(canvas, 850, 1)).toEqual([0, 0, 0, 56]);
    }));

    it('draws the part of the ruler scrolled into view', fakeAsync(() => {
      render();
      timelineService.applyZoom(20);
      settle();
      scroller().scrollLeft = 400;
      scroller().dispatchEvent(new Event('scroll'));
      const fillText = spyOnRuler('fillText');
      settle();

      // 400px are 20 seconds: the bar at 20 seconds is the first one in view
      expect(fillText.calls.argsFor(0)).toEqual(['10', 4.5, 4]);
    }));
  });

  describe('showing the position of the playback', () => {
    it('moves the playhead and the time along', fakeAsync(() => {
      render();

      timelineService.seekToMillis(25000);

      expect(playhead().style.transform).toBe('translateX(450px)');
      expect(playhead().style.visibility).toBe('visible');
      expect(element.querySelector('.card-body > .d-flex').textContent).toContain('00:25.000');
      expect(element.querySelector('.card-body > .d-flex').textContent).toContain('- 01:10.000');
    }));

    it('hides the playhead, while the position is scrolled out of view', fakeAsync(() => {
      render();
      timelineService.applyZoom(60);
      settle();

      timelineService.seekToMillis(30000);

      expect(playhead().style.visibility).toBe('hidden');
      expect(scroller().scrollLeft).toBe(0);
    }));

    it('follows the playback a page at a time', fakeAsync(() => {
      render();
      timelineService.applyZoom(60);
      settle();

      timelineService.play();
      now = 20000;
      tick(40);

      expect(scroller().scrollLeft).toBe(1180);
      expect(playhead().style.transform).toBe('translateX(220px)');

      timelineService.pause();
      discardPeriodicTasks();
    }));
  });

  describe('the pointer over the ruler', () => {
    it('shows the time a click would jump to', fakeAsync(() => {
      render();

      mouse(element.querySelector('.tl-ruler canvas'), 'mousemove', x(30000));

      expect(hoverLine().style.visibility).toBe('visible');
      expect(hoverLine().style.transform).toBe('translateX(500px)');
      expect(hoverLine().textContent).toBe('00:30.000');
      expect(hoverLine().classList).not.toContain('tl-hover-flip');

      mouse(element.querySelector('.tl-ruler canvas'), 'mousemove', x(95000));
      expect(hoverLine().classList).toContain('tl-hover-flip');

      mouse(frame(), 'mouseleave', 0);
      expect(hoverLine().style.visibility).toBe('hidden');
    }));

    it('shows no time over the tracks', fakeAsync(() => {
      render();
      mouse(element.querySelector('.tl-ruler canvas'), 'mousemove', x(30000));

      mouse(lane(0), 'mousemove', x(30000), y(0));

      expect(hoverLine().style.visibility).toBe('hidden');
    }));

    it('lights the playhead up, where it can be taken', fakeAsync(() => {
      render();
      timelineService.seekToMillis(20000);

      mouse(element.querySelector('.tl-ruler canvas'), 'mousemove', x(20000) + 3);

      expect(frame().classList).toContain('tl-playhead-hover');
      expect(hoverLine().style.visibility).toBe('hidden');

      mouse(element.querySelector('.tl-ruler canvas'), 'mousemove', x(20000) + 8);
      expect(frame().classList).not.toContain('tl-playhead-hover');
    }));

    it('jumps to the time clicked, and follows the pointer while it is dragged', fakeAsync(() => {
      render();
      const ruler = element.querySelector('.tl-ruler canvas');

      mouse(ruler, 'mousedown', x(30000));
      expect(timelineService.getCurrentMillis()).toBe(30000);
      expect(previewLive).toHaveBeenCalledWith('Song', 30000);
      expect(document.activeElement).toBe(frame());

      mouse(document, 'mousemove', x(40000), 500);
      expect(timelineService.getCurrentMillis()).toBe(40000);
      expect(dragCursor().style.cursor).toBe('ew-resize');
      expect(frame().classList).toContain('tl-playhead-hover');

      // not past the end of the timeline
      mouse(document, 'mousemove', x(150000));
      expect(timelineService.getCurrentMillis()).toBe(100000);

      mouse(document, 'mouseup', x(150000));
      expect(dragCursor()).toBeUndefined();

      mouse(document, 'mousemove', x(10000));
      expect(timelineService.getCurrentMillis()).toBe(100000);
    }));

    it('takes the playhead where it is, without jumping', fakeAsync(() => {
      render();
      timelineService.seekToMillis(20000);
      previewLive.calls.reset();

      mouse(element.querySelector('.tl-ruler'), 'mousedown', x(20000) + 3);
      expect(timelineService.getCurrentMillis()).toBe(20000);
      expect(previewLive).not.toHaveBeenCalled();

      mouse(document, 'mousemove', x(20000) + 53);
      mouse(document, 'mouseup', x(20000) + 53);

      expect(timelineService.getCurrentMillis()).toBe(25000);
    }));

    it('only reacts to the left button', fakeAsync(() => {
      render();

      mouse(element.querySelector('.tl-ruler'), 'mousedown', x(30000), 0, { button: 2 });

      expect(timelineService.getCurrentMillis()).toBe(0);
    }));
  });

  describe('zooming', () => {
    it('zooms in and out with the buttons and the slider, never further out than the whole composition', fakeAsync(() => {
      render();

      element.querySelector<HTMLElement>('.fa-search-plus').click();
      settle();
      expect(component().pxPerSecond).toBe(20);
      expect(element.querySelector<HTMLElement>('.tl-content').style.width).toBe('2200px');

      element.querySelector<HTMLElement>('.fa-search-minus').click();
      settle();
      expect(component().pxPerSecond).toBe(10);

      fixture.debugElement.query(By.css('mv-slider')).triggerEventHandler('change', { oldValue: 0, newValue: 60 });
      settle();
      expect(component().pxPerSecond).toBe(60);

      timelineService.applyZoom(5);
      settle();
      expect(component().pxPerSecond).toBe(10);
    }));

    it('zooms with the wheel while ctrl is pressed, keeping the time under the pointer', fakeAsync(() => {
      render();
      const pointer = x(30000);

      const zoomIn = new WheelEvent('wheel', { clientX: pointer, deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
      scroller().dispatchEvent(zoomIn);
      settle();

      expect(zoomIn.defaultPrevented).toBe(true);
      expect(component().pxPerSecond).toBe(13);
      expect(scroller().scrollLeft).toBe(90);
      expect(x(30000)).toBeCloseTo(pointer, 5);

      scroller().dispatchEvent(new WheelEvent('wheel', { clientX: pointer, deltaY: 100, metaKey: true, bubbles: true, cancelable: true }));
      settle();
      expect(component().pxPerSecond).toBe(10);
    }));

    it('scrolls with the wheel alone', fakeAsync(() => {
      render();

      const scroll = new WheelEvent('wheel', { clientX: x(30000), deltaY: -100, bubbles: true, cancelable: true });
      scroller().dispatchEvent(scroll);

      expect(scroll.defaultPrevented).toBe(false);
      expect(timelineService.zoom).toBe(0);
    }));
  });

  describe('the clips', () => {
    it('selects the clip clicked, and the scene played in it', fakeAsync(() => {
      render();

      drag(clip('Chorus'), [x(40000), y(0)]);

      expect(timelineService.selectedPlaybackRegion).toBe(region('chorus'));
      expect(sceneService.selectedScenes).toEqual([scene('chorus')]);
      expect(clip('Chorus').classList).toContain('tl-clip-selected');
      expect(clip('Chorus').querySelectorAll('.tl-clip-handle').length).toBe(2);
      expect(clip('Verse').querySelector('.tl-clip-handle')).toBeNull();
      expect(document.activeElement).toBe(frame());

      tick();
      fixture.detectChanges();
      const times = Array.from(element.querySelectorAll<HTMLInputElement>('.sd-value-input-time')).map((input) => input.value);
      expect(times).toEqual(['30000', '50000']);
    }));

    it('moves a clip along its track, onto the grid', fakeAsync(() => {
      render();

      mouse(clip('Chorus'), 'mousedown', x(40000), y(0));
      mouse(document, 'mousemove', x(52340), y(0));
      expect(dragCursor().style.cursor).toBe('grabbing');

      mouse(document, 'mouseup', x(52340), y(0));
      settle();

      expect([region('chorus').startMillis, region('chorus').endMillis]).toEqual([42500, 62500]);
      expect(clip('Chorus').style.left).toBe('425px');
      expect(previewLive).toHaveBeenCalled();
      expect(dragCursor()).toBeUndefined();
    }));

    it('leaves a clip where it is, until the pointer has moved a few pixels', fakeAsync(() => {
      render();

      mouse(clip('Chorus'), 'mousedown', x(40000), y(0));
      previewLive.calls.reset();
      mouse(document, 'mousemove', x(40000) + 3, y(0));
      mouse(document, 'mouseup', x(40000) + 3, y(0));
      settle();

      expect([region('chorus').startMillis, region('chorus').endMillis]).toEqual([30000, 50000]);
      expect(previewLive).not.toHaveBeenCalled();
    }));

    it('keeps a clip inside the timeline', fakeAsync(() => {
      render();

      drag(clip('Outro'), [x(50000), y(1)], [x(200000), y(1)]);
      expect([region('outro').startMillis, region('outro').endMillis]).toEqual([70000, 100000]);

      // the composition got longer: the timeline did as well
      expect(component().timelineMillis).toBe(130000);

      drag(clip('Outro'), [x(80000), y(1)], [x(-20000), y(1)]);
      expect([region('outro').startMillis, region('outro').endMillis]).toEqual([0, 30000]);
    }));

    it('moves a clip onto another track, keeping its time', fakeAsync(() => {
      render();

      drag(clip('Verse'), [x(10000), y(0)], [x(10000) + 1, y(1)]);

      expect(region('verse').trackUuid).toBe('backing');
      expect([region('verse').startMillis, region('verse').endMillis]).toEqual([0, 20000]);
      expect(clipNames(trackRows()[1])).toEqual(['Verse', 'Outro']);
      expect(timelineService.selectedTrackUuid).toBe('backing');
    }));

    it('keeps a clip on its track, while it is dragged below the tracks', fakeAsync(() => {
      render();

      drag(clip('Outro'), [x(50000), y(1)], [x(60000), y(1) + 200]);

      expect(region('outro').trackUuid).toBe('backing');
      expect([region('outro').startMillis, region('outro').endMillis]).toEqual([50000, 80000]);
    }));

    it('puts a clip back, if it is dropped onto another one', fakeAsync(() => {
      render();

      mouse(clip('Chorus'), 'mousedown', x(40000), y(0));
      mouse(document, 'mousemove', x(40000), y(1));
      fixture.detectChanges();

      expect(clip('Chorus').classList).toContain('tl-clip-invalid');

      mouse(document, 'mouseup', x(40000), y(1));
      settle();

      expect(region('chorus').trackUuid).toBe('lead');
      expect([region('chorus').startMillis, region('chorus').endMillis]).toEqual([30000, 50000]);
      expect(clip('Chorus').classList).not.toContain('tl-clip-invalid');
    }));

    it('resizes the selected clip by its edges, up to the clips next to it', fakeAsync(() => {
      render();
      drag(clip('Chorus'), [x(40000), y(0)]);

      drag(clip('Chorus').querySelector('.tl-clip-handle-end'), [x(50000), y(0)], [x(56200), y(0)]);
      expect(region('chorus').endMillis).toBe(56000);

      drag(clip('Chorus').querySelector('.tl-clip-handle-start'), [x(30000), y(0)], [x(15000), y(0)]);
      expect(region('chorus').startMillis).toBe(20000);

      // never shorter than the shortest clip
      drag(clip('Chorus').querySelector('.tl-clip-handle-start'), [x(20000), y(0)], [x(58000), y(0)]);
      expect(region('chorus').startMillis).toBe(56000 - TimelineService.minRegionMillis);

      drag(clip('Chorus').querySelector('.tl-clip-handle-end'), [x(56000), y(0)], [x(200000), y(0)]);
      expect(region('chorus').endMillis).toBe(100000);
    }));

    it('only reacts to the left button', fakeAsync(() => {
      render();

      mouse(clip('Chorus'), 'mousedown', x(40000), y(0), { button: 1 });

      expect(timelineService.selectedPlaybackRegion).toBeUndefined();
    }));

    it('takes the start and the end of the selected clip typed in, inside the room it has', fakeAsync(() => {
      render();
      timelineService.selectRegion(region('chorus'));
      settle();
      const [start, end] = Array.from(element.querySelectorAll<HTMLInputElement>('.sd-value-input-time'));

      type(start, '25000');
      expect(region('chorus').startMillis).toBe(25000);
      expect(previewLive).toHaveBeenCalled();

      // not over the verse before it
      type(start, '10000');
      expect(region('chorus').startMillis).toBe(20000);

      type(end, '90000');
      expect(region('chorus').endMillis).toBe(90000);

      // not shorter than the shortest clip
      type(end, '10000');
      expect(region('chorus').endMillis).toBe(20000 + TimelineService.minRegionMillis);
      type(start, '50000');
      expect(region('chorus').startMillis).toBe(20000);

      for (const typed of ['', 'abc', '-5']) {
        type(start, typed);
        type(end, typed);
      }
      expect([region('chorus').startMillis, region('chorus').endMillis]).toEqual([20000, 20100]);
    }));

    it('limits the end typed in by the clip after it', fakeAsync(() => {
      render();
      timelineService.selectRegion(region('verse'));
      settle();

      type(element.querySelectorAll<HTMLInputElement>('.sd-value-input-time')[1], '40000');

      expect(region('verse').endMillis).toBe(30000);
    }));

    it('ignores a time typed in, once no clip is selected', fakeAsync(() => {
      render();

      component().setRegionStartMillis('1000');
      component().setRegionEndMillis('1000');

      expect(region('verse').startMillis).toBe(0);
    }));
  });

  describe('drawing a clip', () => {
    beforeEach(() => {
      sceneService.selectedScenes = [project.scenes[2]];
    });

    it('draws the selected scene onto an empty spot of a track', fakeAsync(() => {
      render();

      mouse(lane(0), 'mousedown', x(60000), y(0));
      mouse(document, 'mousemove', x(66300), y(0));
      expect(dragCursor().style.cursor).toBe('col-resize');

      const drawn = timelineService.selectedPlaybackRegion;
      expect([drawn.sceneUuid, drawn.trackUuid, drawn.startMillis, drawn.endMillis]).toEqual(['outro', 'lead', 60000, 66500]);

      // backwards from where it was started, but not over the chorus
      mouse(document, 'mousemove', x(55000), y(0));
      expect([drawn.startMillis, drawn.endMillis]).toEqual([55000, 60000]);
      mouse(document, 'mousemove', x(42000), y(0));
      expect([drawn.startMillis, drawn.endMillis]).toEqual([50000, 60000]);

      mouse(document, 'mouseup', x(42000), y(0));
      settle();

      expect(composition().scenePlaybackRegions.length).toBe(4);
      expect(clipNames(trackRows()[0])).toEqual(['Verse', 'Chorus', 'Outro']);
      expect(trackRows()[0].querySelector('.tl-clip-selected .tl-clip-name').textContent).toBe('Outro');
      expect(previewLive).toHaveBeenCalled();
    }));

    it('draws a scene below the tracks onto a new track, named after it', fakeAsync(() => {
      render();

      drag(element.querySelector('.tl-add-lane'), [x(10000), 0], [x(20000), 0]);

      expect(trackNames()).toEqual(['Lead', 'Backing', 'Outro']);
      expect(clipNames(trackRows()[2])).toEqual(['Outro']);
      expect([timelineService.selectedPlaybackRegion.startMillis, timelineService.selectedPlaybackRegion.endMillis]).toEqual([
        10000, 20000,
      ]);
      expect(timelineService.selectedTrackUuid).toBe(composition().tracks[2].uuid);
    }));

    it('draws nothing where the grid puts the start onto a clip', fakeAsync(() => {
      render();

      drag(lane(0), [x(29800), y(0)], [x(25000), y(0)]);

      expect(composition().scenePlaybackRegions.length).toBe(3);
      expect(dragCursor()).toBeUndefined();
    }));

    it('draws nothing shorter than the shortest clip', fakeAsync(() => {
      render();
      timelineService.applyZoom(200);
      settle();

      drag(lane(0), [x(60000), y(0)], [x(60000) + 15, y(0)]);

      expect(composition().scenePlaybackRegions.length).toBe(3);
    }));

    it('only selects the track clicked, while not exactly one scene is selected', fakeAsync(() => {
      sceneService.selectedScenes = [];
      render();
      timelineService.selectRegion(region('verse'));
      sceneService.selectedScenes = [];

      drag(lane(1), [x(10000), y(1)], [x(20000), y(1)]);

      expect(composition().scenePlaybackRegions.length).toBe(3);
      expect(timelineService.selectedTrackUuid).toBe('backing');
      expect(timelineService.selectedPlaybackRegion).toBeUndefined();
      expect(trackRows()[1].classList).toContain('tl-track-selected');
    }));

    it('only reacts to the left button', fakeAsync(() => {
      render();

      drag(lane(1), [x(10000), y(1)]);
      mouse(lane(0), 'mousedown', x(60000), y(0), { button: 2 });

      expect(timelineService.selectedTrackUuid).toBe('backing');
    }));
  });

  describe('the tracks', () => {
    it('adds a track right below the one selected', fakeAsync(() => {
      render();

      element.querySelector<HTMLElement>('.tl-corner .tl-icon-button').click();
      settle();
      expect(trackNames()).toEqual(['Lead', 'Track 3', 'Backing']);
      expect(trackRows()[1].classList).toContain('tl-track-selected');

      element.querySelector<HTMLElement>('.tl-add-track').click();
      settle();
      expect(trackNames()).toEqual(['Lead', 'Track 3', 'Track 4', 'Backing']);
    }));

    it('adds a track at the bottom, while none is selected', fakeAsync(() => {
      render();
      timelineService.selectedTrackUuid = undefined;

      element.querySelector<HTMLElement>('.tl-add-track').click();
      settle();

      expect(trackNames()).toEqual(['Lead', 'Backing', 'Track 3']);
    }));

    it('selects a track by its name', fakeAsync(() => {
      render();
      timelineService.selectRegion(region('verse'));

      drag(head(1), [10, y(1)]);

      expect(timelineService.selectedTrackUuid).toBe('backing');
      expect(timelineService.selectedPlaybackRegion).toBeUndefined();
    }));

    it('renames a track with a double click on its name', fakeAsync(() => {
      render();

      const name = head(1).querySelector<HTMLElement>('.inline-edit-value');
      name.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      settle();
      tick();

      const input = head(1).querySelector<HTMLInputElement>('input');
      input.value = 'Strings';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      settle();

      expect(trackNames()).toEqual(['Lead', 'Strings']);
    }));

    it('moves a track by its name, in front of the track it is dropped on', fakeAsync(() => {
      render();
      const lead = trackRows()[0].getBoundingClientRect();

      mouse(head(1), 'mousedown', 10, y(1));
      mouse(document, 'mousemove', 10, y(1) - 2);
      fixture.detectChanges();
      expect(trackRows()[1].classList).not.toContain('tl-track-dragging');

      mouse(document, 'mousemove', 10, lead.top + 5);
      fixture.detectChanges();
      expect(trackRows()[1].classList).toContain('tl-track-dragging');
      expect(trackRows()[0].classList).toContain('tl-insert-before');
      expect(dragCursor().style.cursor).toBe('grabbing');

      mouse(document, 'mouseup', 10, lead.top + 5);
      settle();

      expect(trackNames()).toEqual(['Backing', 'Lead']);
      expect(trackRows().some((row) => row.classList.contains('tl-insert-before'))).toBe(false);
      expect(previewLive).toHaveBeenCalled();
    }));

    it('moves a track to the bottom, dropped below the tracks', fakeAsync(() => {
      render();

      mouse(head(0), 'mousedown', 10, y(0));
      mouse(document, 'mousemove', 10, y(1) + 100);
      fixture.detectChanges();
      expect(element.querySelector('.tl-add-row').classList).toContain('tl-insert-before');

      mouse(document, 'mouseup', 10, y(1) + 100);
      settle();

      expect(trackNames()).toEqual(['Backing', 'Lead']);
    }));

    it('keeps the order of the tracks for a click on a name', fakeAsync(() => {
      render();

      drag(head(1), [10, y(1)], [10, y(1) + 1]);

      expect(trackNames()).toEqual(['Lead', 'Backing']);
    }));

    it('leaves the clicks on the buttons of a track to them', fakeAsync(() => {
      render();

      mouse(head(1).querySelector('.tl-solo'), 'mousedown', 150, y(1));
      mouse(document, 'mousemove', 150, y(0));
      mouse(document, 'mouseup', 150, y(0));
      settle();

      expect(timelineService.selectedTrackUuid).toBe('lead');
      expect(trackNames()).toEqual(['Lead', 'Backing']);
    }));

    it('removes an empty track at once, one with clips once that is confirmed', fakeAsync(() => {
      const warning = spyOn(TestBed.inject(WarningDialogService), 'show').and.returnValue(of(false));
      render();
      timelineService.addTrack();
      settle();

      trackRows()[2].querySelector<HTMLElement>('.tl-remove').click();
      settle();
      expect(trackNames()).toEqual(['Lead', 'Backing']);
      expect(warning).not.toHaveBeenCalled();

      trackRows()[0].querySelector<HTMLElement>('.tl-remove').click();
      settle();
      expect(warning).toHaveBeenCalledWith('designer.timeline.warning-delete-track');
      expect(trackNames()).toEqual(['Lead', 'Backing']);

      warning.and.returnValue(of(true));
      trackRows()[0].querySelector<HTMLElement>('.tl-remove').click();
      settle();
      expect(trackNames()).toEqual(['Backing']);
      expect(composition().scenePlaybackRegions.map((candidate) => candidate.sceneUuid)).toEqual(['outro']);
    }));
  });

  describe('the keyboard', () => {
    it('removes the selected clip with the delete key', fakeAsync(() => {
      render();
      drag(clip('Chorus'), [x(40000), y(0)]);

      const event = key(frame(), 'Delete');

      expect(event.defaultPrevented).toBe(true);
      expect(region('chorus')).toBeUndefined();
      expect(clip('Chorus')).toBeUndefined();
    }));

    it('removes the track whose name was clicked last with the backspace key', fakeAsync(() => {
      spyOn(TestBed.inject(WarningDialogService), 'show').and.returnValue(of(true));
      render();
      drag(head(1), [10, y(1)]);

      key(frame(), 'Backspace');
      settle();

      expect(trackNames()).toEqual(['Lead']);
    }));

    it('removes no track, once a lane was clicked after its name', fakeAsync(() => {
      render();
      drag(head(1), [10, y(1)]);
      drag(lane(1), [x(10000), y(1)]);

      key(frame(), 'Delete');

      expect(trackNames()).toEqual(['Lead', 'Backing']);
    }));

    it('leaves the delete key to the name of a track being typed', fakeAsync(() => {
      render();
      drag(clip('Chorus'), [x(40000), y(0)]);
      head(1)
        .querySelector<HTMLElement>('.inline-edit-value')
        .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      settle();

      key(head(1).querySelector('input'), 'Delete');

      expect(region('chorus')).toBeDefined();
    }));

    it('ignores the other keys', fakeAsync(() => {
      render();
      drag(clip('Chorus'), [x(40000), y(0)]);

      const event = key(frame(), 'a');

      expect(event.defaultPrevented).toBe(false);
      expect(region('chorus')).toBeDefined();
    }));

    it('plays and pauses with the space bar', fakeAsync(() => {
      render();

      const event = key(document, ' ');
      expect(event.defaultPrevented).toBe(true);
      expect(timelineService.playState).toBe('playing');

      key(document, ' ');
      expect(timelineService.playState).toBe('paused');
    }));

    it('leaves the space bar to a field being typed into', fakeAsync(() => {
      render();
      const input = document.createElement('input');
      document.body.appendChild(input);

      key(input, ' ');
      input.remove();

      expect(timelineService.playState).toBe('paused');
    }));

    it('plays nothing with the space bar, while there is no composition', fakeAsync(() => {
      project.compositions = [];
      render('none');

      key(document, ' ');

      expect(timelineService.playState).toBe('paused');
    }));
  });

  describe('dragging a scene in from the scene list', () => {
    let treeDragService: TreeDragService;

    beforeEach(() => {
      treeDragService = TestBed.inject(TreeDragService);
      treeDragService.start([{ id: 'outro', isFolder: true, scene: project.scenes[2] }]);
    });

    function dragEvent(target: Element, type: string, clientX: number, clientY: number, relatedTarget?: EventTarget): DragEvent {
      const event = new DragEvent(type, { bubbles: true, cancelable: true, clientX, clientY, relatedTarget });
      // what the browser carries along a drag, which only a real drag lets be changed
      Object.defineProperty(event, 'dataTransfer', { value: { dropEffect: 'none' } });
      target.dispatchEvent(event);
      fixture.detectChanges();
      return event;
    }

    it('shows where the scene would land, four bars long, and puts it there', fakeAsync(() => {
      render();

      const over = dragEvent(lane(0), 'dragover', x(60300), y(0));

      expect(over.defaultPrevented).toBe(true);
      expect(over.dataTransfer.dropEffect).toBe('copy');
      expect([ghost().style.left, ghost().style.width]).toEqual(['605px', '80px']);
      expect(trackRows()[0].classList).toContain('tl-drop-target');
      expect(ghost().classList).not.toContain('tl-clip-invalid');

      dragEvent(lane(0), 'drop', x(60300), y(0));
      settle();

      const dropped = timelineService.selectedPlaybackRegion;
      expect([dropped.sceneUuid, dropped.trackUuid, dropped.startMillis, dropped.endMillis]).toEqual(['outro', 'lead', 60500, 68500]);
      expect(ghost()).toBeNull();
      expect(document.activeElement).toBe(frame());
    }));

    it('shortens the scene up to the clip after it', fakeAsync(() => {
      render();

      dragEvent(lane(0), 'dragenter', x(25000), y(0));

      expect([ghost().style.left, ghost().style.width]).toEqual(['250px', '50px']);
    }));

    it('refuses the scene on a clip', fakeAsync(() => {
      render();

      dragEvent(clip('Chorus'), 'dragover', x(40000), y(0));
      expect(ghost().classList).toContain('tl-clip-invalid');

      dragEvent(clip('Chorus'), 'drop', x(40000), y(0));
      settle();
      expect(composition().scenePlaybackRegions.length).toBe(3);
    }));

    it('refuses the scene at the very end of the timeline', fakeAsync(() => {
      render();

      dragEvent(element.querySelector('.tl-add-lane'), 'dragover', x(100000), 0);
      expect(ghost().classList).toContain('tl-clip-invalid');

      dragEvent(element.querySelector('.tl-add-lane'), 'drop', x(100000), 0);
      expect(trackNames()).toEqual(['Lead', 'Backing']);
    }));

    it('puts the scene dropped below the tracks onto a new track of its own', fakeAsync(() => {
      render();

      dragEvent(element.querySelector('.tl-add-lane'), 'dragover', x(10000), 0);
      expect(element.querySelector('.tl-add-row').classList).toContain('tl-drop-target');
      expect(element.querySelector('.tl-add-lane .tl-clip-ghost')).not.toBeNull();

      dragEvent(element.querySelector('.tl-add-lane'), 'drop', x(10000), 0);
      settle();

      expect(trackNames()).toEqual(['Lead', 'Backing', 'Outro']);
      expect(clipNames(trackRows()[2])).toEqual(['Outro']);
      expect([timelineService.selectedPlaybackRegion.startMillis, timelineService.selectedPlaybackRegion.endMillis]).toEqual([
        10000, 18000,
      ]);
      expect(element.querySelector('.tl-add-row').classList).not.toContain('tl-drop-target');
    }));

    it('says where to drop the first scene, while there are no tracks', fakeAsync(() => {
      render(1);

      dragEvent(element.querySelector('.tl-add-lane'), 'dragover', x(10000), 0);

      expect(element.querySelector('.tl-empty-hint')).toBeNull();
      expect(ghost()).not.toBeNull();
    }));

    it('forgets the scene once the drag leaves the timeline or ends', fakeAsync(() => {
      render();

      dragEvent(lane(0), 'dragover', x(60000), y(0));
      dragEvent(lane(0), 'dragleave', x(60000), y(0), clip('Chorus'));
      expect(ghost()).not.toBeNull();

      dragEvent(lane(0), 'dragleave', x(60000), y(0), document.body);
      expect(ghost()).toBeNull();

      dragEvent(lane(0), 'dragover', x(60000), y(0));
      document.dispatchEvent(new Event('dragend'));
      fixture.detectChanges();
      expect(ghost()).toBeNull();

      document.dispatchEvent(new Event('dragend'));
      expect(composition().scenePlaybackRegions.length).toBe(3);
    }));

    it('takes no preset of a scene', fakeAsync(() => {
      treeDragService.start([{ id: 'outro/red', scene: project.scenes[2], preset: new Preset({ uuid: 'red' }) }]);
      render();

      const over = dragEvent(lane(0), 'dragover', x(60000), y(0));

      expect(over.defaultPrevented).toBe(false);
      expect(ghost()).toBeNull();
    }));
  });

  describe('the toolbar', () => {
    it('plays, pauses and rewinds', fakeAsync(() => {
      render();

      toolbarButton('fa-play').click();
      fixture.detectChanges();
      expect(timelineService.playState).toBe('playing');
      expect(element.querySelector('.fa-play')).toBeNull();

      now = 3000;
      toolbarButton('fa-pause').click();
      fixture.detectChanges();
      expect(timelineService.playState).toBe('paused');
      expect(timelineService.getCurrentMillis()).toBe(3000);

      toolbarButton('fa-step-backward').click();
      expect(timelineService.getCurrentMillis()).toBe(0);
    }));

    it('puts the selected scene onto the selected track, where the playback is, and removes it again', fakeAsync(() => {
      render();
      sceneService.selectedScenes = [scene('verse')];
      timelineService.seekToMillis(80000);

      toolbarButton('fa-file-o').click();
      settle();

      const added = timelineService.selectedPlaybackRegion;
      expect([added.sceneUuid, added.trackUuid, added.startMillis, added.endMillis]).toEqual(['verse', 'lead', 80000, 88000]);
      expect(document.activeElement).toBe(frame());

      toolbarButton('fa-trash').click();
      settle();
      expect(composition().scenePlaybackRegions.length).toBe(3);
      expect(element.querySelector('.fa-trash')).toBeNull();
    }));

    it('opens the settings of the grid', fakeAsync(() => {
      render();

      toolbarButton('fa-th').click();

      expect(showModal).toHaveBeenCalledWith(TimelineGridComponent, { keyboard: true, ignoreBackdropClick: false, class: '' });
    }));

    it('lists the compositions and switches to the one picked', fakeAsync(() => {
      render();
      const select: HTMLSelectElement = element.querySelector('select');
      tick();
      fixture.detectChanges();

      expect(Array.from(select.options).map((option) => option.textContent.trim())).toEqual(['Song', 'Empty']);
      expect(select.value).toBe('0');

      select.value = '1';
      select.dispatchEvent(new Event('change'));
      settle();

      expect(timelineService.selectedComposition).toBe(project.compositions[1]);
      expect(project.selectedCompositionUuid).toBe('empty');
      expect(trackRows().length).toBe(0);
    }));
  });

  describe('the compositions', () => {
    let closed: Subject<number>;

    beforeEach(() => {
      closed = new Subject<number>();
      showModal.and.returnValue({ content: { onClose: closed } });
    });

    it('offers to add the first composition, while there is none', fakeAsync(() => {
      project.compositions = [];
      render('none');

      expect(element.querySelector('select')).toBeNull();
      expect(frame()).toBeNull();

      const link = Array.from(element.querySelectorAll<HTMLElement>('a')).find((candidate) =>
        candidate.textContent.includes('designer.timeline.no-compositions')
      );
      link.click();

      const [type, options] = showModal.calls.mostRecent().args;
      expect(type).toBe(CompositionSettingsComponent);
      expect(options.keyboard).toBe(false);
      expect(options.ignoreBackdropClick).toBe(true);
      expect(options.initialState.composition.name).toBe('New Composition');
      expect(options.initialState.composition.uuid).toBeTruthy();

      closed.next(1);
      settle();

      expect(project.compositions).toEqual([options.initialState.composition]);
      expect(timelineService.selectedComposition).toBe(options.initialState.composition);
      expect(timelineService.selectedCompositionIndex).toBe(0);
      expect(frame()).not.toBeNull();
    }));

    it('adds a composition at the end with the button, once its settings are confirmed', fakeAsync(() => {
      render();

      element.querySelector<HTMLElement>('.fa-plus-circle').closest('a').click();
      closed.next(1);
      settle();

      expect(project.compositions.map((candidate) => candidate.name)).toEqual(['Song', 'Empty', 'New Composition']);
      expect(timelineService.selectedCompositionIndex).toBe(2);
    }));

    it('looks the composition added up in Rocket Show', fakeAsync(() => {
      timelineService.externalCompositionsAvailable = true;
      render();
      http.expectOne('composition?name=Song').flush(null);

      element.querySelector<HTMLElement>('.fa-plus-circle').closest('a').click();
      closed.next(1);
      settle();

      http.expectOne('composition?name=New%20Composition').flush(null);
      expect(timelineService.selectedComposition.name).toBe('New Composition');
    }));

    it('adds no composition, when its settings are cancelled', fakeAsync(() => {
      render();

      element.querySelector<HTMLElement>('.fa-plus-circle').closest('a').click();
      closed.next(2);
      settle();

      expect(project.compositions.length).toBe(2);
      expect(timelineService.selectedComposition).toBe(project.compositions[0]);
    }));

    it('edits the settings of the composition on a copy, taken over on OK', fakeAsync(() => {
      render();

      toolbarButton('fa-cog').click();
      const copy = showModal.calls.mostRecent().args[1].initialState.composition;
      expect(copy).not.toBe(project.compositions[0]);
      expect(copy.name).toBe('Song');
      expect(copy.scenePlaybackRegions.length).toBe(3);

      copy.name = 'Renamed';
      closed.next(1);
      settle();

      expect(project.compositions[0]).toBe(copy);
      expect(timelineService.selectedComposition).toBe(copy);
      expect(element.querySelector('select option').textContent.trim()).toBe('Renamed');
    }));

    it('keeps the composition as it was, when its settings are cancelled', fakeAsync(() => {
      render();
      const song = project.compositions[0];

      toolbarButton('fa-cog').click();
      showModal.calls.mostRecent().args[1].initialState.composition.name = 'Renamed';
      closed.next(2);

      expect(project.compositions[0]).toBe(song);
      expect(song.name).toBe('Song');
    }));

    it('removes the composition with its audio file, once that is confirmed', fakeAsync(() => {
      const warning = spyOn(TestBed.inject(WarningDialogService), 'show').and.returnValue(of(true));
      render();

      toolbarButton('fa-trash-o').click();

      expect(warning).toHaveBeenCalledWith('designer.timeline.warning-delete-composition');
      const request = http.expectOne('file/delete?compositionUuid=song');
      expect(request.request.method).toBe('POST');
      expect(project.compositions.length).toBe(2);

      request.flush({});
      settle();

      expect(project.compositions.map((candidate) => candidate.uuid)).toEqual(['empty']);
      expect(timelineService.selectedComposition).toBe(project.compositions[0]);
    }));

    it('leaves the file in the media library, when the composition is removed', fakeAsync(() => {
      spyOn(TestBed.inject(WarningDialogService), 'show').and.returnValue(of(true));
      TestBed.inject(ConfigService).enableMediaLibrary = true;
      render();

      toolbarButton('fa-trash-o').click();
      settle();

      http.expectNone('file/delete?compositionUuid=song');
      expect(project.compositions.map((candidate) => candidate.uuid)).toEqual(['empty']);
    }));

    it('keeps the composition, when removing it is cancelled', fakeAsync(() => {
      spyOn(TestBed.inject(WarningDialogService), 'show').and.returnValue(of(false));
      render();

      toolbarButton('fa-trash-o').click();

      expect(project.compositions.length).toBe(2);
    }));
  });

  // the timeline plays along an audio file, which WaveSurfer reads and plays
  describe('with an audio file', () => {
    let waveSurfer: any;

    beforeEach(() => {
      waveSurfer = {
        handlers: {},
        isReady: false,
        duration: 100,
        currentTime: 0,
        backend: { buffer: new AudioBuffer({ length: 8000, sampleRate: 8000, numberOfChannels: 1 }) },
        load: jasmine.createSpy('load'),
        play: jasmine.createSpy('play'),
        pause: jasmine.createSpy('pause'),
        destroy: jasmine.createSpy('destroy'),
        seekTo: jasmine.createSpy('seekTo').and.callFake((progress: number) => (waveSurfer.currentTime = progress * waveSurfer.duration)),
        on: (event: string, handler: () => void) => (waveSurfer.handlers[event] = handler),
        getCurrentTime: () => waveSurfer.currentTime,
        getDuration: () => waveSurfer.duration,
      };
      spyOn(WaveSurfer, 'create').and.callFake(() => waveSurfer);

      Object.assign(project.compositions[0], { syncType: 'audio', audioFileName: 'song.mp3' });
    });

    // show the timeline while the song is loaded, and once it has been read
    function renderLoading() {
      render();
      tick();
      fixture.detectChanges();
    }

    function renderSong() {
      renderLoading();
      waveSurfer.isReady = true;
      waveSurfer.handlers.ready();
      tick();
      settle();
    }

    it('shows that the song is being loaded', fakeAsync(() => {
      renderLoading();

      expect(element.querySelector('.fa-circle-o-notch')).not.toBeNull();
      expect(element.querySelector('.card-body > .d-flex').textContent).not.toContain('- ');

      waveSurfer.isReady = true;
      waveSurfer.handlers.ready();
      tick();
      settle();

      expect(element.querySelector('.fa-circle-o-notch')).toBeNull();
    }));

    it('lasts as long as the song, and shows it above the tracks', fakeAsync(() => {
      renderSong();

      expect(component().timelineMillis).toBe(100000);
      expect(component().pxPerSecond).toBe(10);
      expect(element.querySelector('.tl-after-end')).toBeNull();
      expect(frame().classList).not.toContain('tl-no-audio');
      expect(element.querySelector('.tl-wave-title').textContent).toContain('song.mp3');
    }));

    it('cuts no clip off after the end of the song', fakeAsync(() => {
      waveSurfer.duration = 50;
      renderSong();

      expect(component().timelineMillis).toBe(70000);
    }));

    it('cuts no action of Rocket Show off after the end of the song', fakeAsync(() => {
      timelineService.externalCompositionsAvailable = true;
      renderSong();
      http.expectOne('composition?name=Song').flush({ actionTriggerList: [{ positionMillis: 120000, actionList: [] }] });
      settle();

      expect(component().timelineMillis).toBe(120000);
    }));

    it('draws the waveform of the song', fakeAsync(() => {
      renderSong();
      const peaks = new Float32Array(TimelineService.peaksPerSecond * 100);
      peaks.fill(1, 0, TimelineService.peaksPerSecond * 10);
      timelineService.peaks = peaks;
      redraw();

      const canvas = element.querySelector<HTMLCanvasElement>('.tl-wave canvas');
      const middle = Math.floor(canvas.parentElement.clientHeight / 2);

      expect(pixel(canvas, 50, middle - 10)[3]).toBeGreaterThan(0);
      expect(pixel(canvas, 300, middle - 10)[3]).toBe(0);
      expect(pixel(canvas, 300, middle)[3]).toBeGreaterThan(0);
    }));

    it('jumps to the time clicked on the waveform', fakeAsync(() => {
      renderSong();

      mouse(element.querySelector('.tl-wave'), 'mousedown', x(30000));
      mouse(document, 'mouseup', x(30000));

      expect(waveSurfer.seekTo).toHaveBeenCalledWith(0.3);
      expect(timelineService.getCurrentMillis()).toBe(30000);
    }));

    it('says when the song could not be read, and opens the settings to pick another one', fakeAsync(() => {
      showModal.and.returnValue({ content: { onClose: new Subject<number>() } });
      spyOn(console, 'error');
      renderLoading();

      waveSurfer.handlers.error('not found');
      settle();

      const link = Array.from(element.querySelectorAll<HTMLElement>('a.text-warning')).find((candidate) =>
        candidate.textContent.includes('designer.timeline.audio-file-error')
      );
      link.click();

      expect(showModal).toHaveBeenCalledWith(CompositionSettingsComponent, jasmine.objectContaining({ keyboard: false }));
    }));
  });

  describe('once it is gone', () => {
    it('stops following the pointer and the playback', fakeAsync(() => {
      render();
      const further = x(60000);
      mouse(element.querySelector('.tl-ruler'), 'mousedown', x(30000));
      mouse(document, 'mousemove', x(40000));

      fixture.destroy();
      fixture.nativeElement.remove();
      fixture = undefined;

      expect(dragCursor()).toBeUndefined();

      mouse(document, 'mousemove', further);
      expect(timelineService.getCurrentMillis()).toBe(40000);

      // nothing is drawn anymore
      timelineService.seekToMillis(1000);
      timelineService.detectChanges.next();
      tick(20);
    }));
  });
});
