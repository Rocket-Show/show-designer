// The serial protocol of the Ember stick: the messages of the ENTTEC DMX USB Pro protocol (a start byte, a label, the
// length of the data and an end byte), with labels of the stick's own for what it reports, for copying shows onto it
// and for operating it. The stick's firmware specifies it (firmware/docs/serial.md in the Ember repository).

export const emberStart = 0x7e;
export const emberEnd = 0xe7;

// the most data a message may carry
export const emberDataMax = 600;

export const EmberLabel = {
  // ENTTEC: the widget's parameters, its serial number, a DMX frame
  parameters: 3,
  sendDmx: 6,
  serialNumber: 10,
  // the stick's own
  info: 0xd0,
  block: 0xd1,
  read: 0xd2,
  control: 0xd3,
  restart: 0xd5,
};

// what the stick does when it is operated like with its button and pedals (CONTROL)
export const EmberControl = {
  next: 1,
  back: 2,
  first: 3,
  entry: 4,
  song: 5,
  blackout: 6,
  tap: 7,
  trigger: 8,
};

// the argument of EmberControl.blackout
export const EmberBlackout = { off: 0, on: 1, toggle: 2 };

// what the answer to a block says (BLOCK)
export const EmberBlockStatus = {
  taken: 0,
  showComplete: 1,
  firmwareComplete: 2,
  notForTheStick: 3,
  refused: 4,
};

// The USB IDs of the stick while it has the test IDs of pid.codes: what the browser's list of ports offers
export const emberUsbFilter = { usbVendorId: 0x1209, usbProductId: 0x0001 };

export interface EmberMessage {
  label: number;
  data: Uint8Array;
}

export function encodeEmberMessage(label: number, data: Uint8Array = new Uint8Array(0)): Uint8Array {
  if (data.length > emberDataMax) {
    throw new Error('A message of the stick carries ' + emberDataMax + ' bytes of data at most, not ' + data.length);
  }

  const message = new Uint8Array(data.length + 5);
  message[0] = emberStart;
  message[1] = label;
  message[2] = data.length & 0xff;
  message[3] = data.length >> 8;
  message.set(data, 4);
  message[message.length - 1] = emberEnd;
  return message;
}

// Takes the bytes from the stick as they arrive, in pieces of any size, and gives the messages complete in them. Bytes
// before a start byte, and a message without its end byte, are dropped.
export class EmberMessageParser {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): EmberMessage[] {
    const joined = new Uint8Array(this.buffer.length + chunk.length);
    joined.set(this.buffer);
    joined.set(chunk, this.buffer.length);

    const messages: EmberMessage[] = [];
    let at = 0;

    while (at < joined.length) {
      if (joined[at] !== emberStart) {
        at++;
        continue;
      }

      if (joined.length - at < 4) {
        break;
      }

      const length = joined[at + 2] | (joined[at + 3] << 8);

      if (length > emberDataMax) {
        // not a start after all
        at++;
        continue;
      }

      if (joined.length - at < length + 5) {
        break;
      }

      if (joined[at + 4 + length] !== emberEnd) {
        at++;
        continue;
      }

      messages.push({ label: joined[at + 1], data: joined.slice(at + 4, at + 4 + length) });
      at += length + 5;
    }

    this.buffer = joined.slice(at);
    return messages;
  }
}

// What the stick says about itself and what it plays (INFO)
export interface EmberInfo {
  commandsVersion: number;
  firmware: string;
  firmwareVersion: { major: number; minor: number; patch: number };
  behaviourVersion: number;
  formatVersion: string;
  // the feature bits of the compiled show format the stick can play: what the designer compiles for
  features: number;
  memoryWords: number;
  maxImageBytes: number;
  imageVersion: string;
  playing: boolean;
  // what is wrong (0: nothing), see emberErrorKeys
  error: number;
  errorDetails: number;
  noDrive: boolean;
  twoFirmwareSlots: boolean;
  live: boolean;
  blackout: boolean;
  arriving: boolean;
  footswitch: boolean;
  // the show image playing: its length (0: none) and its checksum
  imageLength: number;
  checksum: number;
  // the entry of the setlist it is at, from 0, and the number of entries
  entry: number;
  entries: number;
  // the tempo the stick set, in beats per minute (0: the one the show was written at)
  tempo: number;
  universes: number;
  longestFrameMicros: number;
  serialNumber: string;
}

