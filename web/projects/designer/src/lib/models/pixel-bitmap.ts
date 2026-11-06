// The picture a pixel effect shows a text or an image with: its pixels in frames (an animation has more than one), each
// pixel a brightness (a text, a byte each) or red, green and blue (an image, three bytes each), row by row from the top
// left. The designer makes it when the text or the image is picked, at about the size of the pixels it is shown on, so
// Rocket Show needs no fonts and no image decoder: it reads the very same bytes (PixelBitmap).
export class PixelBitmap {
  width = 0;
  height = 0;

  // the bytes of each pixel: 1 (a brightness) or 3 (red, green and blue)
  channels = 1;

  // the frames, each the bytes of its pixels in base 64
  frames: string[] = [];

  // how long each frame of an animation shows, in ms: the frames share the period of the effect by them
  durations: number[] = [];

  // where each letter of a text starts, in columns of the picture, for the colors of the letters
  letterStarts: number[] = [];

  constructor(data?: any) {
    if (!data) {
      return;
    }

    // a value missing or null keeps the default, like in Rocket Show
    this.width = data.width ?? 0;
    this.height = data.height ?? 0;
    this.channels = data.channels === 3 ? 3 : 1;
    this.frames = Array.isArray(data.frames) ? data.frames.slice() : [];
    this.durations = Array.isArray(data.durations) ? data.durations.slice() : [];
    this.letterStarts = Array.isArray(data.letterStarts) ? data.letterStarts.slice() : [];
  }

  // the bytes of a frame, decoded once (none for a frame which can't be read)
  public frame(index: number): Uint8Array {
    let decoded = decodedFrames.get(this);

    if (!decoded) {
      decoded = [];
      decodedFrames.set(this, decoded);
    }

    if (!decoded[index]) {
      decoded[index] = decodeBase64(this.frames[index]);
    }

    return decoded[index];
  }

  // A byte of a pixel of a frame: of its brightness (channel 0) or of red, green and blue (0 to 2). 0 outside of the
  // picture and beyond the bytes there are.
  public value(frame: Uint8Array, x: number, y: number, channel: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return 0;
    }

    const index = (y * this.width + x) * this.channels + channel;

    return index < frame.length ? frame[index] : 0;
  }

  // The frame shown at a moment of the period of the effect (0 to 1): the frames one after the other, each as long as
  // it lasts. A frame of no length (or one without a length) lasts 100 ms.
  public frameAt(moment: number): number {
    const count = this.frames.length;

    if (count <= 1) {
      return 0;
    }

    let total = 0;

    for (let i = 0; i < count; i++) {
      total += frameDuration(this.durations[i]);
    }

    const at = moment * total;
    let end = 0;

    for (let i = 0; i < count; i++) {
      end += frameDuration(this.durations[i]);

      if (at < end) {
        return i;
      }
    }

    return count - 1;
  }

  // the bytes decoded from base 64 are kept aside of the bitmap, so they are not saved with it
  public toJSON(): any {
    return {
      width: this.width,
      height: this.height,
      channels: this.channels,
      frames: this.frames,
      durations: this.durations,
      letterStarts: this.letterStarts,
    };
  }
}

// the frames of each bitmap, once decoded
const decodedFrames = new WeakMap<PixelBitmap, Uint8Array[]>();

function frameDuration(duration: number): number {
  return typeof duration === 'number' && duration > 0 ? duration : 100;
}

// the bytes of a text in base 64, none for one which can't be read
export function decodeBase64(text: string): Uint8Array {
  if (typeof text !== 'string') {
    return new Uint8Array(0);
  }

  try {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  } catch {
    return new Uint8Array(0);
  }
}

// bytes in base 64
export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}
