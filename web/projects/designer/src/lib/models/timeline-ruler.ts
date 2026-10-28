import { Composition } from './composition';

// a mark on the ruler of the timeline, at a point in time of the composition
export interface RulerTick {
  millis: number;

  // the longer marks carry a label: the number of the bar or the time
  label?: string;
}

// how far apart the lines across the tracks are drawn, in millis. The strong lines mark
// the bars (or the seconds), the light ones the beats in between, if there is room.
export interface GridSpacing {
  lineMillis: number;
  strongLineMillis: number;

  // where the grid starts (the first beat of the song)
  offsetMillis: number;
}

// the smallest of the steps which keeps its marks at least the passed pixels apart
function pick(stepsMillis: number[], pxPerSecond: number, minPx: number): number {
  for (const step of stepsMillis) {
    if ((step / 1000) * pxPerSecond >= minPx) {
      return step;
    }
  }

  return stepsMillis[stepsMillis.length - 1];
}

function musical(composition: Composition): boolean {
  return composition.gridType === 'musical' && composition.beatsPerMinute > 0;
}

function beatMillis(composition: Composition): number {
  return 60000 / composition.beatsPerMinute;
}

function barMillis(composition: Composition): number {
  return beatMillis(composition) * (composition.timeSignatureUpper || 4);
}

const timeSteps = [100, 500, 1000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000];
const barCounts = [1, 2, 4, 8, 16, 32, 64, 128];

export function getGridSpacing(composition: Composition, pxPerSecond: number): GridSpacing {
  if (!musical(composition)) {
    const strong = pick(timeSteps, pxPerSecond, 40);
    const light = pick(timeSteps, pxPerSecond, 10);

    return { lineMillis: light < strong ? light : strong, strongLineMillis: strong, offsetMillis: 0 };
  }

  const bar = barMillis(composition);
  const strong = pick(
    barCounts.map((count) => count * bar),
    pxPerSecond,
    10
  );
  const beat = beatMillis(composition);

  return {
    lineMillis: strong === bar && (beat / 1000) * pxPerSecond >= 10 ? beat : strong,
    strongLineMillis: strong,
    offsetMillis: composition.gridOffsetMillis || 0,
  };
}

function formatTime(millis: number): string {
  const seconds = Math.round(millis / 1000);
  const rest = seconds % 60;

  return Math.floor(seconds / 60) + ':' + (rest < 10 ? '0' : '') + rest;
}

// The marks of the ruler between two points in time. A musical grid is counted in bars
// from the first beat of the song (the grid offset), the others in minutes and seconds.
export function getRulerTicks(composition: Composition, pxPerSecond: number, startMillis: number, endMillis: number): RulerTick[] {
  const ticks: RulerTick[] = [];

  if (!(pxPerSecond > 0) || endMillis <= startMillis) {
    return ticks;
  }

  let stepMillis: number;
  let labelEvery: number;
  let offsetMillis = 0;

  if (musical(composition)) {
    const bar = barMillis(composition);
    const beat = beatMillis(composition);
    const labelBars = pick(
      barCounts.map((count) => count * bar),
      pxPerSecond,
      40
    );

    stepMillis = pick([beat, bar, ...barCounts.slice(1).map((count) => count * bar)], pxPerSecond, 6);
    labelEvery = Math.max(1, Math.round(labelBars / stepMillis));
    offsetMillis = composition.gridOffsetMillis || 0;
  } else {
    const labelStep = pick(timeSteps, pxPerSecond, 60);

    stepMillis = pick(timeSteps, pxPerSecond, 8);
    labelEvery = Math.max(1, Math.round(labelStep / stepMillis));
  }

  const first = Math.ceil((startMillis - offsetMillis) / stepMillis);
  const last = Math.floor((endMillis - offsetMillis) / stepMillis);

  for (let index = first; index <= last; index++) {
    const millis = offsetMillis + index * stepMillis;

    if (millis < 0) {
      continue;
    }

    const tick: RulerTick = { millis };

    if (index % labelEvery === 0 && index >= 0) {
      tick.label = musical(composition) ? String(Math.round((millis - offsetMillis) / barMillis(composition))) : formatTime(millis);
    }

    ticks.push(tick);
  }

  return ticks;
}
