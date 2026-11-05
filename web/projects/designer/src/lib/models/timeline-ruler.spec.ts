import { Composition } from './composition';
import { getGridSpacing, getRulerTicks } from './timeline-ruler';
import { computePeaks, getPeak } from './waveform-peaks';

describe('the ruler of the timeline', () => {
  // 120 BPM in 4/4: a beat lasts half a second, a bar two seconds
  function song(gridType = 'musical', gridOffsetMillis = 0): Composition {
    const composition = new Composition();
    composition.gridType = gridType;
    composition.beatsPerMinute = 120;
    composition.timeSignatureUpper = 4;
    composition.gridOffsetMillis = gridOffsetMillis;

    return composition;
  }

  it('counts the bars of a musical grid and marks the beats in between, if there is room', () => {
    // 20 px per second: a beat is 10 px, a bar 40 px
    const ticks = getRulerTicks(song(), 20, 0, 4000);

    expect(ticks.map((tick) => tick.millis)).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000]);
    expect(ticks.filter((tick) => tick.label).map((tick) => [tick.millis, tick.label])).toEqual([
      [0, '0'],
      [2000, '1'],
      [4000, '2'],
    ]);
  });

  it('counts the bars from the first beat of the song', () => {
    const ticks = getRulerTicks(song('musical', 300), 20, 0, 4500);

    expect(ticks[0].millis).toBe(300);
    expect(ticks.filter((tick) => tick.label).map((tick) => [tick.millis, tick.label])).toEqual([
      [300, '0'],
      [2300, '1'],
      [4300, '2'],
    ]);
  });

  it('labels fewer bars when zoomed out', () => {
    // 5 px per second: a bar is 10 px, four of them 40 px
    const labels = getRulerTicks(song(), 5, 0, 16000)
      .filter((tick) => tick.label)
      .map((tick) => tick.label);

    expect(labels).toEqual(['0', '4', '8']);
  });

  it('marks minutes and seconds on a time grid', () => {
    // 10 px per second: a mark every second, a label every ten
    const ticks = getRulerTicks(song('time'), 10, 0, 20000);

    expect(ticks.length).toBe(21);
    expect(ticks.filter((tick) => tick.label).map((tick) => tick.label)).toEqual(['0:00', '0:10', '0:20']);
  });

  it('draws a line across the tracks on every beat when zoomed in, on the bars otherwise', () => {
    expect(getGridSpacing(song(), 20)).toEqual({ lineMillis: 500, strongLineMillis: 2000, offsetMillis: 0 });
    expect(getGridSpacing(song(), 5)).toEqual({ lineMillis: 2000, strongLineMillis: 2000, offsetMillis: 0 });
  });
});

describe('the waveform of the timeline', () => {
  // a file of the passed channels, recorded at 8 samples per second
  function samples(...channels: number[][]): any {
    return {
      numberOfChannels: channels.length,
      length: channels[0].length,
      sampleRate: 8,
      getChannelData: (channel: number) => Float32Array.from(channels[channel]),
    };
  }

  it('keeps the loudest sample of every slice', () => {
    const peaks = computePeaks(samples([0.1, -0.5, 0.2, 0.3, 0, -0.1, 0.9, 0.2]), 4);

    expect(Array.from(peaks).map((peak) => Math.round(peak * 10) / 10)).toEqual([0.5, 0.3, 0.1, 0.9]);
  });

  it('takes the loudest of all channels', () => {
    const peaks = computePeaks(samples([0.1, 0.1, 0.1, 0.1], [0.4, 0, 0, -0.8]), 8);

    expect(Array.from(peaks).map((peak) => Math.round(peak * 10) / 10)).toEqual([0.4, 0.1, 0.1, 0.8]);
  });

  it('finds the loudest peak of a stretch of time', () => {
    const peaks = Float32Array.from([0.1, 0.5, 0.2, 0.9]);

    expect(getPeak(peaks, 4, 0, 500)).toBeCloseTo(0.5);
    expect(getPeak(peaks, 4, 500, 1000)).toBeCloseTo(0.9);
    // a stretch shorter than a slice still finds the slice it lies in
    expect(getPeak(peaks, 4, 760, 770)).toBeCloseTo(0.9);
  });
});
