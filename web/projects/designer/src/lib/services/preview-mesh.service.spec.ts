import * as THREE from 'three';

import { PreviewMeshService } from './preview-mesh.service';

// The meshes of the 3D preview are loaded once each, and every fixture gets a copy of its own.
describe('PreviewMeshService', () => {
  let service: PreviewMeshService;
  let load: jasmine.Spy;
  let loads: { url: string; loaded: (gltf: any) => void; failed: (error: any) => void }[];

  beforeEach(() => {
    service = new PreviewMeshService();
    loads = [];
    load = spyOn((service as any).loader, 'load').and.callFake((url: string, loaded: any, progress: any, failed: any) => {
      loads.push({ url, loaded, failed });
    });
  });

  function gltf(): any {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh();
    mesh.name = 'head';
    mesh.position.set(1, 2, 3);
    scene.add(mesh);
    return { scene };
  }

  it('loads a mesh of the assets, placed at the origin', () => {
    let mesh: THREE.Mesh;

    service.getMesh('moving_head_head').subscribe((result) => (mesh = result));
    expect(loads.map((pending) => pending.url)).toEqual(['./assets/designer/models/moving_head_head.gltf']);

    loads[0].loaded(gltf());

    expect(mesh.name).toBe('head');
    expect(mesh.position.toArray()).toEqual([0, 0, 0]);
  });

  it('loads a mesh once, also for the fixtures asking while it loads', () => {
    const meshes: THREE.Mesh[] = [];

    service.getMesh('color-changer').subscribe((result) => meshes.push(result));
    service.getMesh('color-changer').subscribe((result) => meshes.push(result));
    expect(load).toHaveBeenCalledTimes(1);

    loads[0].loaded(gltf());
    service.getMesh('color-changer').subscribe((result) => meshes.push(result));

    expect(load).toHaveBeenCalledTimes(1);
    expect(meshes.length).toBe(3);
    // each fixture moves a mesh of its own
    expect(new Set(meshes).size).toBe(3);
    expect(meshes.map((mesh) => mesh.name)).toEqual(['head', 'head', 'head']);
  });

  it('tries again after a mesh failed to load', () => {
    const errors: any[] = [];
    let mesh: THREE.Mesh;

    service.getMesh('color-changer').subscribe({ error: (error) => errors.push(error) });
    loads[0].failed('offline');
    expect(errors).toEqual(['offline']);

    service.getMesh('color-changer').subscribe((result) => (mesh = result));
    expect(load).toHaveBeenCalledTimes(2);
    loads[1].loaded(gltf());

    expect(mesh.name).toBe('head');
  });
});
