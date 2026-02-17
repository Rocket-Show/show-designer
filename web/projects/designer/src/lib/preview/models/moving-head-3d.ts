import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import * as THREE from 'three';
import { CachedFixture } from '../../models/cached-fixture';
import { FixtureCapabilityType } from '../../models/fixture-capability';
import { FixtureChannelValue } from '../../models/fixture-channel-value';
import { FixtureService } from '../../services/fixture.service';
import { PreviewMeshService } from '../../services/preview-mesh.service';
import { Fixture3d } from './fixture-3d';
import { PreviewService } from '../../services/preview.service';

export class MovingHead3d extends Fixture3d {
  private pan: number;
  private tilt: number;

  private socket: THREE.Mesh;
  private arm: THREE.Mesh;
  private head: THREE.Mesh;

  private headGroup: THREE.Object3D = new THREE.Object3D();
  private armGroup: THREE.Object3D = new THREE.Object3D();
  private objectGroup: THREE.Object3D = new THREE.Object3D();

  private lastBeamAngleDegrees: number;

  constructor(
    public fixtureService: FixtureService,
    public previewService: PreviewService,
    previewMeshService: PreviewMeshService,
    fixture: CachedFixture,
    scene: any,
    fixtureGroup: THREE.Group
  ) {
    super(fixtureService, previewService, fixture, scene, fixtureGroup, true, true);

    forkJoin([
      previewMeshService.getMesh('moving_head_socket'),
      previewMeshService.getMesh('moving_head_arm'),
      previewMeshService.getMesh('moving_head_head'),
    ])
      .pipe(
        map(([socket, arm, head]) => {
          this.socket = socket;
          this.arm = arm;
          this.head = head;

          this.createObjects();
        })
      )
      .subscribe();
  }

  protected createObjects() {
    super.createObjects();

    this.socket.material = this.previewService.fixtureMaterial;
    this.arm.material = this.previewService.fixtureMaterial;
    this.head.material = this.previewService.fixtureMaterial;

    // Add the head
    this.head.scale.multiplyScalar(0.9);
    this.head.position.set(-0.1, 0, 0);
    const headPivotGroup = new THREE.Object3D();
    headPivotGroup.add(this.head);
    this.headGroup.add(headPivotGroup);

    this.headGroup.add(this.spotlightGroup);

    // Add the arm
    this.armGroup.add(this.headGroup);
    this.headGroup.position.set(0, -0.6, 0);
    this.armGroup.add(this.arm);

    // Add the socket
    this.objectGroup.add(this.armGroup);
    this.objectGroup.add(this.socket);
    this.socket.position.set(0, 1.2, 0);

    // A moving head has about 32 cm in width
    this.objectGroup.scale.multiplyScalar(9);

    this.fixtureGroup.add(this.objectGroup);

    this.isLoaded = true;
    this.updatePosition();
  }

  override updatePosition() {
    if (!this.isLoaded) {
      return;
    }

    super.updatePosition(this.objectGroup);
  }

  override updatePreview(channelValues: FixtureChannelValue[], masterDimmerValue: number): void {
    if (!this.isLoaded) {
      return;
    }

    super.updatePreview(channelValues, masterDimmerValue);

    // Apply default settings
    let panStart = 0;
    let panEnd = 255;

    let tiltStart = 0;
    let tiltEnd = 255;

    this.pan = 0;
    this.tilt = 0;

    // Apply the known property values
    for (const channelValue of channelValues) {
      const channel = this.fixtureService.getChannelByName(this.fixture, channelValue.channelName);
      const capability = this.getCapabilityInValue(channel, channelValue.value);
      if (capability) {
        switch (capability.capability.type) {
          case FixtureCapabilityType.Pan: {
            panStart = this.fixtureService.getRotationAngleDeg(capability.capability.angleStart) || 0;
            panEnd = this.fixtureService.getRotationAngleDeg(capability.capability.angleEnd) || 540;
            this.pan = channelValue.value / channel.maxValue;
            break;
          }
          case FixtureCapabilityType.Tilt: {
            tiltStart = this.fixtureService.getRotationAngleDeg(capability.capability.angleStart) || 0;
            tiltEnd = this.fixtureService.getRotationAngleDeg(capability.capability.angleEnd) || 2700;
            this.tilt = channelValue.value / channel.maxValue;
            break;
          }
        }
      }
    }

    // calculate the y/x rotation in radiants based on pan/tilt (0-1) respecting the max pan/tilt
    this.armGroup.rotation.y = THREE.MathUtils.degToRad(panEnd * this.pan + panStart) - THREE.MathUtils.degToRad(panEnd / 2);
    this.headGroup.rotation.x = THREE.MathUtils.degToRad(tiltEnd * this.tilt + tiltStart) - THREE.MathUtils.degToRad(tiltEnd / 2);

    // Update the angle only on change, because it's expensive
    // TODO update the correct angle from the profile
    const beamAngleDregrees = 14;
    if (this.lastBeamAngleDegrees !== beamAngleDregrees) {
      this.spotLight.angle = THREE.MathUtils.degToRad(beamAngleDregrees);
      this.lastBeamAngleDegrees = beamAngleDregrees;
    }

    // Update the material
    if (this.lastSelected !== this.isSelected) {
      if (this.isSelected) {
        this.socket.material = this.previewService.fixtureSelectedMaterial;
        this.arm.material = this.previewService.fixtureSelectedMaterial;
        this.head.material = this.previewService.fixtureSelectedMaterial;
      } else {
        this.socket.material = this.previewService.fixtureMaterial;
        this.arm.material = this.previewService.fixtureMaterial;
        this.head.material = this.previewService.fixtureMaterial;
      }

      this.lastSelected = this.isSelected;
    }
  }

  destroy() {
    this.scene.remove(this.objectGroup);
  }
}
