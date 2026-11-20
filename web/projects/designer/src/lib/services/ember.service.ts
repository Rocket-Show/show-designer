import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import {
  EmberBlockStatus,
  EmberControl,
  EmberInfo,
  EmberLabel,
  EmberMessageParser,
  emberErrorKeys,
  emberUsbFilter,
  encodeDmxFrame,
  encodeEmberControl,
  encodeEmberMessage,
  parseEmberBlockAnswer,
  parseEmberInfo,
} from '../ember/ember-protocol';
import { buildEmberImage, emberImageChecksum, emberShowBlocks, emberShowFile } from '../ember/ember-show-file';
import { UniverseConfig } from '../models/universe-config';
import { AnimationService } from './animation.service';
import { ConfigService } from './config.service';
import { DmxService } from './dmx.service';
import { EmberCompileCode, EmberCompiled, EmberEngineService } from './ember-engine.service';
import { PreviewService } from './preview.service';
import { ProjectService } from './project.service';

// Web Serial, as far as the designer uses it (not in TypeScript's DOM types yet)
interface EmberPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface EmberSerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): EmberPortInfo;
}

export interface EmberSerial extends EventTarget {
  requestPort(options?: { filters?: EmberPortInfo[] }): Promise<EmberSerialPort>;
  getPorts(): Promise<EmberSerialPort[]>;
}

export type EmberState = 'disconnected' | 'connecting' | 'connected';

// what went wrong last: a translation key with its parameters
export interface EmberProblem {
  key: string;
  params?: { [name: string]: string | number };
}

interface Pending {
  label: number;
  resolve: (data: Uint8Array) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// The Ember stick on the USB port of this computer, over Web Serial (Chrome, Edge, Firefox): what it plays and
// reports, copying the project onto it as a show, sending the preview to the lights live, and operating it like with
// its button. Only in the online designer (ConfigService.ember); browsers without Web Serial (Safari) get the show
// as a file to copy onto the stick's drive.
@Injectable({
  providedIn: 'root',
})
export class EmberService {
  // the stick sends 40 frames a second
  static readonly framePeriodMillis = 25;
  static readonly infoPeriodMillis = 1000;
  static readonly answerMillis = 2000;
  // a block may wait for a sector of the flash to be erased
  static readonly blockAnswerMillis = 5000;

  state: EmberState = 'disconnected';
  info: EmberInfo;

  // the preview goes to the lights through the stick, the values of this universe
  live = false;
  liveUniverseUuid: string;

  // while the project is copied onto the stick: the blocks taken, of how many
  sending: { taken: number; blocks: number };

  // the checksum of the project as a show for the connected stick, to tell whether the stick plays it
  projectChecksum: number;

  problem: EmberProblem;

  // anything above changed
  changed = new Subject<void>();

  private port: EmberSerialPort;
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private parser: EmberMessageParser;
  private pending: Pending;
  private queue: Promise<unknown> = Promise.resolve();
  private infoTimer: ReturnType<typeof setInterval>;
  private liveTimer: ReturnType<typeof setInterval>;
  private frameOnItsWay = false;
  private started = false;

  constructor(
    private configService: ConfigService,
    private engineService: EmberEngineService,
    private projectService: ProjectService,
    private previewService: PreviewService,
    private animationService: AnimationService,
    private dmxService: DmxService,
    private zone: NgZone
  ) {}

  private get serial(): EmberSerial {
    return typeof navigator !== 'undefined' ? ((navigator as any).serial as EmberSerial) : undefined;
  }

  // can this browser talk to the stick (Web Serial)
  get supported(): boolean {
    return !!this.serial;
  }

  private emit() {
    this.changed.next();
  }

  private isEmber(port: EmberSerialPort): boolean {
    const info = port.getInfo();
    return info.usbVendorId === emberUsbFilter.usbVendorId && info.usbProductId === emberUsbFilter.usbProductId;
  }

