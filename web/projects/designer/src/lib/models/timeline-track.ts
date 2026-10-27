import { Composition } from './composition';
import { Scene } from './scene';
import { ScenePlaybackRegion } from './scene-playback-region';
import { Track } from './track';

// the room between two clips of a track
export interface TrackGap {
  startMillis: number;

  // Infinity, if no clip follows
  endMillis: number;
}

// the clips of a track, in the order they are played
export function getTrackRegions(composition: Composition, trackUuid: string): ScenePlaybackRegion[] {
  return composition.scenePlaybackRegions.filter((region) => region.trackUuid === trackUuid).sort((a, b) => a.startMillis - b.startMillis);
}

// Is the time from start to end still free on the track? A clip ends where the next one
// may start. The passed clip (e.g. the one being moved) is not in its own way.
export function isFreeOnTrack(
  composition: Composition,
  trackUuid: string,
  startMillis: number,
  endMillis: number,
  except?: ScenePlaybackRegion
): boolean {
  return composition.scenePlaybackRegions.every(
    (region) => region === except || region.trackUuid !== trackUuid || region.endMillis <= startMillis || region.startMillis >= endMillis
  );
}

// The free room on the track around a point in time: from the end of the clip before it
// to the start of the one after it. undefined, if a clip plays at that time.
export function getFreeGap(composition: Composition, trackUuid: string, timeMillis: number, except?: ScenePlaybackRegion): TrackGap {
  const gap: TrackGap = { startMillis: 0, endMillis: Infinity };

  for (const region of composition.scenePlaybackRegions) {
    if (region === except || region.trackUuid !== trackUuid) {
      continue;
    }

    if (region.startMillis <= timeMillis && region.endMillis > timeMillis) {
      return undefined;
    }

    if (region.endMillis <= timeMillis) {
      gap.startMillis = Math.max(gap.startMillis, region.endMillis);
    } else {
      gap.endMillis = Math.min(gap.endMillis, region.startMillis);
    }
  }

  return gap;
}

// a name for another track, which no track of the composition carries yet
export function getNewTrackName(composition: Composition): string {
  let number = composition.tracks.length + 1;

  while (composition.tracks.some((track) => track.name === 'Track ' + number)) {
    number++;
  }

  return 'Track ' + number;
}

export function createTrack(composition: Composition, uuid: string, name?: string): Track {
  const track = new Track();
  track.uuid = uuid;
  track.name = name || getNewTrackName(composition);

  return track;
}

// Put the clips which are on none of the composition's tracks onto tracks of their own.
// Before there were tracks, all scenes played on one lane and the order of the scenes
// decided which one was on top where they overlapped: the first one topmost. One track
// per scene, in that order, plays such a show the same way. The clips of a scene which
// overlap each other get another track right below the first one of the scene.
export function assignTracks(composition: Composition, scenes: Scene[], newUuid: () => string) {
  const trackUuids = composition.tracks.map((track) => track.uuid);
  const unassigned = composition.scenePlaybackRegions.filter((region) => trackUuids.indexOf(region.trackUuid) < 0);

  for (const scene of scenes) {
    const regions = unassigned.filter((region) => region.sceneUuid === scene.uuid).sort((a, b) => a.startMillis - b.startMillis);
    const sceneTracks: Track[] = [];

    for (const region of regions) {
      let track = sceneTracks.find((candidate) => isFreeOnTrack(composition, candidate.uuid, region.startMillis, region.endMillis, region));

      if (!track) {
        track = createTrack(composition, newUuid(), sceneTracks.length === 0 ? scene.name : scene.name + ' ' + (sceneTracks.length + 1));
        sceneTracks.push(track);
        composition.tracks.push(track);
      }

      region.trackUuid = track.uuid;
    }
  }

  // a composition shows at least one track to put the first scene on
  if (composition.tracks.length === 0) {
    composition.tracks.push(createTrack(composition, newUuid()));
  }
}
