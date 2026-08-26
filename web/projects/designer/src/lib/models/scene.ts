import { ScenePlaybackRegion } from './scene-playback-region';

export class Scene {
  uuid: string;
  name: string;

  color = '#fff';

  // All contained presets, in the order they are layered in this scene: the first
  // one is the topmost layer, overwriting the values of the ones below it
  presetUuids: string[] = [];

  // Fading times
  fadeInMillis = 0;
  fadeOutMillis = 0;

  // fade in/out outside the start/end times?
  fadeInPre = false;
  fadeOutPost = false;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.uuid = data.uuid;
    this.name = data.name;
    this.color = data.color;
    if (data.presetUuids) {
      this.presetUuids = data.presetUuids;
    }
    this.fadeInMillis = data.fadeInMillis;
    this.fadeOutMillis = data.fadeOutMillis;
    this.fadeInPre = data.fadeInPre;
    this.fadeOutPost = data.fadeOutPost;
  }
}
