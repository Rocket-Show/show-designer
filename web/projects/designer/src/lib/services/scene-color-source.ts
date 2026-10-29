import { InjectionToken } from '@angular/core';
import { Scene } from '../models/scene';

// What tells the color a scene is marked with: the ColorService (see DesignerModule). The
// ProjectService asks for it through this token, because the ColorService reads the colors
// through the presets, which need the ProjectService themselves.
export interface SceneColorSource {
  getSceneColor(scene: Scene): string;
}

export const SCENE_COLOR_SOURCE = new InjectionToken<SceneColorSource>('SceneColorSource');