export const emberInfoSize = 64;

export function parseEmberInfo(data: Uint8Array): EmberInfo {
  if (data.length < emberInfoSize) {
    throw new Error('The stick answered INFO with ' + data.length + ' bytes, not ' + emberInfoSize);
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const flags = view.getUint16(30, true);
  const firmwareVersion = { major: data[1], minor: data[2], patch: data[3] };
  const serialNumber = Array.from(data.slice(56, 64))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  return {
    commandsVersion: data[0],
    firmware: firmwareVersion.major + '.' + firmwareVersion.minor + '.' + firmwareVersion.patch,
    firmwareVersion,
    behaviourVersion: view.getUint32(4, true),
    formatVersion: view.getUint16(8, true) + '.' + view.getUint16(10, true),
    features: view.getUint32(12, true),
    memoryWords: view.getUint32(16, true),
    maxImageBytes: view.getUint32(20, true),
    imageVersion: view.getUint16(24, true) + '.' + view.getUint16(26, true),
    playing: data[28] !== 0,
    error: data[29],
    noDrive: (flags & 0x01) !== 0,
    twoFirmwareSlots: (flags & 0x02) !== 0,
    live: (flags & 0x04) !== 0,
    blackout: (flags & 0x08) !== 0,
    arriving: (flags & 0x10) !== 0,
    footswitch: (flags & 0x20) !== 0,
    imageLength: view.getUint32(32, true),
    checksum: view.getUint32(36, true),
    errorDetails: view.getUint32(40, true),
    entry: view.getUint16(44, true),
    entries: view.getUint16(46, true),
    tempo: view.getUint16(48, true) / 10,
    universes: view.getUint16(50, true),
    longestFrameMicros: view.getUint32(52, true),
    serialNumber,
  };
}

// The translation keys of the stick's errors, by their number (INFO, BLOCK): the numbers the display footswitch shows
// after "Err"
export const emberErrorKeys: { [error: number]: string } = {
  1: 'designer.ember.error-1',
  2: 'designer.ember.error-2',
  3: 'designer.ember.error-3',
  4: 'designer.ember.error-4',
  5: 'designer.ember.error-5',
  6: 'designer.ember.error-6',
  7: 'designer.ember.error-7',
  8: 'designer.ember.error-8',
};

export interface EmberBlockAnswer {
  status: number;
  // for a refusal: the number of the error and its details
  error: number;
  details: number;
  // the blocks of the file taken so far, and the blocks of the file
  taken: number;
  blocks: number;
}

export function parseEmberBlockAnswer(data: Uint8Array): EmberBlockAnswer {
  if (data.length < 12) {
    throw new Error('The stick answered a block with ' + data.length + ' bytes, not 12');
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const status = data[0];

  return {
    status,
    error: status === EmberBlockStatus.refused ? data[1] : 0,
    details: status === EmberBlockStatus.refused ? view.getUint32(4, true) : 0,
    taken: status === EmberBlockStatus.refused ? 0 : view.getUint32(4, true),
    blocks: view.getUint32(8, true),
  };
}

export function encodeEmberControl(action: number, argument?: number): Uint8Array {
  if (argument === undefined) {
    return new Uint8Array([action]);
  }

  return new Uint8Array([action, argument & 0xff, (argument >> 8) & 0xff]);
}

// A DMX frame for the stick to send (ENTTEC label 6): the start code 0 and the values of the channels from 1 on
export function encodeDmxFrame(values: ArrayLike<number>): Uint8Array {
  const count = Math.min(values.length, 512);
  const frame = new Uint8Array(count + 1);

  for (let channel = 0; channel < count; channel++) {
    frame[channel + 1] = Math.max(0, Math.min(255, Math.round(values[channel] || 0)));
  }

  return frame;
}