  // Once the designer is shown: connect to a stick this browser was allowed to use before, now and whenever one is
  // plugged in
  start() {
    if (this.started || !this.configService.ember || !this.supported) {
      return;
    }

    this.started = true;

    this.serial.addEventListener('connect', (event: Event) => {
      const port = event.target as EmberSerialPort;

      if (port && this.isEmber(port)) {
        this.open(port);
      }
    });

    this.serial.addEventListener('disconnect', (event: Event) => {
      if (event.target === this.port) {
        this.lost();
      }
    });

    this.serial
      .getPorts()
      .then((ports) => {
        const port = ports.find((candidate) => this.isEmber(candidate));

        if (port) {
          this.open(port);
        }
      })
      .catch(() => undefined);
  }

  // The user picks the stick from the ports the browser offers
  async connect() {
    this.problem = undefined;
    let port: EmberSerialPort;

    try {
      port = await this.serial.requestPort({ filters: [emberUsbFilter] });
    } catch {
      // no stick picked
      return;
    }

    await this.open(port);
  }

  private async open(port: EmberSerialPort) {
    if (this.port) {
      return;
    }

    this.state = 'connecting';
    this.emit();

    try {
      // (the baud rate means nothing to the stick)
      await port.open({ baudRate: 115200 });
    } catch {
      this.state = 'disconnected';
      this.problem = { key: 'designer.ember.problem-open' };
      this.emit();
      return;
    }

    this.port = port;
    this.parser = new EmberMessageParser();
    this.writer = port.writable.getWriter();
    this.read(port);

    try {
      await this.refreshInfo();
    } catch {
      this.problem = { key: 'designer.ember.problem-answer' };
      await this.disconnect();
      return;
    }

    this.state = 'connected';
    this.problem = undefined;
    this.zone.runOutsideAngular(() => {
      this.infoTimer = setInterval(() => this.zone.run(() => this.refreshInfo().catch(() => undefined)), EmberService.infoPeriodMillis);
    });
    this.emit();
    this.compareProject();
  }

  private async read(port: EmberSerialPort) {
    while (this.port === port && port.readable) {
      const reader = port.readable.getReader();
      this.reader = reader;

      try {
        for (;;) {
          const { value, done } = await reader.read();

          if (done) {
            break;
          }

          if (value) {
            this.received(value);
          }
        }
      } catch {
        // the stick went away, or the port was closed
        break;
      } finally {
        reader.releaseLock();
      }
    }

    if (this.port === port) {
      this.lost();
    }
  }

  // The stick went away (unplugged, or its port failed): let go of the port, so it opens again when it is back
  private lost() {
    const port = this.port;
    const writer = this.writer;

    this.closed();

    try {
      writer?.releaseLock();
    } catch {
      // released already
    }

    port?.close().catch(() => undefined);
  }

  private received(chunk: Uint8Array) {
    for (const message of this.parser.push(chunk)) {
      const pending = this.pending;

      if (pending && message.label === pending.label) {
        this.pending = undefined;
        clearTimeout(pending.timer);
        pending.resolve(message.data);
      }
    }
  }

  // Send a message and wait for the answer with its label: one at a time, as the stick answers in order
  private request(label: number, data?: Uint8Array, answerMillis = EmberService.answerMillis): Promise<Uint8Array> {
    const send = () =>
      new Promise<Uint8Array>((resolve, reject) => {
        if (!this.writer) {
          reject(new Error('The stick is not connected'));
          return;
        }

        const timer = setTimeout(() => {
          if (this.pending && this.pending.timer === timer) {
            this.pending = undefined;
          }

          reject(new Error('The stick did not answer'));
        }, answerMillis);

        this.pending = { label, resolve, reject, timer };
        this.writer.write(encodeEmberMessage(label, data)).catch((error) => {
          clearTimeout(timer);
          this.pending = undefined;
          reject(error);
        });
      });

    const answer = this.queue.then(send, send);
    this.queue = answer.catch(() => undefined);
    return answer;
  }

  async refreshInfo() {
    this.info = parseEmberInfo(await this.request(EmberLabel.info));
    this.emit();
  }

