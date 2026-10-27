/**
 * A lane on the timeline of a composition. The scenes on a track are played one after
 * the other: its clips (the scene playback regions carrying its uuid) never overlap.
 * Where the clips of different tracks overlap, the track higher up in the composition's
 * list is the one on top, the same way the first preset of a scene is.
 */
export class Track {
  uuid: string;
  name: string;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.uuid = data.uuid;
    this.name = data.name;
  }
}
