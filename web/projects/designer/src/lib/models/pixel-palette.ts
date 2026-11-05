import { fract, triangle } from './pixel-math';

// a color of a palette, at its place between 0 and 1
export class PixelPaletteStop {
  position = 0;
  color = '#000000';

  constructor(data?: any) {
    if (!data) {
      return;
    }

    // a value missing or null keeps the default, like in Rocket Show
    this.position = data.position ?? 0;
    this.color = data.color ?? '#000000';
  }
}

// A palette of a pixel effect: the colors a pattern gives its pixels, from the place it puts them at (see
// pixel-pattern). Rocket Show reads the stops alone (PixelPalette), the designer knows where they came from.
export class PixelPalette {
  stops: PixelPaletteStop[] = [];

  // 'smooth' blends from one color to the next, 'steps' jumps from one to the next
  between = 'smooth';

  // A pattern like the flow runs through the palette over and over. 'mirror' runs it back and forth, so a palette
  // which ends on another color than it starts with does not jump, 'wrap' starts over (for a closed one, a rainbow).
  repeat = 'mirror';

  // which palette of the designer it was taken from (e.g. 'fire'), or 'preset' for the shades of the color the preset
  // puts on each pixel. Only the designer reads it, except for 'preset'.
  ref: string;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    if (data.stops) {
      for (const stop of data.stops) {
        this.stops.push(new PixelPaletteStop(stop));
      }
    }

    this.between = data.between || 'smooth';
    this.repeat = data.repeat || 'mirror';
    this.ref = data.ref ?? undefined;
  }

  // The color at a place of the palette, as red, green and blue between 0 and 1. The palette repeats beyond 0 and 1.
  public colorAt(place: number): number[] {
    return PixelPalette.colorOf(this.stops, this.between, this.repeat, place);
  }

  // the color at a place of the passed stops, which do not have to be sorted (see colorAt)
  public static colorOf(stops: PixelPaletteStop[], between: string, repeat: string, place: number): number[] {
    if (stops.length === 0) {
      return [0, 0, 0];
    }

    // by their place, the ones on the same place in the order they are listed in
    const sorted = stops.slice().sort((stop1, stop2) => stop1.position - stop2.position);
    const position = repeat === 'wrap' ? fract(place) : triangle(place * 0.5);

    if (between === 'steps') {
      return hexToRgb(sorted[Math.min(sorted.length - 1, Math.floor(position * sorted.length))].color);
    }

    if (position <= sorted[0].position) {
      return hexToRgb(sorted[0].color);
    }

    for (let i = 1; i < sorted.length; i++) {
      if (position <= sorted[i].position) {
        const from = hexToRgb(sorted[i - 1].color);
        const to = hexToRgb(sorted[i].color);
        const width = sorted[i].position - sorted[i - 1].position;
        const share = width > 0 ? (position - sorted[i - 1].position) / width : 1;

        return [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share, from[2] + (to[2] - from[2]) * share];
      }
    }

    return hexToRgb(sorted[sorted.length - 1].color);
  }

  // The shades of a color, for the palette which follows the color of the preset: from the color itself most of the way
  // to white (the patterns make a pixel darker themselves). The color as red, green and blue between 0 and 1.
  public static shadesOf(color: number[]): PixelPaletteStop[] {
    const light = color.map((component) => component + (1 - component) * 0.75);

    return [new PixelPaletteStop({ position: 0, color: rgbToHex(color) }), new PixelPaletteStop({ position: 1, color: rgbToHex(light) })];
  }
}

// A palette of the pixel effects saved with the project: its name, its colors and how it runs through them (see
// PixelPalette)
export class ProjectPixelPalette {
  uuid: string;
  name = '';
  stops: PixelPaletteStop[] = [];
  between = 'smooth';
  repeat = 'mirror';

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.uuid = data.uuid;
    this.name = data.name ?? '';
    this.stops = Array.isArray(data.stops) ? data.stops.map((stop: any) => new PixelPaletteStop(stop)) : [];
    this.between = data.between || 'smooth';
    this.repeat = data.repeat || 'mirror';
  }
}

// a color like #ff8000 as red, green and blue between 0 and 1, black for anything else
export function hexToRgb(hex: string): number[] {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return [0, 0, 0];
  }

  return [parseInt(hex.substring(1, 3), 16) / 255, parseInt(hex.substring(3, 5), 16) / 255, parseInt(hex.substring(5, 7), 16) / 255];
}

// red, green and blue between 0 and 1 as a color like #ff8000, rounded to the nearest of the 256 steps
export function rgbToHex(color: number[]): string {
  return '#' + color.map((component) => ('0' + Math.round(Math.max(Math.min(component, 1), 0) * 255).toString(16)).slice(-2)).join('');
}
