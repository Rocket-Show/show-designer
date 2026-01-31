import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

@Injectable({
  providedIn: 'root',
})
export class PreviewMeshService {
  private loader = new GLTFLoader();
  private cachedMeshes = new Map<string, THREE.Mesh>();

  // the observable, if the requested mesh is already being loaded currently
  private cachedObservables = new Map<string, Observable<THREE.Mesh>>();

  constructor() {}

  private loadScene(name: string): Observable<THREE.Scene> {
    return new Observable((observer) => {
      this.loader.load(
        './assets/designer/models/' + name + '.gltf',

        // Called when the resource is loaded
        (gltf: any) => {
          const model = gltf.scene.children[0];

          model.position.set(0, 0, 0);

          observer.next(gltf.scene);
          observer.complete();
        },

        // Called while loading is progressing
        (xhr: any) => {},

        // Called when loading has errors
        (error: any) => {
          observer.error(error);
        }
      );
    });
  }

  private loadMesh(name: string): Observable<THREE.Mesh> {
    const observable = this.loadScene(name).pipe(
      map((scene: any) => {
        const model = scene.children[0];

        model.position.set(0, 0, 0);

        this.cachedMeshes.set(name, model);
        this.cachedObservables.delete(name);

        return model.clone();
      })
    );

    this.cachedObservables.set(name, observable);

    return observable;
  }

  getMesh(name: string): Observable<THREE.Mesh> {
    if (this.cachedMeshes.get(name)) {
      return of(this.cachedMeshes.get(name).clone());
    }

    return this.cachedObservables.get(name) || this.loadMesh(name);
  }
}
