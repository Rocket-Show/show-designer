export class ScenePlaybackRegion {
  sceneUuid: string;
  startMillis: number;
  endMillis: number;

  // the track of the composition the scene is played on
  trackUuid: string;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.sceneUuid = data.sceneUuid;
    this.startMillis = data.startMillis;
    this.endMillis = data.endMillis;
    this.trackUuid = data.trackUuid;
  }
}
