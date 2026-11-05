import { encodeBase64, PixelBitmap } from './pixel-bitmap';

// The images of the pixel effects, made into the picture Rocket Show shows them with (see PixelBitmap): an image or an
// animation (e.g. a GIF) is made small, about as large as the pixels it is shown on, its frames one after the other.
// Only these pixels are kept, not the image itself.

// how many pixels the longest side of an image is made at most, and how many frames of an animation are kept
export const PIXEL_IMAGE_SIZES = [16, 32, 64, 128];
export const DEFAULT_PIXEL_IMAGE_SIZE = 32;
export const MAX_PIXEL_IMAGE_FRAMES = 120;

interface ImageFrame {
  image: CanvasImageSource & { close?: () => void };
  width: number;
  height: number;
  // in ms
  duration: number;
}

// The frames of an image: each frame of an animation, where the browser can decode them one by one (it builds each
// frame of a GIF on the ones before), or the image alone
async function framesOf(file: Blob): Promise<ImageFrame[]> {
  const decoderClass = typeof window !== 'undefined' ? (window as any).ImageDecoder : undefined;

  if (decoderClass && file.type && (await decoderClass.isTypeSupported(file.type))) {
    const decoder = new decoderClass({ data: await file.arrayBuffer(), type: file.type });
    await decoder.tracks.ready;
    const count = Math.min(Math.max(decoder.tracks.selectedTrack?.frameCount || 1, 1), MAX_PIXEL_IMAGE_FRAMES);
    const frames: ImageFrame[] = [];

    for (let frameIndex = 0; frameIndex < count; frameIndex++) {
      const { image } = await decoder.decode({ frameIndex });
      frames.push({ image, width: image.displayWidth, height: image.displayHeight, duration: (image.duration || 0) / 1000 });
    }

    decoder.close();

    return frames;
  }

  const image = await createImageBitmap(file);

  return [{ image, width: image.width, height: image.height, duration: 0 }];
}

// The size an image is made: its longest side as many pixels as passed (an image which is smaller keeps its size)
export function pixelImageSize(width: number, height: number, longestSide: number): number[] {
  const scale = Math.min(1, longestSide / Math.max(width, height, 1));

  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

// The picture of an image or an animation, its longest side as many pixels as passed: red, green and blue for each
// pixel, on black where the image is see-through
export async function imageBitmapOf(file: Blob, longestSide: number): Promise<PixelBitmap> {
  const frames = await framesOf(file);
  const [width, height] = pixelImageSize(frames[0].width, frames[0].height, longestSide);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const encoded: string[] = [];

  for (const frame of frames) {
    context.clearRect(0, 0, width, height);
    context.drawImage(frame.image, 0, 0, width, height);
    frame.image.close?.();

    const pixels = context.getImageData(0, 0, width, height).data;
    const bytes = new Uint8Array(width * height * 3);

    for (let i = 0; i < width * height; i++) {
      const alpha = pixels[i * 4 + 3];

      for (let channel = 0; channel < 3; channel++) {
        bytes[i * 3 + channel] = Math.round((pixels[i * 4 + channel] * alpha) / 255);
      }
    }

    encoded.push(encodeBase64(bytes));
  }

  return new PixelBitmap({
    width,
    height,
    channels: 3,
    frames: encoded,
    durations: frames.length > 1 ? frames.map((frame) => frame.duration) : [],
  });
}

// how long an animation runs through all of its frames, in ms (0 for an image of one frame)
export function animationMillis(bitmap: PixelBitmap): number {
  if (bitmap.frames.length <= 1) {
    return 0;
  }

  return bitmap.frames.reduce((total, frame, index) => total + (bitmap.durations[index] > 0 ? bitmap.durations[index] : 100), 0);
}
