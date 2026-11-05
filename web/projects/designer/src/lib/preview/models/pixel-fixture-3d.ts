import * as THREE from 'three';
import { CachedFixture } from '../../models/cached-fixture';
import { CachedFixturePixel } from '../../models/cached-fixture-pixel';
import { FixtureChannelValue } from '../../models/fixture-channel-value';
import { FixtureService } from '../../services/fixture.service';
import { PREVIEW_GLOW_LAYER, PreviewService } from '../../services/preview.service';
import { isOnTheFloor, pixelHousingOffset, pixelHousingSize } from '../../models/pixel-stage';
import { Fixture3d } from './fixture-3d';

// the share of its space an LED takes, the rest is the housing between them
const LED_SIZE = 0.78;

// an LED which is off: dark grey glass, so the LEDs still show on the housing
const LED_OFF = new THREE.Color(0x1c1f25);

// how bright the light the fixture spills onto the stage around it is at full white, and how far it reaches (in cm)
const SPILL_INTENSITY = 25;
const SPILL_DISTANCE_CM = 900;

// The body of a fixture with pixels (a pixel bar or a matrix) in the 3d preview: a housing with an LED for each pixel
// of its matrix on the front, which its parts light (see PixelFixture3d), and the light it spills onto the stage. Its
// parts add their light to it while a frame is worked out, it shows the sum once all of them have.
export class PixelHousing3d {
  public readonly object = new THREE.Group();
  public readonly parts: PixelFixture3d[] = [];

  // the pixels of the matrix, an LED each in this order
  public readonly pixels: CachedFixturePixel[];

  public readonly width: number;
  public readonly height: number;
  public readonly depth: number;

  private body: THREE.Mesh;
  private leds: THREE.InstancedMesh;
  private ledMaterial: THREE.MeshBasicMaterial;
  private spill: THREE.PointLight;

  // the light the parts add to each LED in this frame (linear red, green and blue), and how far the general channels of
  // the fixture dim all of them
  private light: Float32Array;
  private master = 1;

  private selected: boolean;
  private color = new THREE.Color();

  constructor(
    private fixtureService: FixtureService,
    private previewService: PreviewService,
    public readonly fixture: CachedFixture,
    fixtureGroup: THREE.Group
  ) {
    this.pixels = fixtureService.getAllPixelKeys(fixture.profile);

    const columns = Math.max(1, ...this.pixels.map((pixel) => pixel.x));
    const rows = Math.max(1, ...this.pixels.map((pixel) => pixel.y));

    // where the pixel effects spread across the stage see the LEDs as well (see pixel-stage)
    [this.width, this.height, this.depth] = pixelHousingSize(fixture.profile, columns, rows);

    this.body = new THREE.Mesh(new THREE.BoxGeometry(this.width, this.height, this.depth), previewService.fixtureMaterial);
    this.object.add(this.body);

    // the LEDs on the front, square in the space of a pixel (a fixture without pixels lights across its front)
    const pitchX = this.width / columns;
    const pitchY = this.height / rows;
    const size = Math.min(pitchX, pitchY) * LED_SIZE;
    const count = Math.max(this.pixels.length, 1);
    const face = this.pixels.length > 0 ? roundedRect(size, size) : roundedRect(this.width - (1 - LED_SIZE) * size, this.height * LED_SIZE);

    this.ledMaterial = new THREE.MeshBasicMaterial();
    this.leds = new THREE.InstancedMesh(face, this.ledMaterial, count);

    const place = new THREE.Matrix4();

    for (let i = 0; i < count; i++) {
      const pixel = this.pixels[i];
      const x = pixel ? (pixel.x - 0.5) * pitchX - this.width / 2 : 0;
      const y = pixel ? this.height / 2 - (pixel.y - 0.5) * pitchY : 0;

      place.makeTranslation(x, y, this.depth / 2 + 0.05);
      this.leds.setMatrixAt(i, place);
      this.leds.setColorAt(i, LED_OFF);
    }

    this.leds.layers.enable(PREVIEW_GLOW_LAYER);
    this.object.add(this.leds);

    // in front of the LEDs, with the average of their light
    this.spill = new THREE.PointLight(0xffffff, 0, SPILL_DISTANCE_CM, 1);
    this.spill.position.set(0, 0, this.depth / 2 + 25);
    this.object.add(this.spill);

    this.light = new Float32Array(count * 3);
    fixtureGroup.add(this.object);
  }

  // the parts of the fixture: the general channels dim all LEDs, unless they are the only part of the fixture
  public get hasPixelParts(): boolean {
    return this.parts.some((part) => part.fixture.pixel);
  }

  // the number of LEDs on the front: one for each pixel, or a single one across the front of a fixture without
  public get ledCount(): number {
    return this.leds.count;
  }

  // adds light to the LEDs with the passed indices (linear red, green and blue)
  public addLight(indices: number[], light: THREE.Color) {
    for (const index of indices) {
      this.light[index * 3] += light.r;
      this.light[index * 3 + 1] += light.g;
      this.light[index * 3 + 2] += light.b;
    }
  }

