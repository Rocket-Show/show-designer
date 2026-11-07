import * as THREE from 'three';
import { CachedFixture } from '../../models/cached-fixture';
import { CachedFixtureCapability } from '../../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../../models/cached-fixture-channel';
import { Color } from '../../models/color';
import { Positioning } from '../../models/fixture';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../../models/fixture-capability';
import { FixtureChannelValue } from '../../models/fixture-channel-value';
import { getShutterOpening, ShutterSettings } from '../../models/shutter';
import { FixtureService } from '../../services/fixture.service';
import { mixesSubtractively } from '../../models/subtractive-color';
import { FixtureWheelSlotType } from '../../models/fixture-wheel-slot';

// the light an emitter besides red, green and blue adds at full, in red, green and blue
const emitterLights: { [color: string]: number[] } = {
  White: [255, 255, 255],
  'Warm White': [255, 214, 170],
  'Cold White': [220, 235, 255],
  Amber: [255, 191, 0],
  UV: [100, 0, 255],
  Lime: [191, 255, 0],
  Indigo: [75, 0, 130],
};

// the part of the light (red, green or blue) a filter takes away
const filteredLights: { [color: string]: number } = {
  Cyan: 0,
  Magenta: 1,
  Yellow: 2,
};
import { PREVIEW_GLOW_LAYER, PreviewService } from '../../services/preview.service';
import { getBeamAngleDeg, getLensDegrees } from './beam-angle';
import { getGoboState, getGoboTexture } from './gobo';

// a lens which does not light: dark glass
const LENS_OFF = new THREE.Color(0x15171c);

// the cone of a beam as it is modelled (the fixture is scaled): as wide as the lens where it starts, opening by the tangent
// of half its angle, and how long it is. A fixture whose profile doesn't say how wide its beam is opens about 19 degrees
// (see beam-angle).
const BEAM_START_RADIUS = 0.1;
const BEAM_TAN_ANGLE = 0.1668;
const BEAM_LENGTH = 100;

// how many points along the view through a beam the gobo is looked up at: the light of a beam is the light of all of
// them, which draws the shafts of a gobo through the haze
const GOBO_SAMPLES = 6;

// how much of its light the spot light of a fixture showing a gobo still throws on the stage, which leaves the pattern
// of the gobo on the floor to the beam
const GOBO_SPOT_LIGHT_LEVEL = 0.35;

export abstract class Fixture3d {
  private readonly pointLightMaxIntensity: number = 2;
  private readonly spotLightLightMaxIntensity: number = 10;

  protected scene: any;

  // group pixels of the same fixture into one group to be able to rotate properly
  protected fixtureGroup: THREE.Group;

  public fixture: CachedFixture;
  protected fixtureHasDimmer = false;

  // how bright the dimmer lights while no value is set for it: as far as its default value lets
  // it (a virtual dimmer is at full, see FixtureService.addVirtualDimmers)
  private dimmerDefaultBrightness = 0;
  protected fixtureHasColorWheel = false;
  protected fixtureHasColor = false;

  // a fixture mixing its colors with filters (cyan, magenta and yellow) is white until they take colors away
  private fixtureMixesSubtractively = false;

  private colorRed: number;
  private colorGreen: number;
  private colorBlue: number;
  private dimmer: number = 0;

  // the light of the fixture in this frame: its color, as bright as its dimmer lets it (linear red, green and blue)
  protected litColor = new THREE.Color();

  protected lastSelected: boolean;
  public isSelected = false;
  protected isLoaded = false;

  // spotlight
  protected hasSpotLight: boolean = false;
  protected spotLight: THREE.SpotLight;

  // how much light it throws on the stage in this frame, between 0 and 1 (see PreviewComponent.assignLights)
  public lightLevel = 0;

  // the vertices at the far end of the beam, and how far along it they are (see cutBeam)
  private beamFarVertices: { index: number; x: number; y: number }[] = [];
  private beamCut = BEAM_LENGTH;

  // how wide the beam opens in this frame (the tangent of half its angle), and how wide its geometry was last drawn
  private beamTan = BEAM_TAN_ANGLE;
  private geometryTan = BEAM_TAN_ANGLE;

  // does the profile say how wide the beam opens (by its lens or a zoom)? Without, the beam opens as it always did.
  private beamFromProfile = false;