  // the port is gone: whatever was under way is over
  private closed() {
    clearInterval(this.infoTimer);
    this.stopLive();

    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error('The stick went away'));
      this.pending = undefined;
    }

    this.port = undefined;
    this.reader = undefined;
    this.writer = undefined;
    this.info = undefined;
    this.projectChecksum = undefined;
    this.sending = undefined;
    this.state = 'disconnected';
    this.emit();
  }

  async disconnect() {
    const port = this.port;
    const reader = this.reader;
    const writer = this.writer;

    this.closed();

    try {
      await reader?.cancel();
    } catch {
      // closed already
    }

    try {
      writer?.releaseLock();
    } catch {
      // released already
    }

    try {
      await port?.close();
    } catch {
      // closed already
    }
  }

  // ---- the show ----

  // The project as a show image for a stick which plays the passed feature bits (none passed: any the engine knows)
  async image(features?: number): Promise<{ image?: Uint8Array; compiled: EmberCompiled }> {
    const project = this.projectService.project;
    this.projectService.writeCompatibilityValues(project);

    const compiled = await this.engineService.compile(
      this.projectService.getSavedJson(project),
      features === undefined ? await this.engineService.features() : features
    );

    if (compiled.code !== EmberCompileCode.show) {
      return { compiled };
    }

    return { image: buildEmberImage(compiled.show), compiled };
  }

  private compileProblem(compiled: EmberCompiled): EmberProblem {
    switch (compiled.code) {
      case EmberCompileCode.unsupported:
        return { key: 'designer.ember.problem-firmware' };
      case EmberCompileCode.tooLarge:
        return { key: 'designer.ember.problem-too-large' };
      default:
        return { key: 'designer.ember.problem-project', params: { message: compiled.message } };
    }
  }

  private engineProblem(): EmberProblem {
    return { key: 'designer.ember.problem-engine' };
  }

  // Does the stick play the project as it is now: its checksum as a show for this stick
  async compareProject() {
    if (!this.info || !this.projectService.project) {
      return;
    }

    try {
      const { image } = await this.image(this.info.features);
      this.projectChecksum = image ? emberImageChecksum(image) : undefined;
    } catch {
      this.projectChecksum = undefined;
    }

    this.emit();
  }

  // does the stick play the project as it is now
  get playsProject(): boolean {
    return !!this.info && this.info.imageLength > 0 && this.projectChecksum === this.info.checksum;
  }

  // Copy the project onto the stick as its show, block by block: the stick plays it once the last one is in
  async sendShow(): Promise<boolean> {
    if (!this.info || this.sending) {
      return false;
    }

    this.problem = undefined;
    this.sending = { taken: 0, blocks: 0 };
    this.emit();

    try {
      let built: { image?: Uint8Array; compiled: EmberCompiled };

      try {
        built = await this.image(this.info.features);
      } catch {
        this.problem = this.engineProblem();
        return false;
      }

      if (!built.image) {
        this.problem = this.compileProblem(built.compiled);
        return false;
      }

      if (built.image.length > this.info.maxImageBytes) {
        this.problem = { key: emberErrorKeys[5] };
        return false;
      }

      const blocks = emberShowBlocks(built.image);
      this.sending = { taken: 0, blocks: blocks.length };
      this.emit();

      for (const block of blocks) {
        const answer = parseEmberBlockAnswer(await this.request(EmberLabel.block, block, EmberService.blockAnswerMillis));

        if (answer.status === EmberBlockStatus.refused) {
          this.problem = { key: emberErrorKeys[answer.error] || 'designer.ember.problem-answer' };
          return false;
        }

        if (answer.status !== EmberBlockStatus.taken && answer.status !== EmberBlockStatus.showComplete) {
          this.problem = { key: 'designer.ember.problem-answer' };
          return false;
        }

        // complete: the last block, or the show plays already (each of its blocks is answered so)
        if (answer.status === EmberBlockStatus.showComplete) {
          break;
        }

        this.sending = { taken: answer.taken, blocks: blocks.length };
        this.emit();
      }

      this.projectChecksum = emberImageChecksum(built.image);
      await this.refreshInfo();
      return true;
    } catch {
      this.problem = { key: 'designer.ember.problem-answer' };
      return false;
    } finally {
      this.sending = undefined;
      this.emit();
    }
  }

  // The show file of the project, for a browser without Web Serial: copied onto the stick's drive, the stick plays it
  async downloadShowFile(): Promise<boolean> {
    this.problem = undefined;
    let built: { image?: Uint8Array; compiled: EmberCompiled };

    try {
      built = await this.image(this.info?.features);
    } catch {
      this.problem = this.engineProblem();
      this.emit();
      return false;
    }

    if (!built.image) {
      this.problem = this.compileProblem(built.compiled);
      this.emit();
      return false;
    }

    const blob = new Blob([emberShowFile(built.image)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a');
    element.setAttribute('href', url);
    element.setAttribute('download', (this.projectService.project.name || 'show') + '.emb');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  }

  // ---- live ----

  // the universes of the configuration, and the ones fixtures are patched to which it doesn't name
  universes(): UniverseConfig[] {
    const universes: UniverseConfig[] = (this.configService.universes || []).slice();

    for (const fixture of this.projectService.project?.fixtures || []) {
      if (fixture.dmxUniverseUuid && !universes.some((universe) => universe.uuid === fixture.dmxUniverseUuid)) {
        universes.push({ uuid: fixture.dmxUniverseUuid, name: 'Universe ' + (universes.length + 1) });
      }
    }

    return universes;
  }

  // the universe a show sends on the stick: the one of the first fixture
  defaultUniverseUuid(): string {
    return this.projectService.project?.fixtures?.find((fixture) => fixture.dmxUniverseUuid)?.dmxUniverseUuid || this.universes()[0]?.uuid;
  }

  // Send what the preview shows to the lights, 40 times a second. When it stops, the stick holds the last frame until
  // its button is pressed.
  setLive(on: boolean) {
    if (on === this.live) {
      return;
    }

    if (!on) {
      this.stopLive();
      this.emit();
      return;
    }

    if (!this.writer) {
      return;
    }

    this.live = true;

    if (!this.liveUniverseUuid || !this.universes().some((universe) => universe.uuid === this.liveUniverseUuid)) {
      this.liveUniverseUuid = this.defaultUniverseUuid();
    }

    this.zone.runOutsideAngular(() => {
      this.liveTimer = setInterval(() => this.sendFrame(), EmberService.framePeriodMillis);
    });

    this.emit();
  }

  private stopLive() {
    clearInterval(this.liveTimer);
    this.liveTimer = undefined;
    this.live = false;
  }

  // the values of the universe as the preview shows them now
  frame(): Uint8Array {
    const timeMillis = this.animationService.timeMillis;
    const values = this.previewService.getChannelValues(timeMillis, this.previewService.getPresets(timeMillis));
    return encodeDmxFrame(this.dmxService.getUniverseValues(this.liveUniverseUuid, values));
  }

  private sendFrame() {
    // a frame still on its way: this one is left out
    if (!this.writer || !this.projectService.project || this.frameOnItsWay) {
      return;
    }

    let frame: Uint8Array;

    try {
      frame = this.frame();
    } catch {
      return;
    }

    this.frameOnItsWay = true;
    const done = () => (this.frameOnItsWay = false);
    this.writer.write(encodeEmberMessage(EmberLabel.sendDmx, frame)).then(done, done);
  }

  // ---- operating it ----

  async control(action: number, argument?: number) {
    try {
      await this.request(EmberLabel.control, encodeEmberControl(action, argument));
      await this.refreshInfo();
    } catch {
      this.problem = { key: 'designer.ember.problem-answer' };
      this.emit();
    }
  }

  next() {
    return this.control(EmberControl.next);
  }

  back() {
    return this.control(EmberControl.back);
  }

  toggleBlackout() {
    return this.control(EmberControl.blackout, 2);
  }
}