  public dim(level: number) {
    this.master *= level;
  }

  // where the pixel with the passed key sits in the LEDs
  public indexOf(pixel: CachedFixturePixel): number {
    return this.pixels.findIndex((candidate) => candidate.key === pixel.key);
  }

  // Hangs the housing below the truss (and stands it on the floor) with its LEDs to the audience. A fixture the user
  // placed is centered on its place.
  public updatePosition() {
    const positioning = this.fixture.fixture.positioning;

    // the group of the fixture is turned upside down on the floor (see Fixture3d.updatePosition), the housing not
    this.object.rotation.x = isOnTheFloor(positioning) ? Math.PI : 0;
    this.object.position.set(0, pixelHousingOffset(positioning, this.height), 0);
  }

  // shows the light the parts added in this frame, and starts the next one dark
  public endFrame() {
    const count = this.leds.count;
    let red = 0;
    let green = 0;
    let blue = 0;

    for (let i = 0; i < count; i++) {
      const r = Math.min(this.light[i * 3], 1) * this.master;
      const g = Math.min(this.light[i * 3 + 1], 1) * this.master;
      const b = Math.min(this.light[i * 3 + 2], 1) * this.master;

      red += r;
      green += g;
      blue += b;

      this.color.setRGB(Math.max(r, LED_OFF.r), Math.max(g, LED_OFF.g), Math.max(b, LED_OFF.b));
      this.leds.setColorAt(i, this.color);
    }

    this.leds.instanceColor.needsUpdate = true;
    this.light.fill(0);
    this.master = 1;

    // the stage around takes the color of all of the LEDs together
    const brightest = Math.max(red, green, blue) / count;

    if (brightest > 0) {
      this.spill.color.setRGB(red / count / brightest, green / count / brightest, blue / count / brightest);
    }

    this.spill.intensity = SPILL_INTENSITY * brightest;

    // selected, once any of its parts is
    const selected = this.parts.some((part) => part.isSelected);

    if (selected !== this.selected) {
      this.body.material = selected ? this.previewService.fixtureSelectedMaterial : this.previewService.fixtureMaterial;
      this.selected = selected;
    }
  }

  public destroy() {
    this.object.parent?.remove(this.object);
    this.body.geometry.dispose();
    this.leds.geometry.dispose();
    this.leds.dispose();
    this.ledMaterial.dispose();
    this.spill.dispose();
  }
}

// A part of a fixture with pixels in the 3d preview: a pixel, a group of pixels or the general channels. It lights the
// LEDs of its pixels on the housing of the fixture, the general channels dim all of them (or light them, on a fixture
// they are the only part of).
export class PixelFixture3d extends Fixture3d {
  // the LEDs of the housing this part lights
  private indices: number[];

  constructor(
    public fixtureService: FixtureService,
    public previewService: PreviewService,
    fixture: CachedFixture,
    scene: any,
    fixtureGroup: THREE.Group,
    public readonly housing: PixelHousing3d
  ) {
    super(fixtureService, previewService, fixture, scene, fixtureGroup, false, false);

    housing.parts.push(this);
    this.indices = fixtureService
      .getPixelsOfPart(fixture, housing.pixels)
      .map((pixel) => housing.indexOf(pixel))
      .filter((index) => index >= 0);
    this.isLoaded = true;
  }

  override updatePosition() {
    super.updatePosition();
    this.housing.updatePosition();
  }

  override updatePreview(channelValues: FixtureChannelValue[], masterDimmerValue: number, timeMillis = 0): void {
    super.updatePreview(channelValues, masterDimmerValue, timeMillis);

    if (this.fixture.pixel) {
      this.housing.addLight(this.indices, this.litColor);
    } else if (!this.housing.hasPixelParts || this.hasColor) {
      // a fixture in a mode without pixels lights all of them alike, as do colors among the general channels
      this.housing.addLight(this.allIndices, this.litColor);
    } else {
      // a dimmer or a shutter among the general channels
      this.housing.dim(this.brightness);
    }
  }

  private get allIndices(): number[] {
    const indices: number[] = [];

    for (let i = 0; i < this.housing.ledCount; i++) {
      indices.push(i);
    }

    return indices;
  }
}

// the face of an LED: a rectangle with rounded corners, facing the front
function roundedRect(width: number, height: number): THREE.ShapeGeometry {
  const x = width / 2;
  const y = height / 2;
  const radius = Math.min(width, height) * 0.18;
  const shape = new THREE.Shape();

  shape.moveTo(-x + radius, -y);
  shape.lineTo(x - radius, -y);
  shape.quadraticCurveTo(x, -y, x, -y + radius);
  shape.lineTo(x, y - radius);
  shape.quadraticCurveTo(x, y, x - radius, y);
  shape.lineTo(-x + radius, y);
  shape.quadraticCurveTo(-x, y, -x, y - radius);
  shape.lineTo(-x, -y + radius);
  shape.quadraticCurveTo(-x, -y, -x + radius, -y);

  return new THREE.ShapeGeometry(shape, 3);
}
