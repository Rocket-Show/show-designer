import { TestBed } from '@angular/core/testing';
import { EmberLabel, EmberMessageParser, encodeEmberMessage } from '../ember/ember-protocol';
import { buildEmberImage, emberImageChecksum, uf2Payload } from '../ember/ember-show-file';
import { AnimationService } from './animation.service';
import { ConfigService } from './config.service';
import { DmxService } from './dmx.service';
import { EmberEngineService } from './ember-engine.service';
import { EmberSerialPort, EmberService } from './ember.service';
import { PreviewService } from './preview.service';
import { ProjectService } from './project.service';

// A stick on a serial port, answering as its firmware does (firmware/docs/serial.md of the Ember repository)
class FakeStick extends EventTarget implements EmberSerialPort {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;

  frames: Uint8Array[] = [];
  // the image put together from the blocks taken
  image: Uint8Array;
  checksum = 0;
  imageLength = 0;
  blackout = false;
  // the error a show is refused with on its last block (0: none)
  refuseWith = 0;

  private controller: ReadableStreamDefaultController<Uint8Array>;
  private parser = new EmberMessageParser();

  constructor() {
    super();
    this.readable = new ReadableStream({ start: (controller) => (this.controller = controller) });
    this.writable = new WritableStream({ write: (chunk) => this.received(chunk) });
  }

  getInfo() {
    return { usbVendorId: 0x1209, usbProductId: 0x0001 };
  }

  async open() {}

  async close() {}

  unplug() {
    this.controller.error(new Error('The device has been lost'));
  }

  private answer(label: number, data: Uint8Array) {
    // in two pieces, as USB may deliver it
    const message = encodeEmberMessage(label, data);
    this.controller.enqueue(message.slice(0, 3));
    this.controller.enqueue(message.slice(3));
  }

  private received(chunk: Uint8Array) {
    for (const message of this.parser.push(chunk)) {
      switch (message.label) {
        case EmberLabel.info:
          this.answer(EmberLabel.info, this.info());
          break;
        case EmberLabel.block:
          this.answer(EmberLabel.block, this.block(message.data));
          break;
        case EmberLabel.control:
          if (message.data[0] === 6) {
            this.blackout = !this.blackout;
          }

          this.answer(EmberLabel.control, new Uint8Array([1]));
          break;
        case EmberLabel.sendDmx:
          this.frames.push(message.data);
          break;
      }
    }
  }

  private info(): Uint8Array {
    const data = new Uint8Array(64);
    const view = new DataView(data.buffer);
    data.set([1, 0, 1, 0], 0);
    view.setUint32(12, 0x7ff, true);
    view.setUint32(20, 4190208, true);
    data[28] = this.imageLength > 0 ? 1 : 0;
    data[29] = this.imageLength > 0 ? 0 : 1;
    view.setUint16(30, 0x0002 | (this.blackout ? 0x0008 : 0), true);
    view.setUint32(32, this.imageLength, true);
    view.setUint32(36, this.checksum, true);
    view.setUint16(46, this.imageLength > 0 ? 5 : 0, true);
    return data;
  }

  private block(sector: Uint8Array): Uint8Array {
    const view = new DataView(sector.buffer, sector.byteOffset, sector.byteLength);
    const target = view.getUint32(12, true);
    const number = view.getUint32(20, true);
    const blocks = view.getUint32(24, true);
    const answer = new Uint8Array(12);
    const answerView = new DataView(answer.buffer);

    if (number === 0) {
      this.image = new Uint8Array(blocks * uf2Payload);
    }

    this.image.set(sector.slice(32, 32 + uf2Payload), target);
    answerView.setUint32(8, blocks, true);

    if (number < blocks - 1) {
      answerView.setUint32(4, number + 1, true);
      return answer;
    }

    if (this.refuseWith) {
      answer[0] = 4;
      answer[1] = this.refuseWith;
      return answer;
    }

    const length = new DataView(this.image.buffer).getUint32(8, true);
    this.image = this.image.slice(0, length);
    this.imageLength = length;
    this.checksum = emberImageChecksum(this.image);
    answer[0] = 1;
    return answer;
  }
}

class FakeSerial extends EventTarget {
  constructor(public stick: FakeStick, public granted: boolean) {
    super();
  }

  async requestPort() {
    return this.stick;
  }

  async getPorts() {
    return this.granted ? [this.stick] : [];
  }
}

