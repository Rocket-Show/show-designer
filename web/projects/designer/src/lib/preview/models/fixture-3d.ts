import * as THREE from 'three';
import { CachedFixture } from '../../models/cached-fixture';
import { CachedFixtureCapability } from '../../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../../models/cached-fixture-channel';
import { Positioning } from '../../models/fixture';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../../models/fixture-capability';
import { FixtureChannelValue } from '../../models/fixture-channel-value';
import { FixtureService } from '../../services/fixture.service';
import { PreviewService } from '../../services/preview.service';

export abstract class Fixture3d {
  private readonly pointLightMaxIntensity: number = 2;
  private readonly spotLightLightMaxIntensity: number = 10;

  protected scene: any;

  // group pixels of the same fixture into one group to be able to rotate properly
  protected fixtureGroup: THREE.Group;

  public fixture: CachedFixture;
  private fixtureHasDimmer = false;
  private fixtureHasColorWheel = false;
  private fixtureHasColor = false;

  private colorRed: number;
  private colorGreen: number;
  private colorBlue: number;
  private dimmer: number = 0;

  protected lastSelected: boolean;
  public isSelected = false;
  protected isLoaded = false;

  // spotlight
  protected hasSpotLight: boolean = false;
  protected spotLight: THREE.SpotLight;
  protected spotLightBeam: THREE.Mesh;
  protected spotlightGroup: THREE.Object3D;
  protected spotlightMaterial: THREE.ShaderMaterial;

  // glowing bulb
  private hasBulb: boolean = false;
  private bulbMaterial: THREE.MeshLambertMaterial;
  private bulbSphereRadius = 3;
  private bulbSphere: THREE.Mesh;
  private blackColor = new THREE.Color(0x000000);

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
              break;
            case FixtureCapabilityType.ColorIntensity:
              this.fixtureHasColor = true;
              break;
          }
        }

        if (cachedChannel.colorWheel) {
          this.fixtureHasColorWheel = true;
        }
      }
    }
  }

  private createSpotlightMaterial() {
    const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    void main(){
      vNormal = normalize(normalMatrix * normal);

      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;

      gl_Position	= projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
    const fragmentShader = `
    varying vec3 vNormal;
    varying vec3 vWorldPosition;

    uniform vec3 lightColor;
    uniform float	opacity;
    uniform vec3 spotPosition;
    uniform float attenuation;
    uniform float	anglePower;

    void main(){
      float intensity;

      intensity	= distance(vWorldPosition, spotPosition) / attenuation;
      intensity	= 1.0 - clamp(intensity, 0.0, 1.0);

      vec3 normal	= vec3(vNormal.x, vNormal.y, abs(vNormal.z));
      float angleIntensity	= pow(dot(normal, vec3(0.0, 0.0, 1.0)), anglePower);
      intensity	= intensity * angleIntensity * opacity;

      gl_FragColor	= vec4(lightColor, intensity);
    }`;

    this.spotlightMaterial = new THREE.ShaderMaterial({
      uniforms: {
        attenuation: {
          type: 'f',
          value: 800.0,
        },
        anglePower: {
          type: 'f',
          value: 2,
        },
        spotPosition: {
          type: 'v3',
          value: new THREE.Vector3(0, 0, 0),
        },
        lightColor: {
          type: 'c',
          value: new THREE.Color('white'),
        },
        opacity: {
          type: 'f',
          value: 1.0,
        },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    });
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
    for (const capability of channel.capabilities) {
      if (
        capability.capability.dmxRange.length === 0 ||
        (value >= capability.capability.dmxRange[0] && value <= capability.capability.dmxRange[1])
      ) {
        return capability;
      }
    }

    return undefined;
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
  updatePreview(channelValues: FixtureChannelValue[], masterDimmerValue: number) {
    // Apply default settings
    if (this.fixtureHasDimmer) {
      this.dimmer = 0;
    } else {
      this.dimmer = 1;
    }

    this.colorRed = 255;
    this.colorGreen = 255;
    this.colorBlue = 255;

    if (!this.fixtureHasColorWheel && this.fixtureHasColor) {
      this.colorRed = 0;
      this.colorGreen = 0;
      this.colorBlue = 0;
    }

    for (const channelValue of channelValues) {
      const channel = this.fixtureService.getChannelByName(this.fixture, channelValue.channelName);
      const capability = this.getCapabilityInValue(channel, channelValue.value);

      if (capability) {
        switch (capability.capability.type) {
          case FixtureCapabilityType.Intensity: {
            let valuePercentage: number;
            if (capability.capability.dmxRange.length > 0) {
              valuePercentage =
                (channelValue.value - capability.capability.dmxRange[0]) /
                (capability.capability.dmxRange[1] - capability.capability.dmxRange[0]);
            } else {
              valuePercentage = channelValue.value / channel.maxValue;
            }
            this.dimmer = valuePercentage * masterDimmerValue;
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
        }
      }
    }

    // Apply the colors and intensities
    // Apply the dimmer value
    // Take the color into account for the beam (don't show a black beam)
    const color = new THREE.Color('rgb(' + this.colorRed + ', ' + this.colorGreen + ', ' + this.colorBlue + ')');
    const intensityColor = Math.max(this.colorRed, this.colorGreen, this.colorBlue);

    if (this.hasSpotLight) {
      this.spotLight.color = color;
      this.spotLightBeam.material.uniforms.lightColor.value = color;

      this.spotLightBeam.material.uniforms.opacity.value = Math.min(intensityColor, this.dimmer);
      this.spotLight.intensity = this.spotLightLightMaxIntensity * this.dimmer;
      this.spotLightBeam.material.uniforms.spotPosition.value = this.spotlightGroup.position;
    }

    if (this.hasBulb) {
      // Normalize 0–255 → 0–1
      const intensity = Math.max(this.colorRed, this.colorGreen, this.colorBlue) / 255;

      this.bulbMaterial.color.copy(color.clone().lerp(this.blackColor, intensity));
      this.bulbMaterial.emissive.copy(color.clone().lerp(this.blackColor, intensity));
    }
  }

  protected createSpotLightBeam() {
    // TODO set the correct angle from the profile
    const beamAngleDegrees = 14;
    const geometry = new THREE.CylinderGeometry(0.1, beamAngleDegrees * 1.2, 100, 64, 20, false);
    geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -geometry.parameters.height / 2, 0));
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));

    this.spotLightBeam = new THREE.Mesh(geometry, this.spotlightMaterial);
    this.spotLightBeam.position.set(0, -0.02, 0);
    this.spotLightBeam.receiveShadow = false;
    this.spotLightBeam.castShadow = false;

    this.spotlightGroup.add(this.spotLightBeam);
    this.spotLightBeam.rotation.x = Math.PI / 2;
  }

  destroy() {
    if (this.hasSpotLight) {
      this.spotlightMaterial.dispose();
    }
    if (this.hasBulb) {
      this.bulbMaterial.dispose();
    }
  }
}