  // how far the spot light lighting the stage opens (from its axis to its edge) when the profile doesn't say, and the
  // angle it was given last (giving it one is expensive)
  protected defaultLightAngle = 2;
  private lastLightAngle: number;

  // does the fixture have a wheel with gobos, and is one of them in the beam in this frame?
  private fixtureHasGobo = false;
  private goboShown = false;
  protected spotLightBeam: THREE.Mesh;
  protected spotlightGroup: THREE.Object3D;
  protected spotlightMaterial: THREE.ShaderMaterial;

  // The lens the beam comes out of, which glows in its light: where it sits below the middle of the mesh, and how
  // large it is (in the units of the mesh, which is scaled to the size of the fixture)
  protected lensOffset = -1.66;
  protected lensRadius = 0.85;
  private lens: THREE.Mesh;
  private lensMaterial: THREE.MeshBasicMaterial;

  // glowing bulb
  private hasBulb: boolean = false;
  private bulbMaterial: THREE.MeshLambertMaterial;
  private bulbSphereRadius = 3;
  private bulbSphere: THREE.Mesh;

  constructor(
    public fixtureService: FixtureService,
    public previewService: PreviewService,
    fixture: CachedFixture,
    scene: any,
    fixtureGroup: THREE.Group,
    hasSpotLight: boolean = false,
    hasBulb: boolean = false
  ) {
    this.fixture = fixture;
    this.scene = scene;
    this.fixtureGroup = fixtureGroup;
    this.hasSpotLight = hasSpotLight;
    this.hasBulb = hasBulb;

    // evaluate, various capabilities of this fixture
    for (const cachedChannel of this.fixture.channels) {
      if (cachedChannel.channel) {
        for (const capability of cachedChannel.capabilities) {
          switch (capability.capability.type) {
            case FixtureCapabilityType.Intensity:
              this.fixtureHasDimmer = true;
              this.dimmerDefaultBrightness =
                cachedChannel.defaultValue === undefined
                  ? 0
                  : this.fixtureService.getDimmerBrightnessOfValue(cachedChannel, cachedChannel.defaultValue);
              break;
            case FixtureCapabilityType.ColorIntensity:
              this.fixtureHasColor = true;
              break;
          }
        }

        if (cachedChannel.colorWheel) {
          this.fixtureHasColorWheel = true;
        }

        for (const capability of cachedChannel.capabilities) {
          if (capability.capability.type === FixtureCapabilityType.Zoom || capability.capability.type === FixtureCapabilityType.BeamAngle) {
            this.beamFromProfile = true;
          }

          if ((capability.wheelSlots || []).some((slot) => slot && slot.type === FixtureWheelSlotType.Gobo)) {
            this.fixtureHasGobo = true;
          }
        }
      }
    }

    if (getLensDegrees(this.fixture)) {
      this.beamFromProfile = true;
    }

    this.fixtureMixesSubtractively = mixesSubtractively(this.fixture.channels);
  }

