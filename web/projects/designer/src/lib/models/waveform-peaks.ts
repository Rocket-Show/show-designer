// the part of a decoded audio file the waveform is read from (an AudioBuffer)
export interface AudioSamples {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

// The loudest sample of every slice of the audio, over all of its channels: what the
// waveform of the timeline is drawn from. A fixed number of slices per second is enough
// for the closest zoom and keeps redrawing cheap while scrolling.
export function computePeaks(samples: AudioSamples, peaksPerSecond: number): Float32Array {
  if (!samples || samples.length === 0 || !(samples.sampleRate > 0)) {
    return new Float32Array(0);
  }

  const samplesPerPeak = Math.max(1, Math.round(samples.sampleRate / peaksPerSecond));
  const peaks = new Float32Array(Math.ceil(samples.length / samplesPerPeak));

  for (let channel = 0; channel < samples.numberOfChannels; channel++) {
    const data = samples.getChannelData(channel);

    for (let index = 0; index < data.length; index++) {
      const value = Math.abs(data[index]);
      const peak = Math.floor(index / samplesPerPeak);

      if (value > peaks[peak]) {
        peaks[peak] = value;
      }
    }
  }

  return peaks;
}

// the loudest peak between two points in time
export function getPeak(peaks: Float32Array, peaksPerSecond: number, startMillis: number, endMillis: number): number {
  const first = Math.max(0, Math.floor((startMillis / 1000) * peaksPerSecond));
  const last = Math.min(peaks.length - 1, Math.max(first, Math.ceil((endMillis / 1000) * peaksPerSecond) - 1));
  let peak = 0;

  for (let index = first; index <= last; index++) {
    if (peaks[index] > peak) {
      peak = peaks[index];
    }
  }

  return peak;
}
