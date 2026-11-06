import { hexToRgb, PixelPalette, PixelPaletteStop, ProjectPixelPalette, rgbToHex } from './pixel-palette';
import { Project } from './project';

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

  it('makes the shades of a color, from the color itself to nearly white', () => {
    const shades = new PixelPalette({ stops: PixelPalette.shadesOf([1, 0.5, 0]) });

    expect(shades.stops.map((stop) => stop.color)).toEqual(['#ff8000', '#ffdfbf']);
    expect(round(shades.colorAt(0))).toEqual([255, 128, 0]);
    expect(rgbToHex([2, -1, 0.5])).toBe('#ff0080');
  });

  it('is saved with the project under a name, keeping what it does not get', () => {
    const project = new Project({
      pixelPalettes: [{ uuid: 'p', name: 'Mine', stops: [{ position: 0.5, color: '#00ff00' }], between: 'steps' }, {}],
    });

    expect(project.pixelPalettes[0] instanceof ProjectPixelPalette).toBe(true);
    expect([project.pixelPalettes[0].name, project.pixelPalettes[0].stops[0].color, project.pixelPalettes[0].between]).toEqual([
      'Mine',
      '#00ff00',
      'steps',
    ]);
    expect([project.pixelPalettes[1].name, project.pixelPalettes[1].repeat, project.pixelPalettes[1].stops]).toEqual(['', 'mirror', []]);
    expect(new Project({}).pixelPalettes).toEqual([]);
  });

  it('reads the colors of a palette once, and again once a stop moved or got another color', () => {
    const stops = [new PixelPaletteStop({ position: 1, color: '#0000ff' }), new PixelPaletteStop({ position: 0, color: '#ff0000' })];

    expect(PixelPalette.colorOf(stops, 'smooth', 'wrap', 0)).toEqual([1, 0, 0]);
    // what is handed out can be changed without changing the palette
    PixelPalette.colorOf(stops, 'smooth', 'wrap', 0)[0] = 0.5;
    expect(PixelPalette.colorOf(stops, 'smooth', 'wrap', 0)).toEqual([1, 0, 0]);

    stops[1].color = '#00ff00';
    expect(PixelPalette.colorOf(stops, 'smooth', 'wrap', 0)).toEqual([0, 1, 0]);
    stops[1].position = 0.5;
    expect(PixelPalette.colorOf(stops, 'smooth', 'wrap', 0.25)).toEqual([0, 1, 0]);
    stops.push(new PixelPaletteStop({ position: 0, color: '#ffffff' }));
    expect(PixelPalette.colorOf(stops, 'steps', 'wrap', 0)).toEqual([1, 1, 1]);
    // stops made for one pixel alone are not kept, and read the same
    expect(PixelPalette.colorOf(stops, 'smooth', 'wrap', 0.75, false)).toEqual(PixelPalette.colorOf(stops, 'smooth', 'wrap', 0.75));
  });
});
