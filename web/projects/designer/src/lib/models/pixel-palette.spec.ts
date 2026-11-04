import { hexToRgb, PixelPalette, rgbToHex } from './pixel-palette';

function palette(stops: [number, string][], extra: any = {}): PixelPalette {
  return new PixelPalette({ stops: stops.map(([position, color]) => ({ position, color })), ...extra });
}

const round = (color: number[]) => color.map((component) => Math.round(component * 255));

describe('PixelPalette', () => {
  it('blends from one color to the next', () => {
    const blackToRed = palette([
      [0, '#000000'],
      [1, '#ff0000'],
    ]);

    expect(round(blackToRed.colorAt(0))).toEqual([0, 0, 0]);
    expect(round(blackToRed.colorAt(0.5))).toEqual([128, 0, 0]);
    expect(round(blackToRed.colorAt(1))).toEqual([255, 0, 0]);
  });

  it('runs back and forth beyond its ends, or starts over when it wraps', () => {
    const blackToRed = palette([
      [0, '#000000'],
      [1, '#ff0000'],
    ]);
    const wrapping = palette(
      [
        [0, '#000000'],
        [1, '#ff0000'],
      ],
      { repeat: 'wrap' }
    );

    expect(round(blackToRed.colorAt(1.25))).toEqual([191, 0, 0]);
    expect(round(blackToRed.colorAt(-0.25))).toEqual([64, 0, 0]);
    expect(round(wrapping.colorAt(1.25))).toEqual([64, 0, 0]);
  });

  it('jumps from color to color in steps', () => {
    const steps = palette(
      [
        [0, '#ff0000'],
        [0.5, '#00ff00'],
        [1, '#0000ff'],
      ],
      { between: 'steps' }
    );

    expect(round(steps.colorAt(0.2))).toEqual([255, 0, 0]);
    expect(round(steps.colorAt(0.5))).toEqual([0, 255, 0]);
    expect(round(steps.colorAt(0.99))).toEqual([0, 0, 255]);
  });

  it('sorts its colors by their place, and keeps the ones beyond the first and the last', () => {
    const unsorted = palette([
      [0.8, '#ffffff'],
      [0.2, '#000000'],
    ]);

    expect(round(unsorted.colorAt(0.1))).toEqual([0, 0, 0]);
    expect(round(unsorted.colorAt(0.35))).toEqual([64, 64, 64]);
    expect(round(unsorted.colorAt(0.9))).toEqual([255, 255, 255]);
  });

  it('is black without colors or with a color it cannot read', () => {
    expect(new PixelPalette().colorAt(0.5)).toEqual([0, 0, 0]);
    expect(palette([[0, 'orange']]).colorAt(0.5)).toEqual([0, 0, 0]);
    expect(hexToRgb(undefined)).toEqual([0, 0, 0]);
  });

  it('keeps what it does not get', () => {
    const empty = new PixelPalette({});

    expect(empty.between).toBe('smooth');
    expect(empty.repeat).toBe('mirror');
    expect(new PixelPalette({ stops: [{ position: null, color: null }] }).stops[0]).toEqual(
      jasmine.objectContaining({ position: 0, color: '#000000' })
    );
  });

  it('makes the shades of a color, from black up to the color and on to nearly white', () => {
    const shades = new PixelPalette({ stops: PixelPalette.shadesOf([1, 0.5, 0]) });

    expect(shades.stops.map((stop) => stop.color)).toEqual(['#000000', '#ff8000', '#ffdfbf']);
    expect(round(shades.colorAt(0.62))).toEqual([255, 128, 0]);
    expect(rgbToHex([2, -1, 0.5])).toBe('#ff0080');
  });
});
