import { AUDIO_SILENCE_DB, audioLevelOf, PixelAudio, PixelAudioSettings } from './pixel-audio';
import { analyzeAudio, audioBandEdges, demoAudioFrames, mixAudio } from './pixel-audio-analysis';

function settings(extra: Partial<PixelAudioSettings> = {}): PixelAudioSettings {
  return { audioBand: 'full', audioGainDb: 0, audioFloorDb: -60, audioAttackMillis: 0, audioReleaseMillis: 0, ...extra };
}

// frames all as loud in each of their values, from the passed one on
function framesFrom(first: number, db: number) {
  return (index: number) => (index >= first ? new Array(21).fill(db) : undefined);
}

describe('PixelAudio', () => {
  it('takes a level between the floor and full scale, with the gain', () => {
    expect(audioLevelOf(0, settings())).toBe(1);
    expect(audioLevelOf(-30, settings())).toBe(0.5);
    expect(audioLevelOf(-70, settings())).toBe(0);
    expect(audioLevelOf(-36, settings({ audioGainDb: 6 }))).toBe(0.5);
    expect(audioLevelOf(-20, settings({ audioFloorDb: -40 }))).toBe(0.5);
  });

  it('follows the audio at once without an attack and a release, silent where there are no frames', () => {
    const audio = new PixelAudio(framesFrom(10, -30), 300, settings());

    expect(audio.level()).toBe(0.5);
    // before the first frame
    expect(audio.levelAgo(10)).toBe(0);
    expect(new PixelAudio(() => undefined, 300, settings()).level()).toBe(0);
  });

  it('rises as fast as the attack and falls as fast as the release lets it', () => {
    // loud from 200 ms on, at 240 ms
    const rising = new PixelAudio(framesFrom(10, 0), 240, settings({ audioAttackMillis: 180 }));
    expect(rising.level()).toBeGreaterThan(0.2);
    expect(rising.level()).toBeLessThan(0.5);

    // loud until 200 ms, silent after
    const silentAfter = (index: number) => (index < 10 ? new Array(21).fill(0) : new Array(21).fill(AUDIO_SILENCE_DB));
    expect(new PixelAudio(silentAfter, 260, settings()).level()).toBe(0);
    expect(new PixelAudio(silentAfter, 260, settings({ audioReleaseMillis: 1000 })).level()).toBeGreaterThan(0.8);
  });

  it('follows the bass, the mids, the highs or each of the 16 bands', () => {
    // each value of a frame as loud as its place says
    const frames = () => Array.from({ length: 21 }, (_, i) => -60 + i * 2);
    const level = (audioBand: string) => new PixelAudio(frames, 100, settings({ audioBand })).level();

    expect([level('full'), level('bass'), level('mid'), level('high')]).toEqual([0, 4 / 60, 6 / 60, 8 / 60]);
    expect(new PixelAudio(frames, 100, settings()).band(15)).toBe(40 / 60);
    expect(new PixelAudio(frames, 100, settings()).band(99)).toBe(40 / 60);
  });
});

describe('the analysis of the audio', () => {
  // a second of a sine at full scale, of the passed frequency, in two channels
  function sine(hz: number, seconds = 0.2) {
    const sampleRate = 48000;
    const samples = new Float32Array(sampleRate * seconds).map((_, i) => Math.sin((2 * Math.PI * hz * i) / sampleRate));

    return { sampleRate, numberOfChannels: 2, length: samples.length, getChannelData: () => samples };
  }

  it('measures how loud each 20 ms are, and in which bands', async () => {
    const frames = await analyzeAudio(sine(1000));
    const middle = frames[5];

    expect(frames.length).toBe(10);
    // a sine at full scale: an RMS of -3 dB, a peak of 0
    expect(middle[0]).toBeCloseTo(-3.01, 1);
    expect(middle[1]).toBeCloseTo(0, 1);
    // in the mids, and in the band from 800 to 1164 Hz
    expect(middle[3]).toBeGreaterThan(-4);
    expect(middle[2]).toBeLessThan(-30);
    expect(middle[4]).toBeLessThan(-30);
    const bands = middle.slice(5);
    expect(bands.indexOf(Math.max(...bands))).toBe(8);
    expect(audioBandEdges()[8]).toBeCloseTo(800, 6);
  });

  it('finds silence silent, and keeps a beat going while no composition plays', async () => {
    const silence = await analyzeAudio({
      sampleRate: 44100,
      numberOfChannels: 1,
      length: 4410,
      getChannelData: () => new Float32Array(4410),
    });
    expect(silence[2].every((db) => db === AUDIO_SILENCE_DB)).toBe(true);

    // a kick on the beat, quieter between
    expect(demoAudioFrames(0).length).toBe(21);
    expect(demoAudioFrames(25)[2]).toBeGreaterThan(demoAudioFrames(37)[2]);
  });

  it('mixes parts of audio playing together into one channel, each from where it starts and as loud as it plays', () => {
    const mixed = mixAudio([
      // two channels, on average
      { channels: [new Float32Array([1, 1, 1]), new Float32Array([0, 0, 0])], offset: 0, volume: 1 },
      // two samples later, half as loud
      { channels: [new Float32Array([1, 1])], offset: 2, volume: 0.5 },
      // a sample earlier: its first one is cut off
      { channels: [new Float32Array([4, 0.25])], offset: -1, volume: 1 },
      // nothing
      { channels: [], offset: 9, volume: 1 },
    ]);

    expect(Array.from(mixed)).toEqual([0.75, 0.5, 1, 0.5]);
    expect(mixAudio([]).length).toBe(0);
  });
});