  // The light of a beam as it is scattered in the haze: for each pixel of the beam, where the view enters the cone of
  // light and where it leaves it (through its side, its far end or onto the stage floor), and the light it passes on
  // its way. The light is brightest on the axis and fades to its edge, fades along the beam, and is brighter looking
  // into it. A slowly drifting noise is the haze, a dither keeps the faint light from banding. Kept to a few steps for
  // each pixel: a computer without a graphics card of its own works them out one by one.
  private createSpotlightMaterial() {
    const vertexShader = `
    varying vec3 vWorldPosition;
    varying float vHaze;

    uniform float time;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    // the haze drifting through the beam, a slowly moving noise
    float noise(vec3 x) {
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);

      return mix(
        mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
        mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
        f.z
      );
    }

    void main(){
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vHaze = 0.65 + 0.7 * noise(worldPosition.xyz * 0.012 + vec3(time * 0.03, time * 0.05, 0.0));

      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
    const fragmentShader = `
    varying vec3 vWorldPosition;
    varying float vHaze;

    uniform vec3 lightColor;
    uniform float opacity;
    // the cone of light: its apex, its axis, how wide it opens, where the beam starts and how long it is along the axis
    uniform vec3 apex;
    uniform vec3 axis;
    uniform float tanAngle;
    uniform float cos2;
    uniform float beamStart;
    uniform float beamLength;
    // half the width and half the depth of the stage floor and how high it is
    uniform vec3 stageFloor;
    // the gobo in the beam, if any (goboOn), the directions across the beam it is put in along, and how far it is
    // turned (the cosine and the sine of its angle)
    uniform sampler2D goboMap;
    uniform float goboOn;
    uniform vec3 goboU;
    uniform vec3 goboV;
    uniform vec2 goboTurn;

    // how much light the gobo lets through at a point in the beam (from the apex of its cone)
    float goboAt(vec3 point) {
      float along = max(dot(point, axis), 1.0e-3);
      vec2 across = vec2(dot(point, goboU), dot(point, goboV)) / (along * tanAngle);
      across = vec2(goboTurn.x * across.x - goboTurn.y * across.y, goboTurn.y * across.x + goboTurn.x * across.y);
      return texture2D(goboMap, across * 0.5 + 0.5).r;
    }

    void main(){
      vec3 dir = normalize(vWorldPosition - cameraPosition);
      float tSurface = distance(vWorldPosition, cameraPosition);
      vec3 fromApex = cameraPosition - apex;
      float alongDir = dot(dir, axis);
      float alongFrom = dot(fromApex, axis);
      float a = alongDir * alongDir - cos2;
      float c = alongFrom * alongFrom - dot(fromApex, fromApex) * cos2;
      // the beam is seen from outside: it is entered where it is drawn
      float tIn = tSurface;
      float tOut = 1.0e9;

      if (abs(a) > 1.0e-6) {
        // where the view leaves the cone through its side: the two points it meets it at multiply to c / a
        float other = c / (a * tSurface);

        if (other > tIn && alongFrom + other * alongDir > 0.0) {
          tOut = other;
        }
      }

      // or through the far end of the beam, or the one at the fixture
      if (abs(alongDir) > 1.0e-6) {
        float tEnd = (beamStart + beamLength - alongFrom) / alongDir;
        float tStart = (beamStart - alongFrom) / alongDir;

        if (tEnd > tIn) {
          tOut = min(tOut, tEnd);
        }
        if (tStart > tIn) {
          tOut = min(tOut, tStart);
        }
      }

      // onto the stage floor, or the ground beside it
      bool onFloor = false;

      if (dir.y < 0.0) {
        float tFloor = (stageFloor.z - cameraPosition.y) / dir.y;
        vec3 hit = cameraPosition + dir * tFloor;

        if (abs(hit.x) > stageFloor.x || abs(hit.z) > stageFloor.y) {
          tFloor = -cameraPosition.y / dir.y;
        }
        if (tFloor > 0.0 && tFloor < tOut) {
          tOut = tFloor;
          onFloor = true;
        }
      }

      // nothing of the beam on the way (a pixel left out keeps the graphics card from leaving out the ones behind
      // the floor before they are shaded)
      if (tOut <= tIn || tOut > 1.0e8) {
        gl_FragColor = vec4(0.0);
        return;
      }

      // the light on the way through the beam, from how far it is from the axis and from the fixture in the middle of it
      float span = tOut - tIn;
      vec3 point = fromApex + dir * (tIn + span * 0.5);
      float along = dot(point, axis);
      float radius = max(along * tanAngle, 1.0);
      float edge = clamp(1.0 - (dot(point, point) - along * along) / (radius * radius), 0.0, 1.0);
      float fade = (along - beamStart) / beamLength;

      // the light a gobo lets through on the way, and the picture it throws on the floor
      float gobo = 1.0;
      float splash = 0.0;

      if (goboOn > 0.5) {
        gobo = 0.0;

        for (int i = 0; i < ${GOBO_SAMPLES}; i++) {
          gobo += goboAt(fromApex + dir * (tIn + span * (float(i) + 0.5) / ${GOBO_SAMPLES}.0));
        }

        gobo /= ${GOBO_SAMPLES}.0;

        if (onFloor) {
          vec3 hitPoint = fromApex + dir * tOut;
          float hitAlong = dot(hitPoint, axis);

          if (hitAlong > beamStart) {
            float fromAxis = sqrt(max(dot(hitPoint, hitPoint) - hitAlong * hitAlong, 0.0)) / (hitAlong * tanAngle);
            float hitFade = (hitAlong - beamStart) / beamLength;
            splash = goboAt(hitPoint) * smoothstep(1.0, 0.85, fromAxis) * 0.9 / (1.0 + hitFade * hitFade * 2.0);
          }
        }
      }

      float light = span * edge * edge / ((1.0 + fade * fade * 6.0) * radius) * vHaze * gobo;

      // brighter looking into the light
      float facing = max(-alongDir, 0.0);
      facing *= facing;
      facing *= facing;
      float intensity = ((1.0 - exp(-light * 1.3)) * (1.0 + 1.5 * facing * facing) + splash) * opacity;

      // a dither, so the faint light does not band
      float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;

      gl_FragColor = vec4(lightColor, clamp(intensity + dither / 255.0, 0.0, 1.0));
    }`;

    this.spotlightMaterial = new THREE.ShaderMaterial({
      uniforms: {
        lightColor: { value: new THREE.Color('white') },
        opacity: { value: 1.0 },
        apex: { value: new THREE.Vector3() },
        axis: { value: new THREE.Vector3(0, -1, 0) },
        tanAngle: { value: BEAM_TAN_ANGLE },
        cos2: { value: 1 / (1 + BEAM_TAN_ANGLE * BEAM_TAN_ANGLE) },
        beamStart: { value: 0 },
        beamLength: { value: BEAM_LENGTH },
        stageFloor: { value: new THREE.Vector3(300, 300, 0) },
        time: { value: 0 },
        goboMap: { value: null },
        goboOn: { value: 0 },
        goboU: { value: new THREE.Vector3(1, 0, 0) },
        goboV: { value: new THREE.Vector3(0, 1, 0) },
        goboTurn: { value: new THREE.Vector2(1, 0) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      // light adds up where beams cross, and over what is behind them
      blending: THREE.AdditiveBlending,
    });
  }

  // Where the cone of the beam is in the world, as the shader of the beam asks for it: worked out each time the beam is
  // rendered
  private updateBeamUniforms() {
    const uniforms = this.spotlightMaterial.uniforms;
    const start = new THREE.Vector3(0, 0, 0).applyMatrix4(this.spotLightBeam.matrixWorld);
    const end = new THREE.Vector3(0, 0, BEAM_LENGTH).applyMatrix4(this.spotLightBeam.matrixWorld);
    const length = start.distanceTo(end);
    const axis = end.clone().sub(start).normalize();
    // the cone starts as wide as the lens, its apex a little behind it
    const behind = (BEAM_START_RADIUS / this.beamTan) * (length / BEAM_LENGTH);
    const apex = start.clone().addScaledVector(axis, -behind);
    uniforms.apex.value.copy(apex);
    uniforms.axis.value.copy(axis);
    uniforms.beamStart.value = behind;
    uniforms.beamLength.value = length;
    uniforms.stageFloor.value.copy(this.previewService.stageFloor);
    uniforms.time.value = performance.now() / 1000;

    if (this.goboShown) {
      // the gobo is put in across the beam, turning with the head
      const goboU: THREE.Vector3 = uniforms.goboU.value;
      goboU.set(1, 0, 0).transformDirection(this.spotLightBeam.matrixWorld);
      goboU.addScaledVector(axis, -goboU.dot(axis)).normalize();
      uniforms.goboV.value.crossVectors(axis, goboU);
    }

    this.cutBeam(start, axis, length);
  }

  // The beam drawn only as far as a little beyond where it meets the floor (or the ground beside the stage): what is
  // behind it isn't seen, but would be drawn. The shader ends the light on the floor itself. For the next frame, the
  // geometry of this one has already been handed to the graphics card.
  private cutBeam(start: THREE.Vector3, axis: THREE.Vector3, length: number) {
    const floor = this.previewService.stageFloor;
    let reach = length;

    if (axis.y < -0.05) {
      const toFloor = (start.y - floor.z) / -axis.y;
      const onFloor = start.clone().addScaledVector(axis, toFloor);
      const height = Math.abs(onFloor.x) <= floor.x && Math.abs(onFloor.z) <= floor.y ? floor.z : 0;
      // the cone reaches the floor further away along its side than on its axis
      const toHit = (start.y - height) / -axis.y;

      reach = Math.min(length, Math.max(toHit, 0) * (1.2 + this.beamTan / -axis.y) + 10);
    }

    const cut = (reach / length) * BEAM_LENGTH;

    if (Math.abs(cut - this.beamCut) < BEAM_LENGTH * 0.01 && this.geometryTan === this.beamTan) {
      return;
    }

    const positions = this.spotLightBeam.geometry.getAttribute('position') as THREE.BufferAttribute;
    const radius = BEAM_START_RADIUS + this.beamTan * cut;

    for (const vertex of this.beamFarVertices) {
      positions.setXYZ(vertex.index, vertex.x * radius, vertex.y * radius, cut);
    }

    positions.needsUpdate = true;
    // a wider beam reaches further out than it did: it is not left out of a frame it is still in
    this.spotLightBeam.geometry.computeBoundingSphere();
    this.beamCut = cut;
    this.geometryTan = this.beamTan;
  }

  // How wide the beam opens in this frame: as wide as the lens and the zoom of the fixture open it, or as it always did
  // where the profile doesn't say. The spot light lighting the stage opens with it.
  private updateBeamAngle(channelValues: FixtureChannelValue[]) {
    const angle = this.beamFromProfile ? getBeamAngleDeg(this.fixture, channelValues) : undefined;
    const tan = angle === undefined ? BEAM_TAN_ANGLE : Math.tan(THREE.MathUtils.degToRad(angle / 2));

    if (tan !== this.beamTan) {
      const uniforms = this.spotlightMaterial.uniforms;
      this.beamTan = tan;
      uniforms.tanAngle.value = tan;
      uniforms.cos2.value = 1 / (1 + tan * tan);
    }

    // the light fades from its axis to its edge: it reaches as far out as the beam opens in all
    const lightAngle = angle === undefined ? this.defaultLightAngle : Math.min(THREE.MathUtils.degToRad(angle), Math.PI / 2 - 0.01);

    // Update the angle only on change, because it's expensive
    if (lightAngle !== this.lastLightAngle) {
      this.spotLight.angle = lightAngle;
      this.lastLightAngle = lightAngle;
    }
  }

  // the gobo in the beam in this frame, turned as far as the fixture has turned it by now
  private updateGobo(channelValues: FixtureChannelValue[], timeMillis: number) {
    const uniforms = this.spotlightMaterial.uniforms;
    const gobo = this.fixtureHasGobo
      ? getGoboState(
          this.fixture,
          channelValues,
          (channelName) => this.fixtureService.getChannelByName(this.fixture, channelName),
          (channel, value) => this.getCapabilityInValue(channel, value),
          timeMillis
        )
      : undefined;

    this.goboShown = !!gobo;

    if (!gobo) {
      uniforms.goboOn.value = 0;
      return;
    }

    const texture = getGoboTexture(gobo.pattern);

    if (uniforms.goboMap.value !== texture) {
      uniforms.goboMap.value = texture;
    }

    uniforms.goboOn.value = 1;
    uniforms.goboTurn.value.set(Math.cos(gobo.angle), Math.sin(gobo.angle));
  }

  // is a gobo in the beam in this frame?
  get showsGobo(): boolean {
    return this.goboShown;
  }

  protected createObjects() {
    if (this.hasSpotLight) {
      this.createSpotlightMaterial();

      this.spotLight = new THREE.SpotLight(0xffffff, 50000);
      this.spotLight.angle = 2;
      this.spotLight.penumbra = 1;
      this.spotLight.decay = 0.01;
      this.spotLight.distance = 0;
      this.spotLight.intensity = 1;

      const spotLightTarget = new THREE.Object3D();
      this.spotLight.target = spotLightTarget;

      this.spotlightGroup = new THREE.Object3D();
      this.spotlightGroup.add(this.spotLight);
      this.spotlightGroup.add(spotLightTarget);
      this.spotLight.position.set(0, -1.4, 0);
      spotLightTarget.position.set(0, -10, 0);
      this.createSpotLightBeam();
      this.createLens();
    }

    if (this.hasBulb) {
      const bulbGeo = new THREE.SphereGeometry(this.bulbSphereRadius * 1.12, 64, 64);
      this.bulbMaterial = new THREE.MeshLambertMaterial({
        color: 0xff00ff,
        emissive: 0xff00ff,
      });

      this.bulbSphere = new THREE.Mesh(bulbGeo, this.bulbMaterial);
      this.fixtureGroup.add(this.bulbSphere);
    }
  }

  protected getCapabilityInValue(channel: CachedFixtureChannel, value: number): CachedFixtureCapability {
    return this.fixtureService.getCapabilityInValue(channel, value);
  }

  updatePosition(object?: THREE.Object3D) {
    // the offset position (e.g. for single beams inside a fixture)
    if (object) {
      object.position.set(
        this.fixture.pixel ? this.fixture.pixel.positionX : 0,
        this.fixture.pixel ? this.fixture.pixel.positionY : 0,
        this.fixture.pixel ? this.fixture.pixel.positionZ : 0
      );
    }

    if (this.hasBulb) {
      this.bulbSphere.position.set(
        this.fixture.pixel ? this.fixture.pixel.positionX : 0,
        (this.fixture.pixel ? this.fixture.pixel.positionY : 0) - 15 + this.bulbSphereRadius / 2,
        this.fixture.pixel ? this.fixture.pixel.positionZ : 0
      );
    }

    switch (this.fixture.fixture.positioning) {
      case Positioning.topFront: {
        this.fixtureGroup.rotation.x = THREE.MathUtils.degToRad(0);
        this.fixtureGroup.position.set(this.fixture.fixture.positionX, this.fixture.fixture.positionY - 13, this.fixture.fixture.positionZ);
        break;
      }
      case Positioning.bottomFront: {
        this.fixtureGroup.rotation.x = THREE.MathUtils.degToRad(180);
        this.fixtureGroup.position.set(this.fixture.fixture.positionX, this.fixture.fixture.positionY + 13, this.fixture.fixture.positionZ);
        break;
      }
      case Positioning.topBack: {
        this.fixtureGroup.rotation.x = THREE.MathUtils.degToRad(0);
        this.fixtureGroup.position.set(this.fixture.fixture.positionX, this.fixture.fixture.positionY - 13, this.fixture.fixture.positionZ);
        break;
      }
      case Positioning.bottomBack: {
        this.fixtureGroup.rotation.x = THREE.MathUtils.degToRad(180);
        this.fixtureGroup.position.set(this.fixture.fixture.positionX, this.fixture.fixture.positionY + 13, this.fixture.fixture.positionZ);
        break;
      }
      case Positioning.manual: {
        this.fixtureGroup.position.set(this.fixture.fixture.positionX, this.fixture.fixture.positionY, this.fixture.fixture.positionZ);

        this.fixtureGroup.rotation.x = THREE.MathUtils.degToRad(this.fixture.fixture.rotationX);
        this.fixtureGroup.rotation.y = THREE.MathUtils.degToRad(this.fixture.fixture.rotationY);
        this.fixtureGroup.rotation.z = THREE.MathUtils.degToRad(this.fixture.fixture.rotationZ);
        break;
      }
    }
  }

  // Apply the properties of the base fixture to the preview
  // the time (of the preview) lets the shutter flash while it strobes
  updatePreview(channelValues: FixtureChannelValue[], masterDimmerValue: number, timeMillis = 0) {
    // Apply default settings
    if (this.fixtureHasDimmer) {
      this.dimmer = this.dimmerDefaultBrightness * masterDimmerValue;
    } else {
      this.dimmer = 1;
    }

    this.colorRed = 255;
    this.colorGreen = 255;
    this.colorBlue = 255;

    if (!this.fixtureHasColorWheel && this.fixtureHasColor && !this.fixtureMixesSubtractively) {
      this.colorRed = 0;
      this.colorGreen = 0;
      this.colorBlue = 0;
    }

    // the color of a selected color preset (e.g. a color macro). It takes over from the color
    // channels, whichever order they come in, the way a fixture disables them for its macros.
    let presetColor: Color;

    // the emitters besides red, green and blue and the filters, with how much they are in (0 to 1). They change the
    // color once the colors themselves are set, whichever order they come in.
    const emitters: [number[], number][] = [];
    const filters: [number, number][] = [];

    // the shutter, how fast it strobes and how long a flash takes (see shutter)
    const shutter: ShutterSettings = {};

    for (const channelValue of channelValues) {
      const channel = this.fixtureService.getChannelByName(this.fixture, channelValue.channelName);
      const capability = this.getCapabilityInValue(channel, channelValue.value);

      if (capability) {
        // another function sharing the channel of the dimmer (e.g. a strobe) lights the fixture, like on the stage
        if (
          capability.capability.type !== FixtureCapabilityType.Intensity &&
          channel.capabilities.some((channelCapability) => channelCapability.capability.type === FixtureCapabilityType.Intensity)
        ) {
          this.dimmer = this.fixtureService.getDimmerBrightnessOfValue(channel, channelValue.value) * masterDimmerValue;
        }

        switch (capability.capability.type) {
          case FixtureCapabilityType.Intensity: {
            // as bright as the capability lights at this value (also from bright to off)
            this.dimmer = this.fixtureService.getBrightnessOfValue(channel, capability, channelValue.value) * masterDimmerValue;
            break;
          }
          case FixtureCapabilityType.ColorIntensity: {
            const valuePercentage = (255 * channelValue.value) / channel.maxValue;
            switch (capability.capability.color) {
              case FixtureCapabilityColor.Red:
                // Round needed for threejs
                this.colorRed = Math.round(valuePercentage);
                break;
              case FixtureCapabilityColor.Green:
                // Round needed for threejs
                this.colorGreen = Math.round(valuePercentage);
                break;
              case FixtureCapabilityColor.Blue:
                // Round needed for threejs
                this.colorBlue = Math.round(valuePercentage);
                break;
              default:
                if (emitterLights[capability.capability.color]) {
                  emitters.push([emitterLights[capability.capability.color], valuePercentage / 255]);
                } else if (filteredLights[capability.capability.color] !== undefined) {
                  filters.push([filteredLights[capability.capability.color], valuePercentage / 255]);
                }
            }
            break;
          }
          case FixtureCapabilityType.WheelSlot: {
            const mixedColor = this.fixtureService.getMixedWheelSlotColor(capability.wheel, capability.capability.slotNumber);
            if (mixedColor) {
              this.colorRed = Math.round(mixedColor.red);
              this.colorGreen = Math.round(mixedColor.green);
              this.colorBlue = Math.round(mixedColor.blue);
            }
            break;
          }
          case FixtureCapabilityType.ColorPreset: {
            presetColor = this.fixtureService.getColorPresetColor(capability.capability) || presetColor;
            break;
          }
          case FixtureCapabilityType.ShutterStrobe:
            shutter.shutter = { channel, capability, value: channelValue.value };
            break;
          case FixtureCapabilityType.StrobeSpeed:
            shutter.speed = { channel, capability, value: channelValue.value };
            break;
          case FixtureCapabilityType.StrobeDuration:
            shutter.duration = { channel, capability, value: channelValue.value };
            break;
        }
      }
    }

    if (emitters.length > 0 || filters.length > 0) {
      const light = [this.colorRed, this.colorGreen, this.colorBlue];

      for (const [emitterLight, level] of emitters) {
        for (let i = 0; i < 3; i++) {
          light[i] = Math.min(255, light[i] + emitterLight[i] * level);
        }
      }

      for (const [filtered, level] of filters) {
        light[filtered] *= 1 - level;
      }

      // Round needed for threejs
      this.colorRed = Math.round(light[0]);
      this.colorGreen = Math.round(light[1]);
      this.colorBlue = Math.round(light[2]);
    }

    if (presetColor) {
      this.colorRed = Math.round(presetColor.red);
      this.colorGreen = Math.round(presetColor.green);
      this.colorBlue = Math.round(presetColor.blue);
    }

    // the shutter lets through all of the light, none of it, or flashes
    this.dimmer *= getShutterOpening(shutter, timeMillis);

    // Apply the colors and intensities
    // Apply the dimmer value
    const color = new THREE.Color('rgb(' + this.colorRed + ', ' + this.colorGreen + ', ' + this.colorBlue + ')');

    // how bright the color lights, e.g. less while a scene dimmer fades it
    const colorMax = Math.max(this.colorRed, this.colorGreen, this.colorBlue);

    if (this.hasSpotLight) {
      this.updateBeamAngle(channelValues);
      this.updateGobo(channelValues, timeMillis);

      this.spotLight.color = color;

      // the beam shows the color at full and lets the brightness of the light make it
      // fainter. A dark color drawn as it is covered the stage with a black beam.
      const beamColor =
        colorMax > 0
          ? new THREE.Color().setRGB(this.colorRed / colorMax, this.colorGreen / colorMax, this.colorBlue / colorMax, THREE.SRGBColorSpace)
          : color;
      this.spotLightBeam.material.uniforms.lightColor.value = beamColor;

      this.spotLightBeam.material.uniforms.opacity.value = (colorMax / 255) * this.dimmer;
      this.spotLight.intensity = this.spotLightLightMaxIntensity * this.dimmer * (this.goboShown ? GOBO_SPOT_LIGHT_LEVEL : 1);
      this.lightLevel = (colorMax / 255) * this.dimmer;
      // a dark beam is not drawn at all
      this.spotLightBeam.visible = this.lightLevel > 0;

      const lensLevel = (colorMax / 255) * this.dimmer;
      this.lensMaterial.color.setRGB(
        Math.max(beamColor.r * lensLevel, LENS_OFF.r),
        Math.max(beamColor.g * lensLevel, LENS_OFF.g),
        Math.max(beamColor.b * lensLevel, LENS_OFF.b)
      );
    }

    // the color carries the brightness of the pixel already, the dimmer (if the fixture has one) scales it. Taking
    // the brightness away again turned a fully lit pixel black.
    this.litColor.copy(color).multiplyScalar(this.dimmer);

    if (this.hasBulb) {
      this.bulbMaterial.color.copy(this.litColor);
      this.bulbMaterial.emissive.copy(this.litColor);
    }
  }

  // does it throw light on the stage? (the beam and the lens show anyway)
  get hasLight(): boolean {
    return this.hasSpotLight && !!this.spotLight;
  }

  get lightShown(): boolean {
    return this.hasLight && this.spotLight.visible;
  }

  // the light it throws on the stage, or none: only some of the fixtures light it (see PreviewComponent.assignLights)
  showLight(shown: boolean) {
    if (this.hasLight) {
      this.spotLight.visible = shown;
    }
  }

  // whether the fixture (or the part of it) has a color of its own, or only lights white
  protected get hasColor(): boolean {
    return this.fixtureHasColor || this.fixtureHasColorWheel;
  }

  // how bright the fixture lights in this frame, by its dimmer and its shutter, between 0 and 1
  protected get brightness(): number {
    return this.dimmer;
  }

  // a disc of light at the start of the beam, facing along it
  private createLens() {
    this.lensMaterial = new THREE.MeshBasicMaterial({ color: LENS_OFF.clone() });
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(this.lensRadius, 32), this.lensMaterial);
    this.lens.position.set(0, this.lensOffset, 0);
    this.lens.rotation.x = Math.PI / 2;
    this.lens.layers.enable(PREVIEW_GLOW_LAYER);
    this.spotlightGroup.add(this.lens);
  }

  protected createSpotLightBeam() {
    // the shader works out the light for each pixel from where it is: few faces do (32 around it, one along it), and
    // no disc closing it at its far end
    const geometry = new THREE.CylinderGeometry(
      BEAM_START_RADIUS,
      BEAM_START_RADIUS + BEAM_TAN_ANGLE * BEAM_LENGTH,
      BEAM_LENGTH,
      32,
      1,
      true
    );
    geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -geometry.parameters.height / 2, 0));
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));

    // the vertices at the far end, which are moved to where the beam meets the floor (see cutBeam)
    const positions = geometry.getAttribute('position');
    this.beamFarVertices = [];

    for (let i = 0; i < positions.count; i++) {
      if (positions.getZ(i) > BEAM_LENGTH / 2) {
        const radius = Math.hypot(positions.getX(i), positions.getY(i)) || 1;
        this.beamFarVertices.push({ index: i, x: positions.getX(i) / radius, y: positions.getY(i) / radius });
      }
    }

    this.spotLightBeam = new THREE.Mesh(geometry, this.spotlightMaterial);
    this.spotLightBeam.onBeforeRender = () => this.updateBeamUniforms();
    this.spotLightBeam.position.set(0, -0.02, 0);
    this.spotLightBeam.receiveShadow = false;
    this.spotLightBeam.castShadow = false;

    this.spotlightGroup.add(this.spotLightBeam);
    this.spotLightBeam.rotation.x = Math.PI / 2;
  }

  // the materials are only there once the objects have been created (a mesh may still be loading)
  destroy() {
    if (this.spotlightMaterial) {
      this.spotlightMaterial.dispose();
    }
    if (this.lens) {
      this.lens.geometry.dispose();
      this.lensMaterial.dispose();
    }
    if (this.bulbMaterial) {
      this.bulbMaterial.dispose();
    }
  }
}
