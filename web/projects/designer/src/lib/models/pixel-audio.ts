import { clamp01 } from './pixel-math';

// The audio a pixel effect follows: frames of an analysis of the audio of the composition, each 20 ms long, which say
// how loud it is (the RMS and the peak), how loud the bass, the mids and the highs are, and how loud each of 16 bands
// from the lowest to the highest is, all in dB (0 at full scale). The designer analyzes the audio file, Rocket Show
// the audio while it plays: what can be the same is how the frames light the pixels, which both do the very same way
// (PixelAudio).

export const AUDIO_FRAME_MILLIS = 20;
export const AUDIO_BANDS = 16;

// where each is in a frame
export const AUDIO_RMS = 0;
export const AUDIO_PEAK = 1;
export const AUDIO_BASS = 2;
export const AUDIO_MID = 3;
export const AUDIO_HIGH = 4;
export const AUDIO_FIRST_BAND = 5;

// as quiet as a frame which is missing
export const AUDIO_SILENCE_DB = -100;

// how many frames before a moment the envelope starts from silence: a second
const ENVELOPE_FRAMES = 50;

// the frames of an analysis by their index (the frame from 0 to 20 ms is the first one), none where there is none
export type AudioFrames = (index: number) => number[] | undefined;

// what an effect sets for the audio it follows (see EffectPixel)
export interface PixelAudioSettings {
  // 'full' (the RMS), 'bass', 'mid' or 'high'
  audioBand: string;
  // how much louder it is taken, and how quiet is silent (in dB)
  audioGainDb: number;
  audioFloorDb: number;
  // how fast the level follows the audio up and down again (in ms)
  audioAttackMillis: number;
  audioReleaseMillis: number;
}

// how loud an audio is between 0 (as quiet as the floor or quieter) and 1 (at full scale), with the gain
export function audioLevelOf(db: number, settings: PixelAudioSettings): number {
  const floor = Math.min(settings.audioFloorDb, -1);

  return clamp01((db + settings.audioGainDb - floor) / -floor);
}

// The audio at a moment, as an effect follows it: each level is an envelope of the frames up to the moment, rising
// as fast as the attack and falling as fast as the release lets it, from silence a second before. The same frames
// always light the pixels the same way, wherever the timeline is started from.
export class PixelAudio {
  // the frame of the moment
  private readonly frameIndex: number;
  private readonly envelopes = new Map<number, number>();

  constructor(private frames: AudioFrames, timeMillis: number, private settings: PixelAudioSettings) {
    this.frameIndex = Math.floor(timeMillis / AUDIO_FRAME_MILLIS);
  }

  // how loud the band the effect follows is, between 0 and 1
  public level(): number {
    return this.envelope(this.followedIndex(), this.frameIndex);
  }

  // how loud the band the effect follows was the passed number of frames before
  public levelAgo(frames: number): number {
    return this.envelope(this.followedIndex(), this.frameIndex - frames);
  }

  // how loud a band of the 16 is (0 the lowest)
  public band(band: number): number {
    return this.envelope(AUDIO_FIRST_BAND + Math.max(0, Math.min(AUDIO_BANDS - 1, band)), this.frameIndex);
  }

  private followedIndex(): number {
    switch (this.settings.audioBand) {
      case 'bass':
        return AUDIO_BASS;
      case 'mid':
        return AUDIO_MID;
      case 'high':
        return AUDIO_HIGH;
      default:
        return AUDIO_RMS;
    }
  }

  // the envelope of a value of the frames at a frame, worked out once
  private envelope(valueIndex: number, frameIndex: number): number {
    const key = frameIndex * 32 + valueIndex;
    const known = this.envelopes.get(key);

    if (known !== undefined) {
      return known;
    }

    const attack = AUDIO_FRAME_MILLIS / (Math.max(this.settings.audioAttackMillis, 0) + AUDIO_FRAME_MILLIS);
    const release = AUDIO_FRAME_MILLIS / (Math.max(this.settings.audioReleaseMillis, 0) + AUDIO_FRAME_MILLIS);
    let envelope = 0;

    for (let i = frameIndex - ENVELOPE_FRAMES; i <= frameIndex; i++) {
      const frame = i >= 0 ? this.frames(i) : undefined;
      const db = frame && typeof frame[valueIndex] === 'number' ? frame[valueIndex] : AUDIO_SILENCE_DB;
      const level = audioLevelOf(db, this.settings);

      envelope = envelope + (level - envelope) * (level > envelope ? attack : release);
    }

    this.envelopes.set(key, envelope);

    return envelope;
  }
}
