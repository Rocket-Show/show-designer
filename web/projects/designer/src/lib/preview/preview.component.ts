import { AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FixtureCategory } from '../models/fixture-profile';
import { DmxService } from '../services/dmx.service';
import { FixtureService } from '../services/fixture.service';
import { PreviewMeshService } from '../services/preview-mesh.service';
import { HardwarePromoService } from '../services/hardware-promo.service';
import { LayoutService } from '../services/layout.service';
import { PresetService } from '../services/preset.service';
import { PREVIEW_BACKGROUND_COLOR, PREVIEW_GLOW_LAYER, PreviewService } from '../services/preview.service';
import { ProjectService } from '../services/project.service';
import { SceneService } from '../services/scene.service';
import { TimelineService } from '../services/timeline.service';
import { Positioning } from './../models/fixture';
import { AnimationService } from './../services/animation.service';
import { ColorChanger3d } from './models/color-changer-3d';
import { Fixture3d } from './models/fixture-3d';
import { MovingHead3d } from './models/moving-head-3d';
import { PixelFixture3d, PixelHousing3d } from './models/pixel-fixture-3d';

// remembers whether the render is turned off, across sessions
const PREVIEW_HIDDEN_STORAGE_KEY = 'previewHidden';

// how many fixtures at most throw real light on the stage (see PreviewComponent.assignLights)
export const PREVIEW_MAX_LIGHTS = 8;

// how slow a frame of the preview may be with the glow on average (20 frames a second), measured over a number of
// frames after the first ones, and how long a pause between two frames starts the measurement over (in ms)
const GLOW_SLOW_FRAME_MILLIS = 50;
const GLOW_SKIPPED_FRAMES = 10;
const GLOW_MEASURED_FRAMES = 20;
const GLOW_PAUSE_MILLIS = 1000;

// The glow around the lights: how strong it is, how far it spreads (0 to 1), and how much each of the blurs adds to it,
// from the narrowest to the widest. The wide ones add little, so the stage away from the lights stays dark.
const GLOW_STRENGTH = 1.1;
const GLOW_RADIUS = 0.1;
const GLOW_BLURS = [1.0, 0.7, 0.4, 0.18, 0.06];

