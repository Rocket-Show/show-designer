import { AUDIO_BANDS, AUDIO_FRAME_MILLIS, AUDIO_SILENCE_DB, AudioFrames } from './pixel-audio';
import { hash } from './pixel-math';

// The analysis of the audio of a composition the pixel effects follow (see PixelAudio): for each 20 ms, how loud it is
// (the RMS and the peak, of all of its channels), how loud the bass, the mids and the highs are and each of 16 bands
// from the lowest to the highest. Rocket Show measures the same while the audio plays (with the level and the
// spectrum of GStreamer, see AudioAnalysisService), as closely as it can: the same frames, the same dB of full scale,
// the same bands.

// the bands: from 40 Hz to 16 kHz, each as many times higher as the one before
export const AUDIO_LOWEST_HZ = 40;
export const AUDIO_HIGHEST_HZ = 16000;

// where the bass ends and the highs start
export const AUDIO_BASS_HZ = 250;
export const AUDIO_HIGH_HZ = 4000;

// the frequencies between the bands, from the lowest to the highest
export function audioBandEdges(): number[] {
  const edges: number[] = [];

  for (let band = 0; band <= AUDIO_BANDS; band++) {
    edges.push(AUDIO_LOWEST_HZ * Math.pow(AUDIO_HIGHEST_HZ / AUDIO_LOWEST_HZ, band / AUDIO_BANDS));
  }

  return edges;
}

function toDb(power: number): number {
  return power > 0 ? Math.max(10 * Math.log10(power), AUDIO_SILENCE_DB) : AUDIO_SILENCE_DB;
}

// the frequencies of the powers of an FFT (of the passed size), in power of full scale, summed into the passed ranges
function bandPower(powers: Float64Array, sampleRate: number, size: number, from: number, to: number): number {
  const first = Math.max(1, Math.ceil((from * size) / sampleRate));
  const last = Math.min(size / 2 - 1, Math.floor((to * size) / sampleRate));
  let power = 0;

  if (last < first) {
    // a band narrower than a bin: the bin it is in
    return powers[Math.min(size / 2 - 1, Math.max(1, Math.round((((from + to) / 2) * size) / sampleRate)))];
  }

  for (let bin = first; bin <= last; bin++) {
    power += powers[bin];
  }

  return power;
}

// an FFT of real samples (as many as a power of 2), in place: the real and the imaginary parts
function fft(real: Float64Array, imaginary: Float64Array) {
  const size = real.length;

  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;

    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }

    j ^= bit;

    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]];
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);

    for (let start = 0; start < size; start += length) {
      let wReal = 1;
      let wImaginary = 0;

      for (let k = 0; k < length / 2; k++) {
        const a = start + k;
        const b = a + length / 2;
        const tReal = real[b] * wReal - imaginary[b] * wImaginary;
        const tImaginary = real[b] * wImaginary + imaginary[b] * wReal;

        real[b] = real[a] - tReal;
        imaginary[b] = imaginary[a] - tImaginary;
        real[a] += tReal;
        imaginary[a] += tImaginary;

        const nextReal = wReal * stepReal - wImaginary * stepImaginary;
        wImaginary = wReal * stepImaginary + wImaginary * stepReal;
        wReal = nextReal;
      }
    }
  }
}

// the samples of an audio, its channels and how many there are each second
export interface AudioSamples {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  getChannelData(channel: number): Float32Array;
}

// a part of audio playing with others: its samples, each channel on its own, how many samples later than the others it
// starts (earlier, if negative) and how loud it plays
export interface AudioPart {
  channels: Float32Array[];
  offset: number;
  volume: number;
}

// Parts of audio playing together, mixed into one channel: each part its channels on average, as loud as it plays, from
// where it starts
export function mixAudio(parts: AudioPart[]): Float32Array {
  let length = 0;

  for (const part of parts) {
    if (part.channels.length > 0) {
      length = Math.max(length, part.offset + part.channels[0].length);
    }
  }

  const mixed = new Float32Array(Math.max(0, length));

  for (const part of parts) {
    const count = part.channels.length;

    for (let i = Math.max(0, -part.offset); count > 0 && i < part.channels[0].length; i++) {
      let sum = 0;

      for (const channel of part.channels) {
        sum += channel[i];
      }

      mixed[part.offset + i] += (sum / count) * part.volume;
    }
  }

  return mixed;
}

