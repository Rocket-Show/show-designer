import { Composition } from './composition';
import { Scene } from './scene';
import { ScenePlaybackRegion } from './scene-playback-region';
import { assignTracks, getFreeGap, getNewTrackName, getPreviewTracks, getTrackRegions, isFreeOnTrack } from './timeline-track';
import { Track } from './track';

describe('timeline tracks', () => {
  let uuidCounter: number;
  const newUuid = () => 'uuid-' + uuidCounter++;

  beforeEach(() => {
    uuidCounter = 1;
  });

  function scene(uuid: string): Scene {
    const namedScene = new Scene();
    namedScene.uuid = uuid;
    namedScene.name = uuid;

    return namedScene;
  }

  function track(uuid: string): Track {
    const namedTrack = new Track();
    namedTrack.uuid = uuid;
    namedTrack.name = uuid;

    return namedTrack;
  }

  function region(sceneUuid: string, startMillis: number, endMillis: number, trackUuid?: string): ScenePlaybackRegion {
    const playbackRegion = new ScenePlaybackRegion();
    playbackRegion.sceneUuid = sceneUuid;
    playbackRegion.startMillis = startMillis;
    playbackRegion.endMillis = endMillis;
    playbackRegion.trackUuid = trackUuid;

    return playbackRegion;
  }

  function composition(...regions: ScenePlaybackRegion[]): Composition {
    const withRegions = new Composition();
    withRegions.scenePlaybackRegions = regions;

    return withRegions;
  }

  describe('the clips of a track', () => {
    it('lists only the clips of the track, in the order they are played', () => {
      const late = region('a', 5000, 6000, 'track-1');
      const early = region('b', 1000, 2000, 'track-1');
      const other = region('c', 0, 1000, 'track-2');

      expect(getTrackRegions(composition(late, other, early), 'track-1')).toEqual([early, late]);
    });
  });

  describe('the free room on a track', () => {
    const clips = () =>
      composition(region('a', 1000, 2000, 'track-1'), region('b', 4000, 5000, 'track-1'), region('c', 0, 9000, 'track-2'));

    it('lets a clip start right where the one before it ends', () => {
      expect(isFreeOnTrack(clips(), 'track-1', 2000, 4000)).toBe(true);
    });

    it('refuses a clip which would overlap another one of the track', () => {
      expect(isFreeOnTrack(clips(), 'track-1', 1500, 3000)).toBe(false);
      expect(isFreeOnTrack(clips(), 'track-1', 3000, 4500)).toBe(false);
      expect(isFreeOnTrack(clips(), 'track-1', 0, 9000)).toBe(false);
    });

    it('does not mind the clips of the other tracks', () => {
      expect(isFreeOnTrack(clips(), 'track-3', 0, 9000)).toBe(true);
    });

    it('does not keep a clip out of its own way', () => {
      const withClips = clips();

      expect(isFreeOnTrack(withClips, 'track-1', 1500, 2500, withClips.scenePlaybackRegions[0])).toBe(true);
    });

    it('finds the gap between the clips around a point in time', () => {
      expect(getFreeGap(clips(), 'track-1', 3000)).toEqual({ startMillis: 2000, endMillis: 4000 });
      expect(getFreeGap(clips(), 'track-1', 500)).toEqual({ startMillis: 0, endMillis: 1000 });
      expect(getFreeGap(clips(), 'track-1', 6000)).toEqual({ startMillis: 5000, endMillis: Infinity });
    });

    it('finds no gap where a clip plays', () => {
      expect(getFreeGap(clips(), 'track-1', 1000)).toBeUndefined();
      expect(getFreeGap(clips(), 'track-1', 1999)).toBeUndefined();
    });
  });

  describe('a project from before the tracks', () => {
    it('plays every scene on a track of its own, in the order of the scenes', () => {
      const scenes = [scene('first'), scene('second')];
      const withoutTracks = composition(region('second', 0, 4000), region('first', 2000, 6000), region('second', 5000, 8000));

      assignTracks(withoutTracks, scenes, newUuid);

      expect(withoutTracks.tracks.map((t) => t.name)).toEqual(['first', 'second']);
      expect(withoutTracks.scenePlaybackRegions.map((r) => r.trackUuid)).toEqual(['uuid-2', 'uuid-1', 'uuid-2']);
    });

    it('puts the clips of a scene which overlap each other on another track below', () => {
      const scenes = [scene('first'), scene('second')];
      const withoutTracks = composition(region('first', 0, 4000), region('first', 2000, 6000), region('second', 0, 1000));

      assignTracks(withoutTracks, scenes, newUuid);

      expect(withoutTracks.tracks.map((t) => t.name)).toEqual(['first', 'first 2', 'second']);
      expect(withoutTracks.scenePlaybackRegions.map((r) => r.trackUuid)).toEqual(['uuid-1', 'uuid-2', 'uuid-3']);
    });

    it('leaves a composition without clips without tracks, e.g. one which only plays actions', () => {
      const empty = composition();

      assignTracks(empty, [scene('first')], newUuid);

      expect(empty.tracks.length).toBe(0);
    });

    it('leaves the clips which are on a track already where they are', () => {
      const withTracks = composition(region('first', 0, 4000, 'track-1'));
      withTracks.tracks = [track('track-1')];

      assignTracks(withTracks, [scene('first')], newUuid);

      expect(withTracks.tracks.length).toBe(1);
      expect(withTracks.scenePlaybackRegions[0].trackUuid).toBe('track-1');
    });
  });

  describe('the tracks of a preview', () => {
    function tracks(...flags: string[]): Composition {
      const withTracks = composition();
      withTracks.tracks = flags.map((flag, index) => {
        const flagged = track('track-' + index);
        flagged.hidden = flag.indexOf('hidden') >= 0;
        flagged.solo = flag.indexOf('solo') >= 0;
        return flagged;
      });

      return withTracks;
    }

    const uuids = (withTracks: Composition) => getPreviewTracks(withTracks).map((t) => t.uuid);

    it('plays every track which is not hidden', () => {
      expect(uuids(tracks('', 'hidden', ''))).toEqual(['track-0', 'track-2']);
    });

    it('plays only the soloed tracks once a track is soloed', () => {
      expect(uuids(tracks('', 'solo', '', 'solo'))).toEqual(['track-1', 'track-3']);
    });

    it('keeps a hidden track out, even if it is soloed', () => {
      expect(uuids(tracks('', 'solo hidden', 'solo'))).toEqual(['track-2']);
    });
  });

  it('names a new track after the first number no track carries yet', () => {
    const withTracks = composition();
    withTracks.tracks = [track('Track 2')];

    expect(getNewTrackName(withTracks)).toBe('Track 3');

    withTracks.tracks.push(track('Track 3'));

    expect(getNewTrackName(withTracks)).toBe('Track 4');
  });
});
