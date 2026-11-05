import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';
import { of, Subject } from 'rxjs';
import * as THREE from 'three';

import { FixtureChannelValue } from '../../models/fixture-channel-value';
import { Project } from '../../models/project';
import { FixtureService } from '../../services/fixture.service';
import { PreviewMeshService } from '../../services/preview-mesh.service';
import { PreviewService } from '../../services/preview.service';
import { ProjectService } from '../../services/project.service';
import { MovingHead3d } from './moving-head-3d';

// A moving head turns its arm (pan) and its head (tilt) within the range of the fixture.
describe('MovingHead3d', () => {
  let fixtureService: FixtureService;
  let previewService: PreviewService;
  let meshService: { getMesh: jasmine.Spy };
  let fixtureGroup: THREE.Group;

  function load(panTilt: any) {
    TestBed.inject(ProjectService).project = new Project({
      fixtureProfiles: [
        {
          uuid: 'test/head',
          name: 'Head',
          availableChannels: {
            Pan: { capability: { type: 'Pan', ...panTilt.pan } },
            Tilt: { capability: { type: 'Tilt', ...panTilt.tilt } },
            Dimmer: { capability: { type: 'Intensity' } },
          },
          modes: [{ name: 'mode', shortName: 'mode', channels: ['Pan', 'Tilt', 'Dimmer'] }],
        },
      ],
      fixtures: [{ uuid: 'head', profileUuid: 'test/head', modeShortName: 'mode', dmxFirstChannel: 0, positioning: 'topFront' }],
    });
    fixtureService.updateCachedFixtures();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixtureService = TestBed.inject(FixtureService);
    previewService = TestBed.inject(PreviewService);
    meshService = { getMesh: jasmine.createSpy('getMesh').and.callFake(() => of(new THREE.Mesh())) };
    fixtureGroup = new THREE.Group();
  });

  function movingHead(): MovingHead3d {
    return new MovingHead3d(
      fixtureService,
      previewService,
      meshService as any,
      fixtureService.cachedFixtures[0],
      new THREE.Scene(),
      fixtureGroup
    );
  }

  function value(channelName: string, channelValue: number): FixtureChannelValue {
    const result = new FixtureChannelValue();
    result.channelName = channelName;
    result.value = channelValue;
    return result;
  }

  // the pan and the tilt the moving head is turned to, in degrees
  function turned(head: MovingHead3d, pan: number, tilt: number): number[] {
    head.updatePreview([value('Pan', pan), value('Tilt', tilt), value('Dimmer', 255)], 1);

    return [(head as any).armGroup.rotation.y, (head as any).headGroup.rotation.x].map((angle) =>
      Math.round(THREE.MathUtils.radToDeg(angle))
    );
  }

  it('is built from the meshes of its socket, its arm and its head', () => {
    load({ pan: {}, tilt: {} });
    const head = movingHead();

    expect(meshService.getMesh.calls.allArgs()).toEqual([['moving_head_socket'], ['moving_head_arm'], ['moving_head_head']]);
    expect(fixtureGroup.children.length).toBe(1);
    // hanging below its position
    expect(fixtureGroup.position.y).toBe(-13);
    expect(head.fixture.fixture.uuid).toBe('head');
  });

  it('turns from the middle of its range', () => {
    load({ pan: { angleStart: '0deg', angleEnd: '540deg' }, tilt: { angleStart: '0deg', angleEnd: '270deg' } });
    const head = movingHead();

    expect(turned(head, 127.5, 127.5)).toEqual([0, 0]);
    expect(turned(head, 0, 0)).toEqual([-270, -135]);
    expect(turned(head, 255, 255)).toEqual([270, 135]);
  });

  it('turns within a range which does not start at 0', () => {
    load({ pan: { angleStart: '-270deg', angleEnd: '270deg' }, tilt: { angleStart: '-135deg', angleEnd: '135deg' } });
    const head = movingHead();

    expect(turned(head, 127.5, 127.5)).toEqual([0, 0]);
    expect(turned(head, 255, 0)).toEqual([270, -135]);
  });

  it('turns like a common moving head, where the profile names no range', () => {
    load({ pan: { angle: '0deg' }, tilt: {} });
    const head = movingHead();

    // 540 degrees of pan, 270 of tilt
    expect(turned(head, 255, 255)).toEqual([270, 135]);
  });

  it('shows the beam of the head', () => {
    load({ pan: {}, tilt: {} });
    const head = movingHead();

    head.updatePreview([value('Dimmer', 255)], 1);

    expect((head as any).spotLight.angle).toBeCloseTo(THREE.MathUtils.degToRad(14), 10);
    expect((head as any).spotLight.intensity).toBe(10);
  });

  it('shows whether it is selected', () => {
    load({ pan: {}, tilt: {} });
    const head = movingHead();
    const materials = () => ['socket', 'arm', 'head'].map((part) => (head as any)[part].material);

    head.updatePreview([], 1);
    expect(materials()).toEqual([previewService.fixtureMaterial, previewService.fixtureMaterial, previewService.fixtureMaterial]);

    head.isSelected = true;
    head.updatePreview([], 1);
    expect(materials()).toEqual([
      previewService.fixtureSelectedMaterial,
      previewService.fixtureSelectedMaterial,
      previewService.fixtureSelectedMaterial,
    ]);
  });

  it('waits for its meshes, and stays away once it has been removed meanwhile', () => {
    load({ pan: {}, tilt: {} });
    const meshes = new Subject<THREE.Mesh>();
    meshService.getMesh.and.callFake(() => meshes);
    const head = movingHead();

    head.updatePosition();
    head.updatePreview([value('Pan', 0)], 1);
    head.destroy();
    meshes.next(new THREE.Mesh());
    meshes.complete();

    expect(fixtureGroup.children.length).toBe(0);
  });

  it('leaves the stage once it is removed', () => {
    load({ pan: {}, tilt: {} });
    const head = movingHead();
    const material: THREE.Material = (head as any).spotlightMaterial;
    spyOn(material, 'dispose');

    head.destroy();

    expect(fixtureGroup.children.length).toBe(0);
    expect(material.dispose).toHaveBeenCalled();
  });
});