// The frames of an audio (see PixelAudio), worked out a few hundred at a time so the designer keeps reacting while a
// long song is analyzed
export async function analyzeAudio(audio: AudioSamples): Promise<number[][]> {
  const frameSamples = Math.max(1, Math.round((audio.sampleRate * AUDIO_FRAME_MILLIS) / 1000));
  let size = 256;

  while (size < frameSamples) {
    size <<= 1;
  }

  const channels: Float32Array[] = [];

  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    channels.push(audio.getChannelData(channel));
  }

  // a Hann window, and how much it takes away of a sine
  const window = new Float64Array(size);

  for (let i = 0; i < size; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }

  const edges = audioBandEdges();
  const frames: number[][] = [];
  const count = Math.ceil(audio.length / frameSamples);
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  const powers = new Float64Array(size / 2);

  for (let index = 0; index < count; index++) {
    const start = index * frameSamples;
    const end = Math.min(start + frameSamples, audio.length);
    let power = 0;
    let peak = 0;

    // the RMS of each channel, the frame as loud as their power on average, the peak of all of them
    for (const samples of channels) {
      let sum = 0;

      for (let i = start; i < end; i++) {
        sum += samples[i] * samples[i];
        peak = Math.max(peak, Math.abs(samples[i]));
      }

      power += sum / Math.max(1, end - start) / channels.length;
    }

    // the frequencies of the channels mixed, from the window around the frame
    real.fill(0);
    imaginary.fill(0);

    for (let i = 0; i < size; i++) {
      const at = start + i - Math.floor((size - frameSamples) / 2);

      if (at >= 0 && at < audio.length) {
        let sample = 0;

        for (const samples of channels) {
          sample += samples[at];
        }

        real[i] = (sample / channels.length) * window[i];
      }
    }

    fft(real, imaginary);

    // in power of a sine at full scale
    for (let bin = 0; bin < size / 2; bin++) {
      const amplitude = (Math.sqrt(real[bin] * real[bin] + imaginary[bin] * imaginary[bin]) * 2) / (size * 0.5);
      powers[bin] = (amplitude * amplitude) / 2;
    }

    const frame = [
      toDb(power),
      peak > 0 ? Math.max(20 * Math.log10(peak), AUDIO_SILENCE_DB) : AUDIO_SILENCE_DB,
      toDb(bandPower(powers, audio.sampleRate, size, AUDIO_LOWEST_HZ, AUDIO_BASS_HZ)),
      toDb(bandPower(powers, audio.sampleRate, size, AUDIO_BASS_HZ, AUDIO_HIGH_HZ)),
      toDb(bandPower(powers, audio.sampleRate, size, AUDIO_HIGH_HZ, AUDIO_HIGHEST_HZ)),
    ];

    for (let band = 0; band < AUDIO_BANDS; band++) {
      frame.push(toDb(bandPower(powers, audio.sampleRate, size, edges[band], edges[band + 1])));
    }

    // rounded to a hundredth of a dB, like Rocket Show keeps them
    frames.push(frame.map((db) => Math.round(db * 100) / 100));

    if (index % 500 === 499) {
      await new Promise((resolve) => setTimeout(resolve));
    }
  }

  return frames;
}

// The frames of a beat at 120 bpm, for a pixel effect following the audio while no composition plays: a kick on each
// beat, a hi-hat between them and the mids in between
export const demoAudioFrames: AudioFrames = (index: number) => {
  const beat = 500 / AUDIO_FRAME_MILLIS;
  const sinceKick = (index % beat) / beat;
  const sinceHat = ((index + beat / 2) % beat) / beat;
  const kick = Math.pow(1 - sinceKick, 4);
  const hat = Math.pow(1 - sinceHat, 8);
  const mid = 0.5 + 0.5 * hash(Math.floor(index / 5), 0, 3);
  const bass = -42 + 40 * kick;
  const mids = -34 + 14 * mid + 6 * kick;
  const highs = -48 + 34 * hat;
  const rms = Math.max(bass, mids, highs) - 4;
  const frame = [rms, rms + 6, bass, mids, highs];

  for (let band = 0; band < AUDIO_BANDS; band++) {
    const level = band < 4 ? bass - band * 2 : band < 11 ? mids - (band % 3) * 2 : highs - (band - 11) * 2;
    frame.push(level - 6 * hash(index, band, 9));
  }

  return frame;
};
