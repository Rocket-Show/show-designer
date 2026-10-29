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
import { PreviewService } from '../../services/preview.service';
import { ProjectService } from '../../services/project.service';
import { ColorChanger3d } from './color-changer-3d';

// A color changer (e.g. a par) shows the light of its fixture as a beam.
describe('ColorChanger3d', () => {
  let fixtureService: FixtureService;
  let previewService: PreviewService;
  let fixtureGroup: THREE.Group;
  let model: THREE.Group;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixtureService = TestBed.inject(FixtureService);
    previewService = TestBed.inject(PreviewService);

    TestBed.inject(ProjectService).project = new Project({
      fixtureProfiles: [
        {
          uuid: 'test/par',
          name: 'Par',
          availableChannels: {
            Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
            Green: { capability: { type: 'ColorIntensity', color: 'Green' } },
            Blue: { capability: { type: 'ColorIntensity', color: 'Blue' } },
          },
          modes: [{ name: 'mode', shortName: 'mode', channels: ['Red', 'Green', 'Blue'] }],
        },
      ],
      fixtures: [{ uuid: 'par', profileUuid: 'test/par', modeShortName: 'mode', dmxFirstChannel: 0, positioning: 'bottomFront' }],
    });
    fixtureService.updateCachedFixtures();

    fixtureGroup = new THREE.Group();
    // the model of the library is a group of the parts of the par
    model = new THREE.Group();
    model.add(new THREE.Mesh(), new THREE.Mesh());
  });

  function colorChanger(meshes = of(model as any)): ColorChanger3d {
    const meshService: any = { getMesh: () => meshes };

    return new ColorChanger3d(
      fixtureService,
      previewService,
      meshService,
      fixtureService.cachedFixtures[0],
      new THREE.Scene(),
      fixtureGroup
    );
  }

  function red(): FixtureChannelValue {
    const value = new FixtureChannelValue();
    value.channelName = 'Red';
    value.value = 255;
    return value;
  }

  it('shows its model with a beam, standing on its position', () => {
    const par = colorChanger();

    expect(fixtureGroup.children.length).toBe(1);
    expect(fixtureGroup.rotation.x).toBeCloseTo(Math.PI, 10);

    par.updatePreview([red()], 1);
    expect((par as any).spotLight.color.getHexString()).toBe('ff0000');
  });

  it('shows whether it is selected', () => {
    const par = colorChanger();
    const materials = () => model.children.map((part) => (part as THREE.Mesh).material);

    par.updatePreview([], 1);
    expect(materials()).toEqual([previewService.fixtureMaterial, previewService.fixtureMaterial]);

    par.isSelected = true;
    par.updatePreview([], 1);
    expect(materials()).toEqual([previewService.fixtureSelectedMaterial, previewService.fixtureSelectedMaterial]);
  });

  it('waits for its model, and stays away once it has been removed meanwhile', () => {
    const meshes = new Subject<any>();
    const par = colorChanger(meshes);

    par.updatePosition();
    par.updatePreview([red()], 1);
    par.destroy();
    meshes.next(model);
    meshes.complete();

    expect(fixtureGroup.children.length).toBe(0);
  });

  it('leaves the stage once it is removed', () => {
    const par = colorChanger();
    const material: THREE.Material = (par as any).spotlightMaterial;
    spyOn(material, 'dispose');

    par.destroy();

    expect(fixtureGroup.children.length).toBe(0);
    expect(material.dispose).toHaveBeenCalled();
  });
});