function wait(millis: number) {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

describe('EmberService', () => {
  const show = new Uint8Array(700).map((_, index) => index % 251);
  let stick: FakeStick;
  let service: EmberService;
  let compile: jasmine.Spy;

  function setUp(serial: FakeSerial | undefined) {
    Object.defineProperty(navigator, 'serial', { value: serial, configurable: true });

    compile = jasmine.createSpy('compile').and.callFake(() => Promise.resolve({ code: 0, show, message: '', features: 0x200 }));

    TestBed.configureTestingModule({
      providers: [
        { provide: EmberEngineService, useValue: { compile, features: () => Promise.resolve(0x7ff) } },
        {
          provide: ProjectService,
          useValue: {
            project: { name: 'Gig', fixtures: [{ dmxUniverseUuid: 'front' }], presets: [] },
            writeCompatibilityValues: () => undefined,
            getSavedJson: () => '{"version":11}',
          },
        },
        { provide: PreviewService, useValue: { getPresets: () => [], getChannelValues: () => new Map() } },
        { provide: AnimationService, useValue: { timeMillis: 0 } },
        { provide: DmxService, useValue: { getUniverseValues: () => [255, 0, 128] } },
      ],
    });

    TestBed.inject(ConfigService).ember = true;
    service = TestBed.inject(EmberService);
  }

  beforeEach(() => {
    stick = new FakeStick();
  });

  afterEach(async () => {
    await service?.disconnect();
    delete (navigator as any).serial;
  });

  it('connects to the stick the user picks and reads what it reports', async () => {
    setUp(new FakeSerial(stick, false));

    await service.connect();

    expect(service.state).toBe('connected');
    expect(service.info.firmware).toBe('0.1.0');
    expect(service.info.error).toBe(1);
  });

  it('connects by itself to a stick this browser may use already', async () => {
    setUp(new FakeSerial(stick, true));

    service.start();
    await wait(50);

    expect(service.state).toBe('connected');
  });

  it('copies the project onto the stick as its show, compiled for what the stick plays', async () => {
    setUp(new FakeSerial(stick, false));
    await service.connect();

    expect(await service.sendShow()).toBe(true);

    expect(compile).toHaveBeenCalledWith('{"version":11}', 0x7ff);
    expect(Array.from(stick.image)).toEqual(Array.from(buildEmberImage(show)));
    expect(service.info.imageLength).toBe(stick.imageLength);
    expect(service.playsProject).toBe(true);
    expect(service.sending).toBeUndefined();
  });

  it('says why the stick refused the show', async () => {
    setUp(new FakeSerial(stick, false));
    await service.connect();
    stick.refuseWith = 4;

    expect(await service.sendShow()).toBe(false);

    expect(service.problem.key).toBe('designer.ember.error-4');
  });

  it('says when the show needs a newer firmware', async () => {
    setUp(new FakeSerial(stick, false));
    await service.connect();
    compile.and.callFake(() => Promise.resolve({ code: 2, message: 'missing', features: 0x800 }));

    expect(await service.sendShow()).toBe(false);

    expect(service.problem.key).toBe('designer.ember.problem-firmware');
  });

  it('sends the preview to the lights while live is on, and stops', async () => {
    setUp(new FakeSerial(stick, false));
    await service.connect();

    service.setLive(true);
    await wait(120);
    service.setLive(false);
    const sent = stick.frames.length;
    await wait(60);

    expect(sent).toBeGreaterThanOrEqual(2);
    expect(stick.frames.length).toBe(sent);
    expect(Array.from(stick.frames[0])).toEqual([0, 255, 0, 128]);
    expect(service.liveUniverseUuid).toBe('front');
  });

  it('operates the stick like its button', async () => {
    setUp(new FakeSerial(stick, false));
    await service.connect();

    await service.toggleBlackout();

    expect(service.info.blackout).toBe(true);
  });

  it('lets go of the stick when it is unplugged', async () => {
    setUp(new FakeSerial(stick, false));
    await service.connect();
    service.setLive(true);

    stick.unplug();
    await wait(20);

    expect(service.state).toBe('disconnected');
    expect(service.live).toBe(false);
    expect(service.info).toBeUndefined();
  });

  it('has nothing to connect to in a browser without Web Serial', () => {
    setUp(undefined);

    expect(service.supported).toBe(false);
    service.start();
    expect(service.state).toBe('disconnected');
  });
});
