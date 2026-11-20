import {
  EmberBlockStatus,
  EmberLabel,
  EmberMessageParser,
  encodeDmxFrame,
  encodeEmberControl,
  encodeEmberMessage,
  parseEmberBlockAnswer,
  parseEmberInfo,
} from './ember-protocol';

// The serial protocol of the Ember stick (firmware/docs/serial.md of the Ember repository)
describe('Ember protocol', () => {
  // INFO as the first stick answered it on 20 Nov 2026, playing a show for one RGB lamp
  function info(): Uint8Array {
    const data = new Uint8Array(64);
    const view = new DataView(data.buffer);
    data.set([1, 0, 1, 0], 0);
    view.setUint32(4, 1, true);
    view.setUint16(8, 1, true);
    view.setUint16(10, 0, true);
    view.setUint32(12, 0x7ff, true);
    view.setUint32(16, 65536, true);
    view.setUint32(20, 4190208, true);
    view.setUint16(24, 1, true);
    data[28] = 1;
    data[29] = 0;
    view.setUint16(30, 0x0002 | 0x0008, true);
    view.setUint32(32, 5480, true);
    view.setUint32(36, 0x009d3b0c, true);
    view.setUint16(44, 2, true);
    view.setUint16(46, 5, true);
    view.setUint16(48, 1126, true);
    view.setUint16(50, 4, true);
    view.setUint32(52, 2915, true);
    data.set([0xd2, 0xf1, 0x93, 0xab, 0xf2, 0x56, 0xad, 0xc2], 56);
    return data;
  }

  it('frames a message: start, label, length low byte first, data, end', () => {
    expect(Array.from(encodeEmberMessage(EmberLabel.info))).toEqual([0x7e, 0xd0, 0, 0, 0xe7]);
    expect(Array.from(encodeEmberMessage(EmberLabel.control, new Uint8Array([6, 2, 0])))).toEqual([0x7e, 0xd3, 3, 0, 6, 2, 0, 0xe7]);

    const block = encodeEmberMessage(EmberLabel.block, new Uint8Array(512));
    expect(block.length).toBe(517);
    expect([block[2], block[3]]).toEqual([0x00, 0x02]);
  });

  it('refuses a message longer than the stick takes', () => {
    expect(() => encodeEmberMessage(EmberLabel.block, new Uint8Array(601))).toThrow();
  });

  it('finds the messages in what arrives, in pieces of any size, after bytes which belong to none', () => {
    const parser = new EmberMessageParser();
    const first = encodeEmberMessage(EmberLabel.info, info());
    const second = encodeEmberMessage(EmberLabel.control, new Uint8Array([1]));
    const stream = new Uint8Array([0x00, 0x42, ...first, ...second]);

    const messages = [];

    for (let at = 0; at < stream.length; at += 7) {
      messages.push(...parser.push(stream.slice(at, at + 7)));
    }

    expect(messages.map((message) => message.label)).toEqual([EmberLabel.info, EmberLabel.control]);
    expect(messages[0].data.length).toBe(64);
    expect(Array.from(messages[1].data)).toEqual([1]);
  });

  it('skips a start byte without an end where the length says', () => {
    const parser = new EmberMessageParser();
    const broken = new Uint8Array([0x7e, 0xd0, 2, 0, 9, 9, 0x00]);
    const good = encodeEmberMessage(EmberLabel.control, new Uint8Array([1]));

    expect(parser.push(new Uint8Array([...broken, ...good])).map((message) => message.label)).toEqual([EmberLabel.control]);
  });

  it('takes a start byte with a length longer than any message for none', () => {
    const parser = new EmberMessageParser();
    const good = encodeEmberMessage(EmberLabel.info);

    expect(parser.push(new Uint8Array([0x7e, 0xd0, 0xff, 0xff, ...good])).map((message) => message.label)).toEqual([EmberLabel.info]);
  });

  it('refuses answers too short to be what the stick sends', () => {
    expect(() => parseEmberInfo(new Uint8Array(10))).toThrow();
    expect(() => parseEmberBlockAnswer(new Uint8Array(4))).toThrow();
  });

  it('reads what the stick reports', () => {
    const report = parseEmberInfo(info());

    expect(report.firmware).toBe('0.1.0');
    expect(report.features).toBe(0x7ff);
    expect(report.formatVersion).toBe('1.0');
    expect(report.playing).toBe(true);
    expect(report.twoFirmwareSlots).toBe(true);
    expect(report.blackout).toBe(true);
    expect(report.live).toBe(false);
    expect(report.imageLength).toBe(5480);
    expect(report.checksum).toBe(0x009d3b0c);
    expect(report.entry).toBe(2);
    expect(report.entries).toBe(5);
    expect(report.tempo).toBeCloseTo(112.6, 5);
    expect(report.serialNumber).toBe('D2F193ABF256ADC2');
  });

  it('reads the answers to blocks', () => {
    const taken = new Uint8Array(12);
    new DataView(taken.buffer).setUint32(4, 3, true);
    new DataView(taken.buffer).setUint32(8, 22, true);

    expect(parseEmberBlockAnswer(taken)).toEqual({ status: EmberBlockStatus.taken, error: 0, details: 0, taken: 3, blocks: 22 });

    const refused = new Uint8Array(12);
    refused[0] = EmberBlockStatus.refused;
    refused[1] = 4;
    new DataView(refused.buffer).setUint32(4, 70000, true);

    expect(parseEmberBlockAnswer(refused)).toEqual({ status: EmberBlockStatus.refused, error: 4, details: 70000, taken: 0, blocks: 0 });
  });

  it('writes the actions of its button and a DMX frame', () => {
    expect(Array.from(encodeEmberControl(1))).toEqual([1]);
    expect(Array.from(encodeEmberControl(4, 300))).toEqual([4, 44, 1]);

    const frame = encodeDmxFrame([255, 0, 128.4, 300, -2]);
    expect(Array.from(frame)).toEqual([0, 255, 0, 128, 255, 0]);
    expect(encodeDmxFrame(new Array(600).fill(1)).length).toBe(513);
  });
});
