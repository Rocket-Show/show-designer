// The show file of the Ember stick: the compiled show and the setlist in a show image, cut into blocks of the UF2
// format with a family number of the stick's own. A stick takes it copied onto its drive, or block by block over its
// serial port. The same bytes as the stick's tools write (firmware/docs/show-file.md in the Ember repository).

export const emberImageMagic = [0x45, 0x4d, 0x42, 0x53]; // "EMBS"
export const emberImageMajor = 1;
export const emberImageMinor = 0;
export const emberImageHeaderSize = 48;

// where the checksum of an image is: a CRC-32 of the whole image with these four bytes taken as zero
const checksumAt = 12;

export const emberShowFamily = 0x8e5b9d31;
export const uf2BlockSize = 512;
// what a block of a show carries: every block is full, the rest of the last one is zeros
export const uf2Payload = 256;

const uf2MagicStart0 = 0x0a324655;
const uf2MagicStart1 = 0x9e5d5157;
const uf2MagicEnd = 0x0ab16f30;
const uf2FlagFamily = 0x00002000;

let crcTable: Uint32Array;

function table(): Uint32Array {
  if (!crcTable) {
    crcTable = new Uint32Array(256);

    for (let index = 0; index < 256; index++) {
      let value = index;

      for (let bit = 0; bit < 8; bit++) {
        value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
      }

      crcTable[index] = value >>> 0;
    }
  }

  return crcTable;
}

// CRC-32 as in zlib and PNG, with the four bytes at `hole` taken as zero, if one is passed
export function crc32(bytes: Uint8Array, hole = -1): number {
  const crcs = table();
  let crc = 0xffffffff;

  for (let at = 0; at < bytes.length; at++) {
    const byte = at >= hole && at < hole + 4 && hole >= 0 ? 0 : bytes[at];
    crc = crcs[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

// a firmware version as an image names the oldest firmware which plays it
export function emberFirmwareVersion(major: number, minor: number, patch: number): number {
  return ((major << 16) | (minor << 8) | patch) >>> 0;
}

// Put a show image together: the compiled show, the setlist (none: the stick steps through the scenes of the show)
// and the oldest firmware which plays them (0: any)
export function buildEmberImage(show: Uint8Array, setlist: Uint8Array = new Uint8Array(0), minFirmware = 0): Uint8Array {
  const pad = (length: number) => Math.ceil(length / 4) * 4;
  const showAt = emberImageHeaderSize;
  const setlistAt = showAt + pad(show.length);
  const length = setlistAt + pad(setlist.length);
  const image = new Uint8Array(length);
  const view = new DataView(image.buffer);

  image.set(emberImageMagic, 0);
  view.setUint16(4, emberImageMajor, true);
  view.setUint16(6, emberImageMinor, true);
  view.setUint32(8, length, true);
  view.setUint32(16, showAt, true);
  view.setUint32(20, show.length, true);

  if (setlist.length > 0) {
    view.setUint32(24, setlistAt, true);
    view.setUint32(28, setlist.length, true);
  }

  view.setUint32(32, minFirmware >>> 0, true);
  image.set(show, showAt);
  image.set(setlist, setlistAt);
  view.setUint32(checksumAt, crc32(image, checksumAt), true);
  return image;
}

// the checksum of an image: what the stick reports of the show it plays
export function emberImageChecksum(image: Uint8Array): number {
  return new DataView(image.buffer, image.byteOffset, image.byteLength).getUint32(checksumAt, true);
}

// The blocks of the show file of an image, each of 512 bytes
export function emberShowBlocks(image: Uint8Array): Uint8Array[] {
  const count = Math.max(1, Math.ceil(image.length / uf2Payload));
  const blocks: Uint8Array[] = [];

  for (let block = 0; block < count; block++) {
    const sector = new Uint8Array(uf2BlockSize);
    const view = new DataView(sector.buffer);
    const start = Math.min(block * uf2Payload, image.length);
    const end = Math.min(start + uf2Payload, image.length);

    view.setUint32(0, uf2MagicStart0, true);
    view.setUint32(4, uf2MagicStart1, true);
    view.setUint32(8, uf2FlagFamily, true);
    view.setUint32(12, block * uf2Payload, true);
    view.setUint32(16, uf2Payload, true);
    view.setUint32(20, block, true);
    view.setUint32(24, count, true);
    view.setUint32(28, emberShowFamily, true);
    sector.set(image.subarray(start, end), 32);
    view.setUint32(508, uf2MagicEnd, true);
    blocks.push(sector);
  }

  return blocks;
}

// The show file of an image: its blocks one after the other, to be copied onto the stick's drive
export function emberShowFile(image: Uint8Array): Uint8Array {
  const blocks = emberShowBlocks(image);
  const file = new Uint8Array(blocks.length * uf2BlockSize);
  blocks.forEach((block, index) => file.set(block, index * uf2BlockSize));
  return file;
}
