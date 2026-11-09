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
import { LayoutService } from '../services/layout.service';
import { PresetService } from '../services/preset.service';
import { PreviewMeshService } from '../services/preview-mesh.service';
import { PREVIEW_BACKGROUND_COLOR, PREVIEW_GLOW_LAYER, PreviewService } from '../services/preview.service';
import { ProjectService } from '../services/project.service';
import { SceneService } from '../services/scene.service';
import { TimelineService } from '../services/timeline.service';
import { ColorChanger3d } from './models/color-changer-3d';
import { Fixture3d } from './models/fixture-3d';
import { MovingHead3d } from './models/moving-head-3d';
import { PixelFixture3d, PixelHousing3d } from './models/pixel-fixture-3d';
import { PREVIEW_MAX_LIGHTS, PreviewComponent } from './preview.component';
import { Scene } from '../models/scene';

// The 3D preview renders the stage with the fixtures of the project, in the light of what is
// playing, and can be turned off to save the time it takes.
describe('PreviewComponent', () => {
  let fixture: ComponentFixture<PreviewComponent>;
  let component: PreviewComponent;
  let project: Project;
  let previewService: PreviewService;
  let frames: ((time: number) => void)[];
  let stored: string;
  let storedGlow: string;
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
    storedGlow = localStorage.getItem('previewGlow');
    localStorage.removeItem('previewGlow');

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

    // a larger screen, the preview not folded away
    const layoutService = TestBed.inject(LayoutService);
    layoutService.compact = false;
    layoutService.folded = [];

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
    if (storedGlow === null) {
      localStorage.removeItem('previewGlow');
    } else {
      localStorage.setItem('previewGlow', storedGlow);
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

  // the body of a fixture with pixels, which its parts light
  function housingOf(uuid: string): PixelHousing3d {
    return (component as any).pixelHousings.get(uuid);
  }

  // the color an LED of a fixture with pixels shows (linear red, green and blue)
  function ledColor(uuid: string, index: number): number[] {
    const color = new THREE.Color();
    (housingOf(uuid) as any).leds.getColorAt(index, color);

    return [color.r, color.g, color.b].map((component) => Math.round(component * 1000) / 1000);
  }

  // the value of a channel, for a part of a fixture
  function channelValue(channelName: string, value: number): FixtureChannelValue {
    const channelValue = new FixtureChannelValue();
    channelValue.channelName = channelName;
    channelValue.value = value;

    return channelValue;
  }

  // the project with another profile of the bar, e.g. with general channels
  function withBar(change: (bar: any) => void) {
    const data = projectData();
    change(data.fixtureProfiles.find((profile: any) => profile.uuid === 'test/bar'));
    project = new Project(data);
    TestBed.inject(ProjectService).project = project;
    TestBed.inject(FixtureService).updateCachedFixtures();
  }

  // the bar with a dimmer among its general channels, before its pixels
  function barWithDimmer() {
    withBar((bar) => {
      bar.availableChannels = { Dimmer: { capability: { type: 'Intensity' } } };
      bar.modes[0].channels.unshift('Dimmer');
    });
  }

  // an LED lit in red alone: the other colors stay on the dark glass of one which is off
  function redLed(): number[] {
    const off = new THREE.Color(0x1c1f25);

    return [1, off.g, off.b].map((component) => Math.round(component * 1000) / 1000);
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

  it('shows a bar as a housing with an LED for each pixel, which its pixels light without a beam each', () => {
    open();

    const pixels: any[] = fixture3dOf('bar');
    expect(pixels.map((pixel) => pixel.fixture.pixel.key)).toEqual(['1', '2']);
    expect(pixels.map((pixel) => [pixel instanceof PixelFixture3d, pixel.hasSpotLight, pixel.hasBulb])).toEqual([
      [true, false, false],
      [true, false, false],
    ]);
    expect(pixels.map((pixel) => pixel.housing)).toEqual([housingOf('bar'), housingOf('bar')]);
    expect(housingOf('bar').ledCount).toBe(2);
    expect(housingOf('bar').object.parent).toBe(scene().getObjectByName('fixture-bar'));
    expect((fixture3dOf('par')[0] as any).hasSpotLight).toBe(true);

    // a bar which does not say how large it is takes the room of a pixel each
    expect([housingOf('bar').width, housingOf('bar').height]).toEqual([16, 8]);
  });

  for (const categories of [['Pixel Bar'], ['Matrix'], ['Matrix', 'Color Changer']]) {
    it(`shows a fixture of the categories ${categories.join(', ')} as a housing with LEDs`, () => {
      project.fixtureProfiles.find((profile) => profile.uuid === 'test/bar').categories = categories as any;
      TestBed.inject(FixtureService).updateCachedFixtures();
      open();

      expect(fixture3dOf('bar').map((pixel) => pixel instanceof PixelFixture3d)).toEqual([true, true]);
    });
  }

  it('lights the LEDs in the colors of their pixels, and the stage around in all of them together', () => {
    open();
    const [first, second] = fixture3dOf('bar');
    spyOn(previewService, 'getChannelValues').and.returnValue(
      new Map([
        [first.fixture, [channelValue('Red 1', 255)]],
        [second.fixture, [channelValue('Red 2', 0)]],
      ])
    );

    frame(0);

    expect(ledColor('bar', 0)).toEqual(redLed());
    // an LED which is off still shows as dark glass
    const off = new THREE.Color(0x1c1f25);
    expect(ledColor('bar', 1)).toEqual([off.r, off.g, off.b].map((component) => Math.round(component * 1000) / 1000));

    const spill = (housingOf('bar') as any).spill as THREE.PointLight;
    expect(spill.color.getHex()).toBe(0xff0000);
    expect(spill.intensity).toBeGreaterThan(0);

    // each frame starts dark
    (previewService.getChannelValues as jasmine.Spy).and.returnValue(new Map());
    frame(16);
    expect(spill.intensity).toBe(0);
  });

  it('dims all of the LEDs by a dimmer among the general channels of the fixture', () => {
    barWithDimmer();
    open();
    const general = fixture3dOf('bar').find((part) => !part.fixture.pixel);
    const [first, second] = fixture3dOf('bar').filter((part) => part.fixture.pixel);
    spyOn(previewService, 'getChannelValues').and.returnValue(
      new Map([
        [general.fixture, [channelValue('Dimmer', 0)]],
        [first.fixture, [channelValue('Red 1', 255)]],
        [second.fixture, [channelValue('Red 2', 255)]],
      ])
    );

    frame(0);
    expect(ledColor('bar', 0)[0]).toBeLessThan(0.02);

    (previewService.getChannelValues as jasmine.Spy).and.returnValue(
      new Map([
        [general.fixture, [channelValue('Dimmer', 255)]],
        [first.fixture, [channelValue('Red 1', 255)]],
        [second.fixture, [channelValue('Red 2', 255)]],
      ])
    );
    frame(16);
    expect([ledColor('bar', 0)[0], ledColor('bar', 1)[0]]).toEqual([1, 1]);
  });

  it('lights all of the LEDs alike on a fixture in a mode without pixels', () => {
    withBar((bar) => {
      bar.availableChannels = { Red: { capability: { type: 'ColorIntensity', color: 'Red' } } };
      bar.modes[0].channels = ['Red'];
    });
    open();
    const [whole] = fixture3dOf('bar');
    spyOn(previewService, 'getChannelValues').and.returnValue(new Map([[whole.fixture, [channelValue('Red', 255)]]]));

    frame(0);

    expect([ledColor('bar', 0), ledColor('bar', 1)]).toEqual([redLed(), redLed()]);
  });

  it('marks the housing of a fixture with pixels as selected once one of its pixels is', () => {
    open();
    spyOn(previewService, 'fixtureIsSelected').and.callFake((uuid: string, pixelKey: string) => pixelKey === '2');
    const body = (housingOf('bar') as any).body as THREE.Mesh;

    frame(0);
    expect(body.material).toBe(previewService.fixtureSelectedMaterial);

    (previewService.fixtureIsSelected as jasmine.Spy).and.returnValue(false);
    frame(16);
    expect(body.material).toBe(previewService.fixtureMaterial);
  });

  it('hangs a housing below the truss with its LEDs to the audience, also on the floor', () => {
    project.fixtures[1].positioning = 'bottomFront' as any;
    open();
    frame(0);

    // the group of a fixture on the floor is turned upside down, its housing not
    const housing = housingOf('bar').object;
    const group = scene().getObjectByName('fixture-bar');
    expect(group.rotation.x).toBeCloseTo(Math.PI, 9);
    housing.updateMatrixWorld(true);
    const front = new THREE.Vector3(0, 0, 1).transformDirection(housing.matrixWorld);
    expect(front.z).toBeCloseTo(1, 9);
  });

  it('builds the housings anew when the fixture setup changes', () => {
    open();
    const housing = housingOf('bar');
    spyOn(housing, 'destroy').and.callThrough();

    previewService.updateFixtureSetup();

    expect(housing.destroy).toHaveBeenCalled();
    expect(housing.object.parent).toBeNull();
    expect(housingOf('bar') === housing).toBe(false);
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

  it('lights the stage with the brightest fixtures alone, always as many of them, the beams of all of them showing', () => {
    // twelve pars in all, each a little brighter than the one before
    for (let i = 1; i <= 11; i++) {
      project.fixtures.push(
        new Project({
          fixtures: [
            { uuid: 'par-' + i, profileUuid: 'test/par', modeShortName: 'mode', dmxFirstChannel: 100 + i, positioning: 'topFront' },
          ],
        }).fixtures[0]
      );
      project.presetFixtures.push(new Project({ presetFixtures: [{ fixtureUuid: 'par-' + i }] }).presetFixtures[0]);
    }
    TestBed.inject(FixtureService).updateCachedFixtures();
    open();

    const pars = ['par', ...Array.from({ length: 11 }, (_, i) => 'par-' + (i + 1))].map((uuid) => fixture3dOf(uuid)[0]);
    const red = (level: number) => [channelValue('Red', level)];
    const values = new Map(pars.map((par, i) => [par.fixture, red(10 + i * 20)]));
    const getChannelValues = spyOn(previewService, 'getChannelValues').and.returnValue(values);
    const lit = () => pars.filter((par) => par.lightShown).map((par) => pars.indexOf(par));
    const spotLights = () => {
      let count = 0;
      scene().traverse((object) => (count += (object as THREE.SpotLight).isSpotLight && object.visible ? 1 : 0));
      return count;
    };

    frame(0);

    // the head (with neither a dimmer nor colors, it lights in white at full) and the seven brightest pars
    expect(lit()).toEqual([5, 6, 7, 8, 9, 10, 11]);
    expect(fixture3dOf('head')[0].lightShown).toBe(true);
    expect(spotLights()).toBe(PREVIEW_MAX_LIGHTS);
    expect(pars.every((par) => (par as any).spotLightBeam.visible)).toBe(true);

    // the pars dark: the ones lit before keep their light, as many lights as before
    getChannelValues.and.returnValue(new Map());
    frame(100);

    expect(lit()).toEqual([5, 6, 7, 8, 9, 10, 11]);
    expect(spotLights()).toBe(PREVIEW_MAX_LIGHTS);

    // the first one at full now: the dimmest one lit before goes dark
    getChannelValues.and.returnValue(new Map([...values, [pars[0].fixture, red(255)]]));
    frame(200);

    expect(lit()).toEqual([0, 6, 7, 8, 9, 10, 11]);
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

    element('.preview-hide-button').click();
    fixture.detectChanges();
    frame(1000);

    expect(TestBed.inject(AnimationService).timeMillis).toBe(1000);
    expect(render).not.toHaveBeenCalled();
    expect(getPresets).not.toHaveBeenCalled();
    expect(frames.length).toBe(1);

    expect(element('.preview-off').textContent).toContain('designer.preview.hidden');
    expect(element('.h-100').classList).toContain('preview-canvas-hidden');
    expect(element('.preview-hide-button i').classList).toContain('fa-eye');
    expect(localStorage.getItem('previewHidden')).toBe('true');
  });

  it('only keeps the clock running while its panel is folded, or left out on a phone', () => {
    const layoutService = TestBed.inject(LayoutService);
    open();
    const render = spyOn<any>(component, 'render');

    layoutService.folded = ['preview'];
    frame(1000);
    layoutService.folded = [];
    layoutService.compact = true;
    frame(2000);

    expect(TestBed.inject(AnimationService).timeMillis).toBe(2000);
    expect(render).not.toHaveBeenCalled();

    layoutService.compact = false;
    frame(3000);

    expect(render).toHaveBeenCalledTimes(1);
  });

  it('lets the lights glow: they are rendered alone, blurred, and added to the stage', () => {
    open();
    const glowComposer = (component as any).glowComposer;
    const composer = (component as any).composer;
    const stage = scene().children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh;
    const stageMaterial = stage.material;
    const leds = (housingOf('bar') as any).leds as THREE.InstancedMesh;
    const ledMaterial = leds.material;
    const par = fixture3dOf('par')[0];
    const beam = (par as any).spotLightBeam as THREE.Mesh;
    // the par lit, its beam shown
    spyOn(previewService, 'getChannelValues').and.returnValue(new Map([[par.fixture, [channelValue('Red', 255)]]]));
    let whileGlowing: any[];
    spyOn(glowComposer, 'render').and.callFake(() => {
      whileGlowing = [stage.material, leds.material, beam.visible, scene().background];
    });
    spyOn(composer, 'render');

    frame(0);

    expect(previewService.glow).toBe(true);
    expect(leds.layers.isEnabled(PREVIEW_GLOW_LAYER)).toBe(true);
    // the stage black in front of the lights, the beams left out, on no background
    expect(whileGlowing).toEqual([(component as any).glowDarkMaterial, ledMaterial, false, null]);
    expect(composer.render).toHaveBeenCalledTimes(1);
    // and back for the stage itself
    expect([stage.material, leds.material, beam.visible]).toEqual([stageMaterial, ledMaterial, true]);
    expect((scene().background as THREE.Color).getHex()).toBe(PREVIEW_BACKGROUND_COLOR);
    expect(element('.preview-glow-button').classList).toContain('preview-chrome-button-on');
  });

  it('can let the lights glow no more, which it keeps the next time', () => {
    open();
    const composer = spyOn((component as any).composer, 'render');
    const render = spyOn(renderer(), 'render');

    element('.preview-glow-button').click();
    fixture.detectChanges();
    frame(0);

    expect(previewService.glow).toBe(false);
    expect(localStorage.getItem('previewGlow')).toBe('false');
    expect(composer).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
    expect(element('.preview-glow-button').classList).not.toContain('preview-chrome-button-on');

    element('.preview-glow-button').click();
    expect(localStorage.getItem('previewGlow')).toBe('true');
  });

  // the frames rendered with the passed time between them, as the clock of the page goes
  function framesApart(count: number, millis: number, clock: { now: number }) {
    for (let i = 0; i < count; i++) {
      clock.now += millis;
      frame(clock.now);
    }
  }

  it('does without the glow while the preview is too slow with it, until it is switched on again', () => {
    open();
    spyOn((component as any).glowComposer, 'render');
    const composer = spyOn((component as any).composer, 'render');
    const clock = { now: 0 };
    spyOn(performance, 'now').and.callFake(() => clock.now);
    spyOn(console, 'info');

    // 12 frames a second
    framesApart(31, 80, clock);
    fixture.detectChanges();

    expect(previewService.glowSuspended).toBe(true);
    expect(previewService.glow).toBe(true);
    expect(console.info).toHaveBeenCalled();
    expect(element('.preview-glow-button').classList).not.toContain('preview-chrome-button-on');

    composer.calls.reset();
    framesApart(1, 80, clock);
    expect(composer).not.toHaveBeenCalled();

    // switched on again, it stays on
    element('.preview-glow-button').click();
    fixture.detectChanges();
    framesApart(40, 80, clock);

    expect(previewService.glowing).toBe(true);
    expect(previewService.glowKept).toBe(true);
    expect(composer).toHaveBeenCalledTimes(40);
    expect(localStorage.getItem('previewGlow')).toBe('true');
  });

  it('keeps the glow where the preview is fast enough with it, measured again after a pause', () => {
    open();
    spyOn((component as any).glowComposer, 'render');
    spyOn((component as any).composer, 'render');
    const clock = { now: 0 };
    spyOn(performance, 'now').and.callFake(() => clock.now);

    // slow while the shaders are compiled, then a pause (a hidden tab), then 40 frames a second
    framesApart(15, 200, clock);
    clock.now += 5000;
    framesApart(31, 25, clock);

    expect(previewService.glowSuspended).toBe(false);
    expect((component as any).glowWatched).toBe(true);

    // measured once
    framesApart(30, 200, clock);
    expect(previewService.glowSuspended).toBe(false);
  });

  it('renders the stage without the glow where the browser can not let the lights glow', () => {
    spyOn<any>(PreviewComponent.prototype, 'glowTarget').and.throwError('no half floats');
    open();
    const render = spyOn(renderer(), 'render');

    frame(0);

    expect(console.warn).toHaveBeenCalledWith('The preview can not let the lights glow', jasmine.any(Error));
    expect((component as any).composer).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('renders the stage without the glow from the time it fails', () => {
    open();
    spyOn((component as any).glowComposer, 'render').and.throwError('no half floats');
    const render = spyOn(renderer(), 'render');

    frame(0);
    frame(16);

    expect(console.warn).toHaveBeenCalledWith('The preview can not let the lights glow', jasmine.any(Error));
    expect(render).toHaveBeenCalledTimes(2);
    expect((component as any).composer).toBeUndefined();
    // the stage keeps its materials
    expect(scene().children.some((child) => (child as THREE.Mesh).material === (component as any).glowDarkMaterial)).toBe(false);
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

    element('.preview-hide-button').click();
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

  it('names a scene of the AI looks it plays before the scene is added', () => {
    open();
    previewService.previewAiScene(new Scene({ uuid: 'ai', name: 'Chorus' }), [], 0);
    fixture.detectChanges();

    expect(element('.preview-target-type').textContent).toBe('designer.preview.ai');
    expect(element('.preview-target-name').textContent).toBe('Chorus');
    expect(element('.preview-ai-badge').textContent).toBe('designer.preview.ai-not-added');

    previewService.endAiPreview();
    fixture.detectChanges();
    expect(element('.preview-ai-badge')).toBeNull();
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
