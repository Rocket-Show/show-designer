import { PixelPalette } from './pixel-palette';

// a palette the designer offers for the pixel effects. An effect keeps a copy of its colors (see PixelPalette), so Rocket
// Show never needs this list.
export interface BuiltInPixelPalette {
  id: string;
  stops: [number, string][];
  between?: string;
  repeat?: string;
}

// The palettes to pick from, the shades of the color of the preset first. Their names are translated
// (designer.effect.pixel-palette-<id>).
export const builtInPixelPalettes: BuiltInPixelPalette[] = [
  { id: 'preset', stops: [] },
  {
    id: 'rainbow',
    stops: [
      [0, '#ff0000'],
      [1 / 6, '#ffff00'],
      [2 / 6, '#00ff00'],
      [3 / 6, '#00ffff'],
      [4 / 6, '#0000ff'],
      [5 / 6, '#ff00ff'],
      [1, '#ff0000'],
    ],
    repeat: 'wrap',
  },
  {
    id: 'pink-cyan',
    stops: [
      [0, '#ff2e88'],
      [1, '#00d1ff'],
    ],
  },
  {
    id: 'fire',
    stops: [
      [0, '#000000'],
      [0.22, '#4a0300'],
      [0.45, '#c21a00'],
      [0.68, '#ff7a00'],
      [0.86, '#ffd23f'],
      [1, '#fff5d6'],
    ],
  },
  {
    id: 'ocean',
    stops: [
      [0, '#00122e'],
      [0.35, '#0039a6'],
      [0.68, '#00a3d9'],
      [1, '#8ff8ff'],
    ],
  },
  {
    id: 'sunset',
    stops: [
      [0, '#2a0845'],
      [0.3, '#7a1fa0'],
      [0.55, '#e8407a'],
      [0.8, '#ff8c42'],
      [1, '#ffd76e'],
    ],
  },
  {
    id: 'ice',
    stops: [
      [0, '#06123d'],
      [0.45, '#2c6bff'],
      [0.78, '#a6ecff'],
      [1, '#ffffff'],
    ],
  },
  {
    id: 'aurora',
    stops: [
      [0, '#00ff95'],
      [0.4, '#00b7a8'],
      [0.72, '#3550ff'],
      [1, '#b44dff'],
    ],
  },
  {
    id: 'neon',
    stops: [
      [0, '#ff00c3'],
      [0.5, '#6b00ff'],
      [1, '#00eaff'],
    ],
  },
  {
    id: 'lava',
    stops: [
      [0, '#120000'],
      [0.4, '#8a0000'],
      [0.72, '#ff3700'],
      [1, '#ffb400'],
    ],
  },
  {
    id: 'forest',
    stops: [
      [0, '#03260f'],
      [0.5, '#1f8f4e'],
      [1, '#c4ff4a'],
    ],
  },
  {
    id: 'candy',
    stops: [
      [0, '#ff8fcf'],
      [0.5, '#b79bff'],
      [1, '#8affd1'],
    ],
  },
  {
    id: 'whites',
    stops: [
      [0, '#ff9f45'],
      [0.5, '#ffe6c7'],
      [1, '#d6e6ff'],
    ],
  },
  {
    id: 'signal',
    stops: [
      [0, '#00d85a'],
      [0.6, '#ffe14a'],
      [1, '#ff2b2b'],
    ],
  },
  {
    id: 'red-blue',
    stops: [
      [0, '#ff1d25'],
      [1, '#1e4bff'],
    ],
    between: 'steps',
  },
];

// a palette for an effect, with a copy of the colors of the one picked
export function pixelPaletteOf(palette: BuiltInPixelPalette): PixelPalette {
  return new PixelPalette({
    ref: palette.id,
    stops: palette.stops.map(([position, color]) => ({ position, color })),
    between: palette.between || 'smooth',
    repeat: palette.repeat || 'mirror',
  });
}

// how the colors of a palette look, as a CSS gradient: blended from one to the next or in steps
export function pixelStopsCss(stops: { position: number; color: string }[], between: string): string {
  const sorted = stops.slice().sort((stop1, stop2) => stop1.position - stop2.position);

  if (sorted.length === 0) {
    return '#000000';
  }

  return pixelPaletteCss(
    { id: 'stops', stops: sorted.map((stop) => [stop.position, stop.color] as [number, string]), between },
    sorted[0].color
  );
}

// how a palette looks, as a CSS gradient (the shades of a color for the one of the preset)
export function pixelPaletteCss(palette: BuiltInPixelPalette, presetColor: string): string {
  const stops: [number, string][] =
    palette.id === 'preset'
      ? [
          [0, presetColor],
          [1, '#ffffff'],
        ]
      : palette.stops;

  if (palette.between === 'steps') {
    return (
      'linear-gradient(90deg, ' +
      stops.map(([, color], i) => `${color} ${(i / stops.length) * 100}% ${((i + 1) / stops.length) * 100}%`).join(', ') +
      ')'
    );
  }

  return 'linear-gradient(90deg, ' + stops.map(([position, color]) => `${color} ${position * 100}%`).join(', ') + ')';
}
