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
  // the stick doesn't answer at all
  silent = false;
  // what the stick holds at most
  maxImageBytes = 4190208;

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
    if (this.silent) {
      return;
    }

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
    view.setUint32(20, this.maxImageBytes, true);
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

  announce(type: 'connect' | 'disconnect') {
    const event = new Event(type);
    Object.defineProperty(event, 'target', { value: this.stick });
    this.dispatchEvent(event);
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
  let configService: ConfigService;

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

    configService = TestBed.inject(ConfigService);
    configService.ember = true;
    service = TestBed.inject(EmberService);
  }

  beforeEach(() => {
    stick = new FakeStick();
  });

  afterEach(async () => {
    (EmberService as any).answerMillis = 2000;
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

  it('leaves the stick alone when the user picks none', async () => {
    const serial = new FakeSerial(stick, false);
    serial.requestPort = () => Promise.reject(new Error('No port selected by the user.'));
    setUp(serial);

    await service.connect();

    expect(service.state).toBe('disconnected');
    expect(service.problem).toBeUndefined();
  });

  it("says when the browser can't open the stick", async () => {
    setUp(new FakeSerial(stick, false));
    stick.open = () => Promise.reject(new Error('Failed to open serial port.'));

    await service.connect();

    expect(service.state).toBe('disconnected');
    expect(service.problem.key).toBe('designer.ember.problem-open');
  });

  it("gives up on a stick which doesn't answer", async () => {
    (EmberService as any).answerMillis = 50;
    setUp(new FakeSerial(stick, false));
    stick.silent = true;

    await service.connect();

    expect(service.state).toBe('disconnected');
    expect(service.problem.key).toBe('designer.ember.problem-answer');
  });

  it('connects to a stick plugged in later, and lets go of it when it is pulled', async () => {
    const serial = new FakeSerial(stick, false);
    setUp(serial);
    service.start();

    serial.announce('connect');
    await wait(50);
    expect(service.state).toBe('connected');

    serial.announce('disconnect');
    expect(service.state).toBe('disconnected');
  });

  it('copies nothing without a stick', async () => {
    setUp(new FakeSerial(stick, false));

    expect(await service.sendShow()).toBe(false);
    await service.compareProject();
    expect(service.projectChecksum).toBeUndefined();
    expect(service.playsProject).toBe(false);
  });

  it('tells whether the stick plays the project', async () => {
    setUp(new FakeSerial(stick, false));
    await service.connect();
    await service.compareProject();

    expect(service.playsProject).toBe(false);

    await service.sendShow();
    await service.compareProject();

    expect(service.projectChecksum).toBe(stick.checksum);
    expect(service.playsProject).toBe(true);
  });

  it("doesn't send a show larger than the stick holds", async () => {
    setUp(new FakeSerial(stick, false));
    stick.maxImageBytes = 100;
    await service.connect();

    expect(await service.sendShow()).toBe(false);

    expect(service.problem.key).toBe('designer.ember.error-5');
    expect(stick.image).toBeUndefined();
  });

  it("says the stick did not take the show when it refuses it for a reason the designer doesn't know", async () => {
    setUp(new FakeSerial(stick, false));
    await service.connect();
    stick.refuseWith = 99;

    expect(await service.sendShow()).toBe(false);

    expect(service.problem.key).toBe('designer.ember.problem-answer');
  });

  it('says why the project could not be made into a show', async () => {
    setUp(new FakeSerial(stick, false));
    await service.connect();

    compile.and.callFake(() => Promise.resolve({ code: 3, message: 'too many', features: 0 }));
    expect(await service.sendShow()).toBe(false);
    expect(service.problem.key).toBe('designer.ember.problem-too-large');

    compile.and.callFake(() => Promise.resolve({ code: 1, message: 'no fixtures', features: 0 }));
    expect(await service.sendShow()).toBe(false);
    expect(service.problem).toEqual({ key: 'designer.ember.problem-project', params: { message: 'no fixtures' } });

    compile.and.callFake(() => Promise.reject(new Error('engine.wasm: 404')));
    expect(await service.sendShow()).toBe(false);
    expect(service.problem.key).toBe('designer.ember.problem-engine');
  });

  it('gives the show as a file, for any stick', async () => {
    setUp(new FakeSerial(stick, false));
    spyOn(URL, 'createObjectURL').and.returnValue('blob:show');
    const click = spyOn(HTMLAnchorElement.prototype, 'click');

    expect(await service.downloadShowFile()).toBe(true);

    expect(compile).toHaveBeenCalledWith('{"version":11}', 0x7ff);
    const anchor = click.calls.mostRecent().object as HTMLAnchorElement;
    expect(anchor.getAttribute('download')).toBe('Gig.emb');
    expect(anchor.getAttribute('href')).toBe('blob:show');
  });

  it('gives no file when there is no show to put in it', async () => {
    setUp(new FakeSerial(stick, false));

    compile.and.callFake(() => Promise.resolve({ code: 2, message: 'feature 11', features: 0x800 }));
    expect(await service.downloadShowFile()).toBe(false);
    expect(service.problem.key).toBe('designer.ember.problem-firmware');

    compile.and.callFake(() => Promise.reject(new Error('engine.wasm: 404')));
    expect(await service.downloadShowFile()).toBe(false);
    expect(service.problem.key).toBe('designer.ember.problem-engine');
  });

  it('offers the universes of the configuration and the ones the fixtures use', () => {
    setUp(new FakeSerial(stick, false));
    configService.universes = [{ uuid: 'side', name: 'Side' }];

    expect(service.universes()).toEqual([
      { uuid: 'side', name: 'Side' },
      { uuid: 'front', name: 'Universe 2' },
    ]);
    expect(service.defaultUniverseUuid()).toBe('front');
  });

  it('goes live only with a stick, and only once', async () => {
    setUp(new FakeSerial(stick, false));

    service.setLive(true);
    expect(service.live).toBe(false);

    await service.connect();
    service.setLive(true);
    service.setLive(true);
    service.setLive(false);
    service.setLive(false);

    expect(service.live).toBe(false);
  });

  it("says when the stick doesn't take an action", async () => {
    setUp(new FakeSerial(stick, false));
    await service.connect();
    (EmberService as any).answerMillis = 50;
    stick.silent = true;

    await service.next();

    expect(service.problem.key).toBe('designer.ember.problem-answer');
  });

  it('has nothing to connect to in a browser without Web Serial', () => {
    setUp(undefined);

    expect(service.supported).toBe(false);
    service.start();
    expect(service.state).toBe('disconnected');
  });
});
