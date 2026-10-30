import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { ToastrModule } from 'ngx-toastr';
import { of } from 'rxjs';
import * as THREE from 'three';

import { FixtureChannelValue } from '../models/fixture-channel-value';
import { Project } from '../models/project';
import { AnimationService } from '../services/animation.service';
import { ConfigService } from '../services/config.service';
import { FixtureService } from '../services/fixture.service';
import { PresetService } from '../services/preset.service';
import { PreviewMeshService } from '../services/preview-mesh.service';
import { PREVIEW_BACKGROUND_COLOR, PreviewService } from '../services/preview.service';
import { ProjectService } from '../services/project.service';
import { SceneService } from '../services/scene.service';
import { TimelineService } from '../services/timeline.service';
import { ColorChanger3d } from './models/color-changer-3d';
import { Fixture3d } from './models/fixture-3d';
import { MovingHead3d } from './models/moving-head-3d';
import { PreviewComponent } from './preview.component';

// The 3D preview renders the stage with the fixtures of the project, in the light of what is
// playing, and can be turned off to save the time it takes.
describe('PreviewComponent', () => {
  let fixture: ComponentFixture<PreviewComponent>;
  let component: PreviewComponent;
  let project: Project;
  let previewService: PreviewService;
  let frames: ((time: number) => void)[];
  let stored: string;
  let style: HTMLStyleElement;

  // a fixture of each kind the preview knows: a par, a pixel bar with two pixels, a moving
  // head and a smoke machine, which it doesn't show
  function projectData(): any {
    return {
      fixtureProfiles: [
        {
          uuid: 'test/par',
          categories: ['Color Changer'],
          availableChannels: { Red: { capability: { type: 'ColorIntensity', color: 'Red' } } },
          modes: [{ name: 'mode', shortName: 'mode', channels: ['Red'] }],
        },
        {
          uuid: 'test/bar',
          categories: ['Pixel Bar', 'Color Changer'],
          matrix: { pixelCount: [2, 1, 1] },
          templateChannels: { 'Red $pixelKey': { capability: { type: 'ColorIntensity', color: 'Red' } } },
          modes: [
            {
              name: 'mode',
              shortName: 'mode',
              channels: [
                { insert: 'matrixChannels', repeatFor: 'eachPixelXYZ', channelOrder: 'perPixel', templateChannels: ['Red $pixelKey'] },
              ],
            },
          ],
        },
        {
          uuid: 'test/head',
          categories: ['Moving Head'],
          availableChannels: { Pan: { capability: { type: 'Pan', angleStart: '0deg', angleEnd: '540deg' } } },
          modes: [{ name: 'mode', shortName: 'mode', channels: ['Pan'] }],
        },
        {
          uuid: 'test/smoke',
          categories: ['Smoke'],
          availableChannels: { Fog: { capability: { type: 'Fog' } } },
          modes: [{ name: 'mode', shortName: 'mode', channels: ['Fog'] }],
        },
      ],
      fixtures: [
        { uuid: 'par', profileUuid: 'test/par', modeShortName: 'mode', dmxFirstChannel: 0, positioning: 'topFront' },
        { uuid: 'bar', profileUuid: 'test/bar', modeShortName: 'mode', dmxFirstChannel: 10, positioning: 'topFront' },
        { uuid: 'head', profileUuid: 'test/head', modeShortName: 'mode', dmxFirstChannel: 20, positioning: 'bottomBack' },
        { uuid: 'smoke', profileUuid: 'test/smoke', modeShortName: 'mode', dmxFirstChannel: 30, positioning: 'manual', positionX: 7 },
      ],
      presetFixtures: [
        { fixtureUuid: 'par' },
        { fixtureUuid: 'bar', pixelKey: '1' },
        { fixtureUuid: 'bar', pixelKey: '2' },
        { fixtureUuid: 'head' },
      ],
      presets: [{ uuid: 'warm', name: 'Warm' }],
      scenes: [
        { uuid: 'intro', name: 'Intro' },
        { uuid: 'verse', name: 'Verse' },
      ],
    };
  }

  beforeEach(() => {
    stored = localStorage.getItem('previewHidden');
    localStorage.removeItem('previewHidden');

    // the render fills the panel it is in
    style = document.createElement('style');
    style.textContent = '.preview-spec { display: block; width: 400px; height: 200px } .preview-spec .h-100 { height: 100% }';
    document.head.appendChild(style);

    TestBed.configureTestingModule({
      declarations: [PreviewComponent],
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot(), PopoverModule.forRoot()],
      providers: [
        // the meshes of the fixtures are loaded from the assets of the app
        { provide: PreviewMeshService, useValue: { getMesh: () => of(new THREE.Mesh()) } },
        BsModalService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    project = new Project(projectData());
    TestBed.inject(ProjectService).project = project;
    TestBed.inject(FixtureService).updateCachedFixtures();
    previewService = TestBed.inject(PreviewService);

    // the frames of the preview are rendered when the test says so (Angular asks for frames
    // of its own as well)
    frames = [];
    const requestAnimationFrame = window.requestAnimationFrame;
    spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback) =>
      callback.name === 'bound animate' ? frames.push(callback) : requestAnimationFrame.call(window, callback)
    );
  });

  afterEach(() => {
    style.remove();
    if (stored === null) {
      localStorage.removeItem('previewHidden');
    } else {
      localStorage.setItem('previewHidden', stored);
    }
  });

  function open() {
    fixture = TestBed.createComponent(PreviewComponent);
    component = fixture.componentInstance;
    fixture.nativeElement.classList.add('preview-spec');
    spyOn(console, 'warn');
    fixture.detectChanges();
  }

  // render the next frame, at the passed time
  function frame(time: number) {
    frames.shift()(time);
  }

  function scene(): THREE.Scene {
    return (component as any).scene;
  }

  function renderer(): THREE.WebGLRenderer {
    return (component as any).renderer;
  }

  function fixtures3d(): Fixture3d[] {
    return (component as any).fixtures3d;
  }

  // the 3D fixtures of a fixture of the project (a pixel bar has one for each pixel)
  function fixture3dOf(uuid: string): Fixture3d[] {
    return fixtures3d().filter((fixture3d) => fixture3d.fixture.fixture.uuid === uuid);
  }

  function element<T extends HTMLElement = HTMLElement>(selector: string): T {
    return fixture.nativeElement.querySelector(selector);
  }

  it('renders the stage on the background of the panels, lit from above', () => {
    open();

    expect(previewService.scene).toBe(scene());
    expect((scene().background as THREE.Color).getHex()).toBe(PREVIEW_BACKGROUND_COLOR);
    expect(scene().children.filter((child) => child instanceof THREE.AmbientLight).length).toBe(1);
    expect(scene().children.filter((child) => child instanceof THREE.PointLight).length).toBe(3);
    expect(scene().children.some((child) => child instanceof THREE.Mesh)).toBe(true);
    expect(element('.h-100').firstElementChild).toBe(renderer().domElement);
  });

  it('shows the fixtures it knows, each in a group of its own', () => {
    open();

    expect(fixture3dOf('par').map((fixture3d) => fixture3d instanceof ColorChanger3d)).toEqual([true]);
    expect(fixture3dOf('head').map((fixture3d) => fixture3d instanceof MovingHead3d)).toEqual([true]);
    expect(fixture3dOf('smoke')).toEqual([]);
    expect(console.warn).toHaveBeenCalled();

    const groups = scene()
      .children.filter((child) => child instanceof THREE.Group)
      .map((group) => group.name);
    expect(groups).toEqual(['fixture-par', 'fixture-bar', 'fixture-head', 'fixture-smoke']);
  });

  it('shows the pixels of a bar as bulbs without a beam', () => {
    open();

    const pixels: any[] = fixture3dOf('bar');
    expect(pixels.map((pixel) => pixel.fixture.pixel.key)).toEqual(['1', '2']);
    expect(pixels.map((pixel) => [pixel.hasSpotLight, pixel.hasBulb])).toEqual([
      [false, true],
      [false, true],
    ]);
    expect((fixture3dOf('par')[0] as any).hasSpotLight).toBe(true);
  });

  it('shows the fixtures again when the fixture setup changes', () => {
    open();
    const par = fixture3dOf('par')[0];
    spyOn(par, 'destroy');

    project.fixtures = project.fixtures.filter((projectFixture) => projectFixture.uuid !== 'head');
    TestBed.inject(FixtureService).updateCachedFixtures();
    previewService.updateFixtureSetup();

    expect(par.destroy).toHaveBeenCalled();
    expect(fixture3dOf('par')[0] === par).toBe(false);
    expect(fixture3dOf('head')).toEqual([]);
    expect(scene().getObjectByName('fixture-head')).toBeUndefined();
  });

  it('spreads the fixtures evenly over their side of the stage, a bar with all its pixels in one place', () => {
    open();
    frame(0);

    const positions = ['par', 'bar', 'head', 'smoke']
      .map((uuid) => project.fixtures.find((projectFixture) => projectFixture.uuid === uuid))
      .map((projectFixture) => [projectFixture.positionX, projectFixture.positionY, projectFixture.positionZ]);

    // the width of the stage shared by two fixtures at the top front, and the one at the
    // bottom back in the middle (the stage is 600 cm wide and deep, 350 cm high and its floor 30 cm)
    expect(positions).toEqual([
      [-100, 380, 230],
      [100, 380, 230],
      [0, 30, -230],
      [7, 0, 0],
    ]);
  });

  it('places the fixtures at the top back and the bottom front as well', () => {
    project.fixtures[0].positioning = 'topBack' as any;
    project.fixtures[1].positioning = 'bottomFront' as any;
    open();
    frame(0);

    expect([project.fixtures[0].positionX, project.fixtures[0].positionY, project.fixtures[0].positionZ]).toEqual([0, 380, -230]);
    expect([project.fixtures[1].positionX, project.fixtures[1].positionY, project.fixtures[1].positionZ]).toEqual([0, 30, 230]);
  });

  it('moves the 3D fixtures only when the stage or the positions changed', () => {
    open();
    const updatePosition = spyOn(fixture3dOf('par')[0], 'updatePosition');
    previewService.stageAndPositionsDirty = true;

    frame(0);
    frame(16);

    expect(updatePosition).toHaveBeenCalledTimes(1);
    expect(previewService.stageAndPositionsDirty).toBe(false);
  });

  it('shows the fixtures in the light of what is playing, dimmed by the master dimmer, at the time it plays', () => {
    project.masterDimmerValue = 0.5;
    open();
    const par = fixture3dOf('par')[0];
    const head = fixture3dOf('head')[0];
    const value = new FixtureChannelValue();
    value.channelName = 'Red';
    value.value = 255;
    spyOn(previewService, 'getChannelValues').and.returnValue(new Map([[par.fixture, [value]]]));
    spyOn(par, 'updatePreview');
    spyOn(head, 'updatePreview');

    frame(1000);

    expect(previewService.getChannelValues).toHaveBeenCalledWith(1000, jasmine.any(Array));
    expect(par.updatePreview).toHaveBeenCalledWith([value], 0.5, 1000);
    expect(head.updatePreview).toHaveBeenCalledWith([], 0.5, 1000);
  });

  it('plays the time of the timeline while it plays, and of the clock otherwise', () => {
    open();
    const animationService = TestBed.inject(AnimationService);
    const timelineService = TestBed.inject(TimelineService);
    const getPresets = spyOn(previewService, 'getPresets').and.returnValue([]);

    frame(1000);

    expect(animationService.timeMillis).toBe(1000);
    expect(getPresets).toHaveBeenCalledWith(1000);

    timelineService.playState = 'playing';
    spyOn(timelineService, 'getCurrentMillis').and.returnValue(5000);
    frame(2000);

    expect(animationService.timeMillis).toBe(5000);
    expect(getPresets).toHaveBeenCalledWith(5000);
  });

  it('marks the fixtures of what is playing as selected', () => {
    open();
    spyOn(previewService, 'fixtureIsSelected').and.callFake((uuid: string) => uuid === 'par');

    frame(0);

    expect(fixture3dOf('par')[0].isSelected).toBe(true);
    expect(fixture3dOf('head')[0].isSelected).toBe(false);
  });

  it('marks the fixtures selected in the settings, while they are open', () => {
    open();
    const fixtureService = TestBed.inject(FixtureService);
    fixtureService.settingsSelection = true;
    spyOn(fixtureService, 'settingsFixtureIsSelected').and.callFake((selected) => selected.uuid === 'head');

    frame(0);

    expect(fixture3dOf('par')[0].isSelected).toBe(false);
    expect(fixture3dOf('head')[0].isSelected).toBe(true);
  });

  it('picks a spot on the stage with a click while one is being picked, not while the view is turned', () => {
    open();
    frame(0);

    const picked: number[][] = [];
    previewService.spotPicked.subscribe((spot) => picked.push(spot));
    const canvas = element('.h-100');
    const bounds = canvas.getBoundingClientRect();
    // low in the view, where the floor is
    const at = (x: number) => ({ clientX: bounds.left + bounds.width / 2 + x, clientY: bounds.top + bounds.height * 0.9 });

    // not picking: a click is a click
    component.pointerDown(new PointerEvent('pointerdown', at(0)));
    component.pointerUp(new PointerEvent('pointerup', at(0)));
    expect(picked).toEqual([]);

    previewService.pickSpot(true);
    fixture.detectChanges();
    expect(canvas.classList).toContain('preview-picking-spot');

    // turning the view around
    component.pointerDown(new PointerEvent('pointerdown', at(0)));
    component.pointerUp(new PointerEvent('pointerup', at(40)));
    // a pointer let go without being pressed here
    component.pointerUp(new PointerEvent('pointerup', at(0)));
    expect(picked).toEqual([]);

    component.pointerDown(new PointerEvent('pointerdown', at(0)));
    component.pointerUp(new PointerEvent('pointerup', at(2)));

    expect(picked.length).toBe(1);
    expect(picked[0].every((coordinate) => Number.isInteger(coordinate))).toBe(true);
    expect(previewService.pickingSpot).toBe(false);
  });

  it('fits the render into its panel', () => {
    open();

    expect(renderer().domElement.style.width).toBe('400px');
    expect(renderer().domElement.style.height).toBe('200px');
    expect((component as any).camera.aspect).toBe(2);

    fixture.nativeElement.style.height = '400px';
    window.dispatchEvent(new Event('resize'));

    expect(renderer().domElement.style.height).toBe('400px');
    expect((component as any).camera.aspect).toBe(1);
  });

  it('keeps the camera working in a panel folded to nothing', () => {
    open();

    fixture.nativeElement.style.height = '0';
    component.onResize();

    expect((component as any).camera.aspect).toBe(0);
  });

  it('can be turned off, which only keeps the clock running', () => {
    open();
    const render = spyOn(renderer(), 'render');
    const getPresets = spyOn(previewService, 'getPresets').and.callThrough();

    element('.preview-chrome-button').click();
    fixture.detectChanges();
    frame(1000);

    expect(TestBed.inject(AnimationService).timeMillis).toBe(1000);
    expect(render).not.toHaveBeenCalled();
    expect(getPresets).not.toHaveBeenCalled();
    expect(frames.length).toBe(1);

    expect(element('.preview-off').textContent).toContain('designer.preview.hidden');
    expect(element('.h-100').classList).toContain('preview-canvas-hidden');
    expect(element('.preview-chrome-button i').classList).toContain('fa-eye');
    expect(localStorage.getItem('previewHidden')).toBe('true');
  });

  it("doesn't measure the render while it is turned off", () => {
    open();
    component.switchPreviewHidden();

    fixture.nativeElement.style.height = '400px';
    component.onResize();

    expect(renderer().domElement.style.height).toBe('200px');
  });

  it('follows the stage again and measures the render anew when it is turned on', fakeAsync(() => {
    open();
    component.switchPreviewHidden();
    fixture.detectChanges();
    frame(0);
    fixture.nativeElement.style.height = '400px';

    element('.preview-chrome-button').click();
    fixture.detectChanges();

    expect(previewService.stageAndPositionsDirty).toBe(true);
    expect(localStorage.getItem('previewHidden')).toBe('false');
    expect(element('.preview-off')).toBeNull();

    tick();

    expect(renderer().domElement.style.height).toBe('400px');
  }));

  it('stays turned off the next time', () => {
    localStorage.setItem('previewHidden', 'true');
    open();

    expect(component.previewHidden).toBe(true);
    expect(element('.preview-off')).not.toBeNull();
  });

  it('names the preset playing on its own', () => {
    open();
    TestBed.inject(PresetService).selectedPreset = project.presets[0];
    fixture.detectChanges();

    expect(element('.preview-target-type').textContent).toBe('designer.preview.solo');
    expect(element('.preview-target-name').textContent).toBe('Warm');
    expect(element('.preview-target i').classList).toContain('fa-headphones');

    TestBed.inject(PresetService).selectedPreset = undefined;
    fixture.detectChanges();

    expect(element('.preview-target-name').textContent).toBe('');
  });

  it('names the scenes playing', () => {
    open();
    TestBed.inject(PresetService).selectedPreset = project.presets[0];
    TestBed.inject(SceneService).selectedScenes = project.scenes.slice();
    fixture.detectChanges();

    expect(element('.preview-target-type').textContent).toBe('designer.preview.scene');
    expect(element('.preview-target-name').textContent).toBe('Intro, Verse');
    expect(element('.preview-target i').classList).toContain('fa-picture-o');

    // the preset switched to play on its own
    project.previewPreset = true;
    fixture.detectChanges();

    expect(element('.preview-target-name').textContent).toBe('Warm');
  });

  it('is captioned as a simulation in the free online designer, while it renders', () => {
    TestBed.inject(ConfigService).hardwarePromo = true;
    open();

    expect(element<HTMLAnchorElement>('a.preview-simulation').href).toContain('utm_content=preview-badge');

    component.switchPreviewHidden();
    fixture.detectChanges();

    expect(element('a.preview-simulation')).toBeNull();
  });

  it('has no caption on a Rocket Show device', () => {
    open();

    expect(element('a.preview-simulation')).toBeNull();
  });

  // the designer is left for another page of Rocket Show
  it('stops rendering when it is gone, and gives the WebGL context back', () => {
    open();
    const cancelAnimationFrame = spyOn(window, 'cancelAnimationFrame').and.callThrough();
    const context = renderer().getContext();
    const par = fixture3dOf('par')[0];

    fixture.destroy();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(frames.length);
    expect(context.isContextLost()).toBe(true);

    // nothing is built for the preview which is gone anymore
    previewService.updateFixtureSetup();
    expect(fixture3dOf('par')[0] === par).toBe(true);
  });
});