// adds the glow of the lights to the stage
const GLOW_MIX_SHADER = {
  uniforms: { baseTexture: { value: null as THREE.Texture }, glowTexture: { value: null as THREE.Texture } },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D baseTexture;
    uniform sampler2D glowTexture;
    varying vec2 vUv;

    void main() {
      gl_FragColor = texture2D(baseTexture, vUv) + vec4(texture2D(glowTexture, vUv).rgb, 0.0);
    }`,
};

@Component({
  selector: 'lib-app-preview',
  templateUrl: './preview.component.html',
  styleUrls: ['./preview.component.css'],
  standalone: false,
})
export class PreviewComponent implements AfterViewInit, OnDestroy {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  public controls: OrbitControls;

  private fixtures3d: Fixture3d[] = [];

  // the bodies of the fixtures with pixels, which their parts light (see PixelFixture3d), by the UUID of the fixture
  private pixelHousings = new Map<string, PixelHousing3d>();

  // The glow around the lights: the lights alone in front of a black stage, blurred, and the stage with it added. None
  // where the browser can not (the stage is rendered without the glow then).
  private glowComposer: EffectComposer;
  private glowPass: UnrealBloomPass;
  private composer: EffectComposer;

  // what the stage is drawn with while only the lights are rendered for their glow
  private glowDarkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private glowDarkened: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];

  // how fast the preview is with the glow (see watchGlow)
  private glowWatched = false;
  private glowFrames = 0;
  private glowMeasuredFrom: number;
  private lastGlowFrameAt: number;

  // grouping fixture (pixels) into the same fixture to being able to properly rotate around the center
  private fixtureGroups = new Map<string, THREE.Group>();

  @ViewChild('canvas')
  private canvasRef: ElementRef;

  // Rendering the stage is the most expensive thing on the screen, so it can be
  // turned off while nobody is looking at it. Remembered across sessions.
  public previewHidden = localStorage.getItem(PREVIEW_HIDDEN_STORAGE_KEY) === 'true';

  public promoLink: string;

  // the frame rendered next, and the rebuilding of the fixtures: both stop with the preview
  private animationFrame: number;
  private fixtureSetupSubscription: Subscription;

  constructor(
    private fixtureService: FixtureService,
    private previewMeshService: PreviewMeshService,
    private animationService: AnimationService,
    public previewService: PreviewService,
    private timelineService: TimelineService,
    public projectService: ProjectService,
    private presetService: PresetService,
    private sceneService: SceneService,
    private ngZone: NgZone,
    public hardwarePromoService: HardwarePromoService,
    private layoutService: LayoutService,
    private dmxService: DmxService
  ) {
    this.promoLink = this.hardwarePromoService.link('preview-badge');

    this.fixtureSetupSubscription = this.previewService.doUpdateFixtureSetup.subscribe(() => {
      this.syncFixtures();
    });
    this.syncFixtures();
  }

  // synchronize the 3d-fixtures to the project fixtures
  private syncFixtures() {
    if (!this.previewService.scene) {
      return;
    }

    // remove all fixtures
    for (const fixture3d of this.fixtures3d) {
      fixture3d.destroy();
    }
    this.fixtures3d = [];

    for (const housing of this.pixelHousings.values()) {
      housing.destroy();
    }
    this.pixelHousings.clear();

    // destroy all groups
    for (const fixtureGroup of this.fixtureGroups.values()) {
      this.scene.remove(fixtureGroup);
    }
    this.fixtureGroups.clear();

    // add all fixtures from the project
    const fixture3dMap = {
      [FixtureCategory['Moving Head']]: MovingHead3d,
      [FixtureCategory['Color Changer']]: ColorChanger3d,
      [FixtureCategory['Blinder']]: ColorChanger3d,
      // a bar or a matrix of pixels, which says nothing else about itself
      [FixtureCategory['Pixel Bar']]: ColorChanger3d,
      [FixtureCategory['Matrix']]: ColorChanger3d,
    };

    // TODO group fixtures of the same UUID but with differen pixels into the same fixture to ensure
    // rotation is aligned
    for (const fixture of this.fixtureService.cachedFixtures) {
      const category = fixture.profile.categories.find((c) => fixture3dMap[c]);
      const uuid = fixture.fixture.uuid;

      let fixtureGroup = this.fixtureGroups.get(uuid);

      if (!fixtureGroup) {
        fixtureGroup = new THREE.Group();
        fixtureGroup.name = `fixture-${uuid}`;

        this.scene.add(fixtureGroup);
        this.fixtureGroups.set(uuid, fixtureGroup);
      }

      if (category) {
        const Fixture3dClass = fixture3dMap[category];

        // a bar or a matrix: a housing with an LED for each pixel, without a beam each (a matrix can bring hundreds
        // of them), which all parts of the fixture light
        const isPixelBar = [FixtureCategory['Pixel Bar'], FixtureCategory['Matrix']].indexOf(fixture.profile.categories?.[0]) >= 0;

        if (isPixelBar) {
          let housing = this.pixelHousings.get(uuid);

          if (!housing) {
            housing = new PixelHousing3d(this.fixtureService, this.previewService, fixture, fixtureGroup);
            this.pixelHousings.set(uuid, housing);
          }

          this.fixtures3d.push(new PixelFixture3d(this.fixtureService, this.previewService, fixture, this.scene, fixtureGroup, housing));
        } else {
          const fixture3d = new Fixture3dClass(
            this.fixtureService,
            this.previewService,
            this.previewMeshService,
            fixture,
            this.scene,
            fixtureGroup
          );

          this.fixtures3d.push(fixture3d);
        }
      } else {
        console.warn(`No supported category found for fixture`);
      }
    }
  }

  private get canvas(): HTMLCanvasElement {
    return this.canvasRef.nativeElement;
  }

  private render() {
    if (this.composer && this.previewService.glowing) {
      try {
        this.renderGlow();
        this.composer.render();
        this.watchGlow(performance.now());
        return;
      } catch (error) {
        // the stage is still rendered, without the glow from now on
        console.warn('The preview can not let the lights glow', error);
        this.composer = undefined;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  // The real lights on the stage: only the brightest fixtures light it, the beams and the lenses of all of them show.
  // Each light costs for every pixel of the stage, and the shaders of a graphics card hold only a few dozens of them
  // (beyond, they fail to compile and the stage stays black). Always as many lights are on (as far as there are
  // fixtures with one), so the shaders never have to be compiled again, and a fixture keeps its light against one as
  // bright, so they don't take turns.
  private assignLights() {
    const fixtures = this.fixtures3d.filter((fixture3d) => fixture3d.hasLight);
    const ranked = fixtures
      .map((fixture3d, index) => ({ fixture3d, index, shown: fixture3d.lightShown }))
      .sort(
        (fixture1, fixture2) =>
          fixture2.fixture3d.lightLevel - fixture1.fixture3d.lightLevel ||
          Number(fixture2.shown) - Number(fixture1.shown) ||
          fixture1.index - fixture2.index
      );
    const lit = new Set(ranked.slice(0, PREVIEW_MAX_LIGHTS).map((entry) => entry.fixture3d));

    for (const fixture3d of fixtures) {
      fixture3d.showLight(lit.has(fixture3d));
    }
  }

  // The glow renders the stage twice: a computer without a graphics card of its own can't keep up with it. Once it
  // has rendered a few frames (the first ones compile the shaders), the time a frame takes on average is measured, and
  // the glow left out while the designer is open, where the preview gets slower than 20 frames a second with it. A
  // pause in between (a hidden tab, the preview folded away) starts the measurement over.
  private watchGlow(now: number) {
    if (this.glowWatched || this.previewService.glowKept) {
      return;
    }

    if (this.lastGlowFrameAt !== undefined && now - this.lastGlowFrameAt > GLOW_PAUSE_MILLIS) {
      this.glowFrames = GLOW_SKIPPED_FRAMES;
    }

    this.lastGlowFrameAt = now;
    this.glowFrames++;

    if (this.glowFrames === GLOW_SKIPPED_FRAMES + 1) {
      this.glowMeasuredFrom = now;
    } else if (this.glowFrames === GLOW_SKIPPED_FRAMES + 1 + GLOW_MEASURED_FRAMES) {
      this.glowWatched = true;

      if ((now - this.glowMeasuredFrom) / GLOW_MEASURED_FRAMES > GLOW_SLOW_FRAME_MILLIS) {
        console.info('The lights of the preview glow no more: the preview got too slow with it');
        this.previewService.glowSuspended = true;
      }
    }
  }

  // The lights which glow (on the glow layer) alone, blurred: the rest of the stage black in front of them, so it
  // still hides them where it is in front, what is see-through (the beams) left out.
  private renderGlow() {
    const background = this.scene.background;
    this.scene.background = null;

    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;

      if (!mesh.isMesh || !mesh.visible || mesh.layers.isEnabled(PREVIEW_GLOW_LAYER)) {
        return;
      }

      this.glowDarkened.push([mesh, mesh.material]);

      if (Array.isArray(mesh.material) ? mesh.material.some((material) => material.transparent) : mesh.material.transparent) {
        mesh.visible = false;
      } else {
        mesh.material = this.glowDarkMaterial;
      }
    });

    try {
      this.glowComposer.render();
    } finally {
      for (const [mesh, material] of this.glowDarkened) {
        mesh.material = material;
        mesh.visible = true;
      }

      this.glowDarkened = [];
      this.scene.background = background;
    }
  }

  private updateStagePosition(
    positioning: Positioning,
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    zMin: number,
    zMax: number
  ) {
    let positionCount = 0; // number of fixtures in the same position (only counting one pixel)
    let positionIndex = 0;
    let lastFixtureUuid = undefined; // skip new positioning if it's just a new pixel inside the same fixture

    this.projectService.project.presetFixtures.forEach((element, index) => {
      const fixture = this.fixtureService.getFixtureByUuid(element.fixtureUuid);
      if (fixture.positioning === positioning && element.fixtureUuid != lastFixtureUuid) {
        positionCount++;
      }
      lastFixtureUuid = element.fixtureUuid;
    });

    lastFixtureUuid = undefined;
    this.projectService.project.presetFixtures.forEach((element, index) => {
      const fixture = this.fixtureService.getFixtureByUuid(element.fixtureUuid);

      if (fixture.positioning === positioning) {
        if (element.fixtureUuid != lastFixtureUuid) {
          positionIndex++;
        }

        fixture.positionX = xMin + ((xMax - xMin) / (positionCount + 1)) * positionIndex;
        fixture.positionY = yMin + ((yMax - yMin) / (positionCount + 1)) * positionIndex;
        fixture.positionZ = zMin + ((zMax - zMin) / (positionCount + 1)) * positionIndex;
      }
      lastFixtureUuid = element.fixtureUuid;
    });
  }

  // Everything a rendered frame needs, and where nearly all of its cost sits
  private updateFixtures(timeMillis: number) {
    // Update the positions
    this.updateStagePosition(
      Positioning.topFront,
      -this.projectService.project.stageWidthCm / 2,
      this.projectService.project.stageWidthCm / 2,
      this.projectService.project.stageHeightCm + this.projectService.project.stageFloorHeightCm,
      this.projectService.project.stageHeightCm + this.projectService.project.stageFloorHeightCm,
      this.projectService.project.stageDepthCm / 2 - 70,
      this.projectService.project.stageDepthCm / 2 - 70
    );
    this.updateStagePosition(
      Positioning.bottomFront,
      -this.projectService.project.stageWidthCm / 2,
      this.projectService.project.stageWidthCm / 2,
      this.projectService.project.stageFloorHeightCm,
      this.projectService.project.stageFloorHeightCm,
      this.projectService.project.stageDepthCm / 2 - 70,
      this.projectService.project.stageDepthCm / 2 - 70
    );
    this.updateStagePosition(
      Positioning.topBack,
      -this.projectService.project.stageWidthCm / 2,
      this.projectService.project.stageWidthCm / 2,
      this.projectService.project.stageHeightCm + this.projectService.project.stageFloorHeightCm,
      this.projectService.project.stageHeightCm + this.projectService.project.stageFloorHeightCm,
      -this.projectService.project.stageDepthCm / 2 + 70,
      -this.projectService.project.stageDepthCm / 2 + 70
    );
    this.updateStagePosition(
      Positioning.bottomBack,
      -this.projectService.project.stageWidthCm / 2,
      this.projectService.project.stageWidthCm / 2,
      this.projectService.project.stageFloorHeightCm,
      this.projectService.project.stageFloorHeightCm,
      -this.projectService.project.stageDepthCm / 2 + 70,
      -this.projectService.project.stageDepthCm / 2 + 70
    );

    // Update all fixtures and apply the preview properties, if available
    // TODO Update the fixtures only e.g. 40 times per second according to the "real" refresh rate of the DMX interface?
    const presets = this.previewService.getPresets(timeMillis);

    const calculatedFixtures = this.previewService.getChannelValues(timeMillis, presets);

    for (const fixture3d of this.fixtures3d) {
      // Update the fixture positions
      if (this.previewService.stageAndPositionsDirty) {
        fixture3d.updatePosition();
      }

      // Update the fixture properties
      // with the channels held by the faders of the DMX channels on top
      const values = this.dmxService.applyOverrides(fixture3d.fixture, calculatedFixtures.get(fixture3d.fixture) || []);
      fixture3d.updatePreview(values, this.projectService.project.masterDimmerValue, timeMillis);

      // Select the fixture, if required
      if (this.fixtureService.settingsSelection) {
        fixture3d.isSelected = this.fixtureService.settingsFixtureIsSelected(fixture3d.fixture.fixture);
      } else {
        fixture3d.isSelected = this.previewService.fixtureIsSelected(fixture3d.fixture.fixture.uuid, fixture3d.fixture.pixel?.key, presets);
      }
    }

    this.assignLights();

    // all parts of the fixtures with pixels have added their light
    for (const housing of this.pixelHousings.values()) {
      if (this.previewService.stageAndPositionsDirty) {
        housing.updatePosition();
      }

      housing.endFrame();
    }
  }

  private animate(timeMillis: number) {
    if (this.timelineService.playState === 'playing') {
      // Overwrite the current time with the playing time, if we're in playback mode
      timeMillis = this.timelineService.getCurrentMillis();
    }

    this.animationService.timeMillis = timeMillis;

    // While the preview is hidden, only the clock above keeps running: the effect
    // curves and the live preview still read it. The rest of the frame is what
    // hiding the preview is meant to save. Its panel folded away, or left out on a
    // phone, nobody sees it either.
    if (!this.previewHidden && !this.layoutService.compact && !this.layoutService.isFolded('preview')) {
      // Update the controls
      if (this.controls) {
        this.controls.update();
      }

      this.updateFixtures(timeMillis);

      // Render the scene
      this.render();

      this.previewService.stageAndPositionsDirty = false;
    }

    this.animationFrame = requestAnimationFrame(this.animate.bind(this));
  }

  private getAspectRatio(): number {
    const height = this.canvas.clientHeight;

    if (height === 0) {
      return 0;
    }

    return this.canvas.clientWidth / this.canvas.clientHeight;
  }

  // where a click into the preview started: turning the view around is no click picking a spot
  private pointerDownAt: { x: number; y: number };

  pointerDown(event: PointerEvent) {
    this.pointerDownAt = { x: event.clientX, y: event.clientY };
  }

  // a click into the preview while a spot is being picked picks the spot on the stage below the pointer
  pointerUp(event: PointerEvent) {
    const downAt = this.pointerDownAt;
    this.pointerDownAt = undefined;

    if (!this.previewService.pickingSpot || !downAt || !this.camera) {
      return;
    }

    if (Math.abs(event.clientX - downAt.x) > 4 || Math.abs(event.clientY - downAt.y) > 4) {
      return;
    }

    const bounds = this.canvas.getBoundingClientRect();

    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }

    const pointer = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.camera);

    const spot = this.previewService.getStageSpot(raycaster);

    if (spot) {
      this.previewService.pickSpot(false);
      this.previewService.spotPicked.next(spot);
    }
  }

  @HostListener('window:resize')
  public onResize() {
    if (this.previewHidden) {
      // the hidden canvas measures 0. It is measured again when it comes back.
      return;
    }

    this.camera.aspect = this.getAspectRatio();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.glowComposer?.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.composer?.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  private setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.canvas.appendChild(this.renderer.domElement);
    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    // this.renderer.shadowMap.enabled = true;
    // this.renderer.gammaInput = true;
    // this.renderer.gammaOutput = true;
  }

  // The glow is rendered at half the resolution, which its blur does not need more of. The stage is rendered into a
  // buffer which smooths the edges like the renderer does on its own, the glow added and the result shown in the
  // colors of the screen.
  private setupGlow() {
    try {
      const width = this.canvas.clientWidth;
      const height = this.canvas.clientHeight;
      const pixelRatio = this.renderer.getPixelRatio();

      this.glowComposer = new EffectComposer(this.renderer, this.glowTarget(width, height, pixelRatio / 2, 0));
      this.glowComposer.renderToScreen = false;
      this.glowComposer.setPixelRatio(pixelRatio / 2);
      this.glowComposer.setSize(width, height);
      this.glowComposer.addPass(new RenderPass(this.scene, this.camera));
      this.glowPass = new UnrealBloomPass(new THREE.Vector2(width, height), GLOW_STRENGTH, GLOW_RADIUS, 0);

      const blurs = this.glowPass.compositeMaterial?.uniforms?.['bloomFactors'];

      if (blurs) {
        blurs.value = GLOW_BLURS;
      }
      this.glowComposer.addPass(this.glowPass);

      const mix = new ShaderPass(GLOW_MIX_SHADER, 'baseTexture');
      // where the glow pass leaves its result
      mix.material.uniforms['glowTexture'].value = this.glowComposer.readBuffer.texture;

      this.composer = new EffectComposer(this.renderer, this.glowTarget(width, height, pixelRatio, 4));
      this.composer.setPixelRatio(pixelRatio);
      this.composer.setSize(width, height);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(mix);
      this.composer.addPass(new OutputPass());
    } catch (error) {
      console.warn('The preview can not let the lights glow', error);
      this.glowComposer = undefined;
      this.composer = undefined;
    }
  }

  // a buffer of a composer, which keeps what is brighter than white
  private glowTarget(width: number, height: number, pixelRatio: number, samples: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(Math.max(Math.round(width * pixelRatio), 1), Math.max(Math.round(height * pixelRatio), 1), {
      type: THREE.HalfFloatType,
      samples,
    });
  }

  // the lights glow, or not (to save performance)
  switchGlow() {
    this.previewService.setGlow(!this.previewService.glowing);
  }

  private setupCamera() {
    this.camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 1, 10000);
    this.camera.position.set(-600, 80, 700);
  }

  private setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableKeys = false;
    this.controls.rotateSpeed = 0.05;
    this.controls.zoomSpeed = 1.2;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.25;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 700;
    // this.controls.zoom = 1000;
    this.controls.maxDistance = 2000;
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.target = new THREE.Vector3(0, 200, 0);
    // this.controls.rotation = 100;
  }

  private setupScene() {
    // match the surrounding panels instead of the renderer's default black
    this.scene.background = new THREE.Color(PREVIEW_BACKGROUND_COLOR);
    // this.scene.fog	= new THREE.FogExp2( 0x000000, 0.1 );

    this.previewService.scene = this.scene;

    // Add a little bit of ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 1.8);
    this.scene.add(ambient);

    // Create the stage dimensions
    this.previewService.updateStage();

    const lights = [];
    lights[0] = new THREE.PointLight(0xffffff, 2, 0, 0.1);
    lights[1] = new THREE.PointLight(0xffffff, 2, 0, 0.1);
    lights[2] = new THREE.PointLight(0xffffff, 2, 0, 0.1);

    lights[0].position.set(0, 2000, 0);
    lights[1].position.set(1000, 2000, 1000);
    lights[2].position.set(-1000, -2000, -1000);

    lights[0].castShadow = true;
    lights[1].castShadow = true;
    lights[2].castShadow = true;

    this.scene.add(lights[0]);
    this.scene.add(lights[1]);
    this.scene.add(lights[2]);

    this.previewService.updateFixtureSetup();
  }

  // only the selected preset is played, not the scenes it is part of
  soloPreset(): boolean {
    return this.projectService.project.previewPreset || this.sceneService.selectedScenes.length === 0;
  }

  // turn the 3d render off (to save performance) and on again
  switchPreviewHidden() {
    this.previewHidden = !this.previewHidden;
    localStorage.setItem(PREVIEW_HIDDEN_STORAGE_KEY, this.previewHidden ? 'true' : 'false');

    if (!this.previewHidden) {
      // nothing followed the stage while the preview was hidden
      this.previewService.stageAndPositionsDirty = true;

      // the canvas only regains its size once the template has been updated, so
      // it can not be measured before the next turn
      setTimeout(() => {
        this.onResize();
      });
    }
  }

  // the name of what is currently being played
  previewName(): string {
    if (this.soloPreset()) {
      return this.presetService.selectedPreset ? this.presetService.selectedPreset.name : '';
    }

    return this.sceneService.selectedScenes.map((scene) => scene.name).join(', ');
  }

  ngAfterViewInit(): void {
    this.setupRenderer();
    this.setupCamera();
    this.setupGlow();
    this.setupControls();
    this.setupScene();

    this.onResize();

    // Avoid triggering change detection with each animation frame -> run outside zone
    this.ngZone.runOutsideAngular(() => {
      this.animate(null);
    });
  }

  // The designer has been left (e.g. for another page of Rocket Show): stop rendering, and
  // give back the WebGL context, of which a browser only hands out a few
  ngOnDestroy() {
    cancelAnimationFrame(this.animationFrame);
    this.fixtureSetupSubscription.unsubscribe();

    this.controls?.dispose();
    this.glowPass?.dispose();
    this.glowComposer?.dispose();
    this.composer?.dispose();
    this.glowDarkMaterial.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
  }
}
