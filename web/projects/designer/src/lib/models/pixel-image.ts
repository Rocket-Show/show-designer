import { encodeBase64, PixelBitmap } from './pixel-bitmap';

// The images of the pixel effects, made into the picture Rocket Show shows them with (see PixelBitmap): an image or an
// animation (e.g. a GIF) is made small, as large as the pixels it is shown on, its frames one after the other. Only
// these pixels are kept, not the image itself.

// how many pixels the longest side of an image is made at most, and how many frames of an animation are kept. By
// default, an image is made as large as the pixels it is shown on (see fittedPixelImageSize).
export const PIXEL_IMAGE_SIZES = [16, 32, 64, 128];
export const MAX_PIXEL_IMAGE_SIZE = 128;
export const DEFAULT_PIXEL_IMAGE_SIZE = 32;
export const MAX_PIXEL_IMAGE_FRAMES = 120;

// how many pixels of the image at most are averaged into one on each side (finer images are drawn smaller first)
const AVERAGED_PIXELS = 8;

// a picture an image is shown on: the pixels of a fixture or of the stage (see PixelContext)
export interface PixelPicture {
  columns: number;
  rows: number;
  aspectX: number;
  aspectY: number;
}

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

// The size an image is made to be shown on pictures: a pixel of it for each pixel it lights where it covers the whole
// picture (see imagePosition), so each pixel shows its own part of it, however it is fitted in. The largest one of the
// pictures counts, and an image is made no larger than it is, nor than the largest size. Without a picture: the
// default size.
export function fittedPixelImageSize(width: number, height: number, pictures: PixelPicture[]): number[] {
  if (pictures.length === 0) {
    return pixelImageSize(width, height, DEFAULT_PIXEL_IMAGE_SIZE);
  }

  const imageRatio = width / Math.max(height, 1);
  let scale = 0;

  for (const picture of pictures) {
    const pictureRatio = picture.aspectY > 0 ? picture.aspectX / picture.aspectY : picture.columns;
    const covered =
      imageRatio > pictureRatio
        ? [(picture.columns * imageRatio) / pictureRatio, picture.rows]
        : [picture.columns, (picture.rows * pictureRatio) / imageRatio];

    scale = Math.max(scale, covered[0] / Math.max(width, 1), covered[1] / Math.max(height, 1));
  }

  scale = Math.min(scale, 1, MAX_PIXEL_IMAGE_SIZE / Math.max(width, height, 1));

  return [Math.max(1, Math.ceil(width * scale - 1e-9)), Math.max(1, Math.ceil(height * scale - 1e-9))];
}

// How an image is made smaller: drawn up to a few times as large as its pixels by the browser, then each of its
// pixels the average of its part of that, so a pixel shows all of its part of the image and not just one spot of it
// (a thin line stays there). Red, green and blue for each pixel, on black where the image is see-through.
export function averagedPixels(drawn: Uint8ClampedArray, width: number, height: number, factor: number): Uint8Array {
  const bytes = new Uint8Array(width * height * 3);
  const drawnWidth = width * factor;
  const count = factor * factor;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sums = [0, 0, 0];

      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * drawnWidth + x * factor + dx) * 4;
          const alpha = drawn[i + 3] / 255;

          sums[0] += drawn[i] * alpha;
          sums[1] += drawn[i + 1] * alpha;
          sums[2] += drawn[i + 2] * alpha;
        }
      }

      for (let channel = 0; channel < 3; channel++) {
        bytes[(y * width + x) * 3 + channel] = Math.round(sums[channel] / count);
      }
    }
  }

  return bytes;
}

// The picture of an image or an animation, as large as the passed function makes it (see pixelImageSize and
// fittedPixelImageSize)
export async function imageBitmapOf(file: Blob, sizeOf: (width: number, height: number) => number[]): Promise<PixelBitmap> {
  const frames = await framesOf(file);
  const [width, height] = sizeOf(frames[0].width, frames[0].height);
  const factor = Math.max(1, Math.min(AVERAGED_PIXELS, Math.floor(Math.min(frames[0].width / width, frames[0].height / height))));
  const canvas = document.createElement('canvas');
  canvas.width = width * factor;
  canvas.height = height * factor;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const encoded: string[] = [];

  for (const frame of frames) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(frame.image, 0, 0, canvas.width, canvas.height);
    frame.image.close?.();

    encoded.push(encodeBase64(averagedPixels(context.getImageData(0, 0, canvas.width, canvas.height).data, width, height, factor)));
  }

  return new PixelBitmap({
    width,
    height,
    channels: 3,
    frames: encoded,
    durations: frames.length > 1 ? frames.map((frame) => frame.duration) : [],
  });
}

// how many bytes the pixels of an image take in the project (as they are saved, in base 64)
export function pixelImageBytes(bitmap: PixelBitmap): number {
  return bitmap.frames.reduce((total, frame) => total + frame.length, 0);
}

// how long an animation runs through all of its frames, in ms (0 for an image of one frame)
export function animationMillis(bitmap: PixelBitmap): number {
  if (bitmap.frames.length <= 1) {
    return 0;
  }

  return bitmap.frames.reduce((total, frame, index) => total + (bitmap.durations[index] > 0 ? bitmap.durations[index] : 100), 0);
}
