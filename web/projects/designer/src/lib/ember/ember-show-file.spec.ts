import {
  buildEmberImage,
  crc32,
  emberFirmwareVersion,
  emberImageChecksum,
  emberShowBlocks,
  emberShowFamily,
  emberShowFile,
} from './ember-show-file';

// The show file of the Ember stick. The same functions made byte for byte the files the stick's own tools write, for
// two shows the first stick played (checked with engine.wasm in Node on 20 Nov 2026); these cases keep them so.
describe('Ember show file', () => {
  const show = new Uint8Array([1, 2, 3, 4, 5]);

  function u32(bytes: Uint8Array, at: number): number {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, true);
  }

  it('checks with the CRC-32 of zlib', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    // with a hole: the same as with zeros there
    expect(crc32(new Uint8Array([9, 9, 9, 9, 7]), 0)).toBe(crc32(new Uint8Array([0, 0, 0, 0, 7])));
  });

  it('puts the show and the setlist behind a header, each starting on four bytes', () => {
    const setlist = new Uint8Array([7, 7, 7]);
    const image = buildEmberImage(show, setlist, emberFirmwareVersion(0, 1, 0));

    expect(Array.from(image.slice(0, 4))).toEqual([0x45, 0x4d, 0x42, 0x53]);
    expect(image.length).toBe(48 + 8 + 4);
    expect(u32(image, 8)).toBe(image.length);
    expect([u32(image, 16), u32(image, 20)]).toEqual([48, 5]);
    expect([u32(image, 24), u32(image, 28)]).toEqual([56, 3]);
    expect(u32(image, 32)).toBe(0x000100);
    expect(Array.from(image.slice(48, 53))).toEqual([1, 2, 3, 4, 5]);
    expect(Array.from(image.slice(56, 59))).toEqual([7, 7, 7]);
    expect(emberImageChecksum(image)).toBe(crc32(image, 12));
  });

  it('leaves the setlist out when there is none: the stick steps through the scenes', () => {
    const image = buildEmberImage(show);

    expect(image.length).toBe(56);
    expect([u32(image, 24), u32(image, 28)]).toEqual([0, 0]);
  });

  it('cuts the image into full blocks of 256 bytes with the family of the stick', () => {
    const image = buildEmberImage(new Uint8Array(600).fill(3));
    const blocks = emberShowBlocks(image);

    expect(blocks.length).toBe(Math.ceil(image.length / 256));

    blocks.forEach((block, index) => {
      expect(block.length).toBe(512);
      expect(u32(block, 0)).toBe(0x0a324655);
      expect(u32(block, 4)).toBe(0x9e5d5157);
      expect(u32(block, 8)).toBe(0x2000);
      expect(u32(block, 12)).toBe(index * 256);
      expect(u32(block, 16)).toBe(256);
      expect(u32(block, 20)).toBe(index);
      expect(u32(block, 24)).toBe(blocks.length);
      expect(u32(block, 28)).toBe(emberShowFamily);
      expect(u32(block, 508)).toBe(0x0ab16f30);
    });

    // the rest of the last block is zeros
    const last = blocks[blocks.length - 1];
    const used = image.length - (blocks.length - 1) * 256;
    expect(last.slice(32 + used, 32 + 256).every((byte) => byte === 0)).toBe(true);

    const file = emberShowFile(image);
    expect(file.length).toBe(blocks.length * 512);
    expect(Array.from(file.slice(512, 1024))).toEqual(Array.from(blocks[1]));
  });
});
