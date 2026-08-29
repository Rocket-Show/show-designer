import { TransitionCurveType } from './transition-curve';

export class Scene {
  uuid: string;
  name: string;

  // the folder of the scene tree this scene is in (undefined = top level) and its
  // position among the folders and scenes of that folder
  folderUuid: string;
  sortIndex = 0;

  // how the scene is marked in the lists and on the timeline. While colorAuto is set,
  // the presets played in the scene decide the color and the picked one is only what
  // the scene falls back to while none of them sets a color.
  color: string;
  colorAuto = true;

  // font awesome class of the icon shown in the scene tree (undefined = the default one)
  icon: string;

  // is the scene shown with its presets in the scene tree?
  expanded = true;

  // All contained presets, in the order they are layered in this scene: the first
  // one is the topmost layer, overwriting the values of the ones below it
  presetUuids: string[] = [];

  // how much of the scene reaches the stage: 1 = all of it, 0 = nothing. It scales
  // everything the scene's presets put out, the way the master dimmer scales the whole
  // project, and the fades take away from what it leaves.
  dimmer = 1;

  // Fading times
  fadeInMillis = 0;
  fadeOutMillis = 0;

  // how the fades are shaped over their time (see transition-curve)
  fadeInCurve: TransitionCurveType = 'linear';
  fadeOutCurve: TransitionCurveType = 'linear';

  // fade in/out outside the start/end times?
  fadeInPre = false;
  fadeOutPost = false;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.uuid = data.uuid;
    this.name = data.name;
    this.folderUuid = data.folderUuid;
    this.sortIndex = data.sortIndex || 0;
    this.color = data.color;
    // the color of a scene used to be assigned automatically, there was no way to pick
    // one -> keep what such a project brings as the fallback, not as a picked color
    this.colorAuto = data.colorAuto !== false;
    this.icon = data.icon;
    this.expanded = data.expanded !== false;
    if (data.presetUuids) {
      this.presetUuids = data.presetUuids;
    }
    // a scene of a project written before the scenes had a dimmer plays at full
    this.dimmer = data.dimmer === undefined ? 1 : data.dimmer;

    this.fadeInMillis = data.fadeInMillis;
    this.fadeOutMillis = data.fadeOutMillis;

    // projects before version 7 only knew linear fades
    this.fadeInCurve = data.fadeInCurve || 'linear';
    this.fadeOutCurve = data.fadeOutCurve || 'linear';
    this.fadeInPre = data.fadeInPre;
    this.fadeOutPost = data.fadeOutPost;
  }
}
