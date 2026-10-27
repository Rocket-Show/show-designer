import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { CachedFixture } from '../models/cached-fixture';
import { CachedFixtureCapability } from '../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../models/cached-fixture-channel';
import { Color } from '../models/color';
import { Fixture } from '../models/fixture';
import { FixtureCapability, FixtureCapabilityColor, FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureChannel } from '../models/fixture-channel';
import { FixtureMode } from '../models/fixture-mode';
import { FixtureProfile } from '../models/fixture-profile';
import { FixtureWheel } from '../models/fixture-wheel';
import { FixtureWheelSlot, FixtureWheelSlotType } from '../models/fixture-wheel-slot';
import { ProjectService } from './project.service';
import { UuidService } from './uuid.service';
import { CachedFixturePixel } from '../models/cached-fixture-pixel';
import { FixturePixelGroupResolveService } from './fixture-pixel-group-resolve.service';

@Injectable({
  providedIn: 'root',
})
export class FixtureService {
  cachedFixtures: CachedFixture[] = [];

  // The uuid lookups below are called from templates and therefore run for every fixture on
  // every change detection cycle, which a slider being dragged triggers with each mouse move.
  // Walking the whole project each time makes that quadratic, so keep an index instead.
  // A list is only ever exchanged as a whole or grown/shrunk, never modified in place, so the
  // list itself together with its length tells us whether the index is still valid.
  private fixtureIndex: { list: Fixture[]; length: number; byUuid: Map<string, Fixture> };
  private profileIndex: { list: FixtureProfile[]; length: number; byUuid: Map<string, FixtureProfile> };
  private cachedFixtureIndex: { list: CachedFixture[]; length: number; byUuid: Map<string, CachedFixture[]> };

  // is the side-tab settings currently selected?
  settingsSelection = false;

  selectedSettingsFixtures: Fixture[] = [];

  constructor(
    private http: HttpClient,
    private projectService: ProjectService,
    private translateService: TranslateService,
    private toastrService: ToastrService,
    private uuidService: UuidService,
    private fixturePixelGroupResolveService: FixturePixelGroupResolveService
  ) {}

  getFixtureByUuid(uuid: string): Fixture {
    const fixtures = this.projectService.project.fixtures;

    if (!this.fixtureIndex || this.fixtureIndex.list !== fixtures || this.fixtureIndex.length !== fixtures.length) {
      const byUuid = new Map<string, Fixture>();

      for (const fixture of fixtures) {
        if (!byUuid.has(fixture.uuid)) {
          byUuid.set(fixture.uuid, fixture);
        }
      }

      this.fixtureIndex = { list: fixtures, length: fixtures.length, byUuid };
    }

    return this.fixtureIndex.byUuid.get(uuid);
  }

  private fixtureUuidAndPixelKeyEquals(fixtureUuid1: string, fixtureUuid2: string, pixelKey1: string, pixelKey2: string): boolean {
    return fixtureUuid1 === fixtureUuid2 && ((pixelKey1 == null && pixelKey2 == null) || pixelKey1 === pixelKey2);
  }

  getCachedFixtureByUuid(uuid: string, pixelKey: string): CachedFixture {
    // only the cached fixtures of this uuid can match, which are the fixture itself and its pixels
    const fixtures = this.getCachedFixturesByUuid(uuid);

    for (const fixture of fixtures) {
      if (this.fixtureUuidAndPixelKeyEquals(fixture.fixture.uuid, uuid, fixture.pixel?.key, pixelKey)) {
        return fixture;
      }
    }

    // not yet found -> try searching the fixture without pixelKey for the general channels
    if (pixelKey) {
      return undefined;
    }

    for (const fixture of fixtures) {
      if (!fixture.pixel) {
        return fixture;
      }
    }
  }

  private getCachedFixturesByUuid(uuid: string): CachedFixture[] {
    if (
      !this.cachedFixtureIndex ||
      this.cachedFixtureIndex.list !== this.cachedFixtures ||
      this.cachedFixtureIndex.length !== this.cachedFixtures.length
    ) {
      const byUuid = new Map<string, CachedFixture[]>();

      for (const fixture of this.cachedFixtures) {
        const fixturesOfUuid = byUuid.get(fixture.fixture.uuid);

        if (fixturesOfUuid) {
          fixturesOfUuid.push(fixture);
        } else {
          byUuid.set(fixture.fixture.uuid, [fixture]);
        }
      }

      this.cachedFixtureIndex = { list: this.cachedFixtures, length: this.cachedFixtures.length, byUuid };
    }

    return this.cachedFixtureIndex.byUuid.get(uuid) || [];
  }

  // Get all profiles to search for (only metadata)
  getSearchProfiles(): Observable<FixtureProfile[]> {
    return this.http.get('fixtures').pipe(
      map((response: object[]) => {
        const searchProfiles: FixtureProfile[] = [];

        for (const profile of response) {
          searchProfiles.push(new FixtureProfile(profile));
        }

        return searchProfiles;
      })
    );
  }

  getProfileByUuid(uuid: string): FixtureProfile {
    const profiles = this.projectService.project.fixtureProfiles;

    if (!this.profileIndex || this.profileIndex.list !== profiles || this.profileIndex.length !== profiles.length) {
      const byUuid = new Map<string, FixtureProfile>();

      for (const profile of profiles) {
        if (!byUuid.has(profile.uuid)) {
          byUuid.set(profile.uuid, profile);
        }
      }

      this.profileIndex = { list: profiles, length: profiles.length, byUuid };
    }

    return this.profileIndex.byUuid.get(uuid);
  }

  loadProfileByUuid(uuid: string): Observable<void> {
    const loadedProfile = this.getProfileByUuid(uuid);

    if (loadedProfile) {
      // This profile is already loaded
      return of(undefined);
    }

    // Load the metadata and the profile
    return forkJoin([this.http.get('fixtures?uuid=' + encodeURI(uuid)), this.http.get('fixture?uuid=' + encodeURI(uuid))]).pipe(
      map((result) => {
        const mergedData = { ...result[0][0], ...result[1] };
        const fixtureProfile = new FixtureProfile(mergedData);
        this.projectService.project.fixtureProfiles.push(fixtureProfile);
      })
    );
  }

  getRotationAngleDeg(value: string): number {
    // convert a rotation angle value into degrees
    if (value.endsWith('deg')) {
      return Number.parseInt(value.replace('deg', ''), 10);
    } else if (value.endsWith('%')) {
      const perc = Number.parseInt(value.replace('%', ''), 10);
      return (perc / 100) * 360;
    }

    return undefined;
  }

  getWheelSlotColors(wheel: FixtureWheel, slotNumber: number): string[] {
    let colors: string[] = [];
    const wheelSlots = this.getWheelSlots(wheel, slotNumber);

    for (const slot of wheelSlots) {
      if (slot.colors && slot.colors.length > 0) {
        colors = colors.concat(slot.colors);
      }
    }

    return colors;
  }

  getMixedWheelSlotColor(wheel: FixtureWheel, slotNumber: number): Color {
    const colors = this.getWheelSlotColors(wheel, slotNumber);
    const colorsRgb: Color[] = [];

    if (colors.length === 0) {
      return undefined;
    }

    for (const color of colors) {
      colorsRgb.push(this.hexToRgb(color));
    }

    return this.mixColors(colorsRgb);
  }

  private componentToHex(c: number): any {
    const hex = c.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }

  rgbToHex(r: number, g: number, b: number): string {
    return '#' + this.componentToHex(r) + this.componentToHex(g) + this.componentToHex(b);
  }

  hexToRgb(hex: string): Color {
    // expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => {
      return r + r + g + g + b + b;
    });

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? new Color(parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)) : null;
  }

  mixColors(colors: Color[]): Color {
    // mix an array of rgb-colors containing r, g, b values to a new color
    let r = 0;
    let g = 0;
    let b = 0;

    for (const color of colors) {
      r += color.red;
      g += color.green;
      b += color.blue;
    }

    r /= colors.length;
    g /= colors.length;
    b /= colors.length;

    return new Color(r, g, b);
  }

  wheelHasSlotType(wheel: FixtureWheel, slotType: FixtureWheelSlotType): boolean {
    for (const slot of wheel.slots) {
      if (slot.type === slotType) {
        return true;
      }
    }

    return false;
  }

  getWheelByName(profile: FixtureProfile, wheelName: string): FixtureWheel {
    for (const property in profile.wheels) {
      if (property === wheelName) {
        return profile.wheels[property];
      }
    }

    // wheel not found
    return undefined;
  }

  // the slot of a wheel by its number, counted from 1 and around the wheel like in the fixture
  // library (e.g. 9 is the first slot of a wheel with 8 slots, 0 the last)
  private getWheelSlot(wheel: FixtureWheel, slotNumber: number): FixtureWheelSlot {
    const slotCount = wheel.slots.length;
    return wheel.slots[(((slotNumber - 1) % slotCount) + slotCount) % slotCount];
  }

  private getWheelSlots(wheel: FixtureWheel, slotNumber: number): FixtureWheelSlot[] {
    // return one slot or two slots, if they are split (e.g. slot number 2.5 returns the slots 2 and 3)
    const slots: FixtureWheelSlot[] = [];

    if (!wheel || !wheel.slots || wheel.slots.length === 0) {
      return slots;
    }

    slots.push(this.getWheelSlot(wheel, Math.floor(slotNumber)));

    if (slotNumber !== Math.floor(slotNumber)) {
      slots.push(this.getWheelSlot(wheel, Math.ceil(slotNumber)));
    }

    return slots;
  }

  getModeByFixture(profile: FixtureProfile, fixture: Fixture): FixtureMode {
    for (const mode of profile.modes) {
      if (mode.shortName) {
        if (mode.shortName === fixture.modeShortName) {
          return mode;
        }
      } else {
        if (mode.name === fixture.modeShortName) {
          return mode;
        }
      }
    }
  }

  private getFixtureCapability(capability: FixtureCapability, channelName: string, profile: FixtureProfile): CachedFixtureCapability {
    const cachedFixtureCapability = new CachedFixtureCapability();
    cachedFixtureCapability.capability = capability;
    if (capability.slotNumber != null) {
      // there is a wheel connected to this capability
      if (typeof capability.wheel === 'string') {
        cachedFixtureCapability.wheelName = capability.wheel as string;
      } else if (Array.isArray(capability.wheel)) {
        cachedFixtureCapability.wheelName = capability.wheel[0];
      } else {
        cachedFixtureCapability.wheelName = channelName;
      }
      cachedFixtureCapability.wheel = this.getWheelByName(profile, cachedFixtureCapability.wheelName);
      cachedFixtureCapability.wheelSlots = this.getWheelSlots(cachedFixtureCapability.wheel, capability.slotNumber);
      cachedFixtureCapability.wheelIsColor = this.wheelHasSlotType(cachedFixtureCapability.wheel, FixtureWheelSlotType.Color);
    }
    if (cachedFixtureCapability.capability.dmxRange && cachedFixtureCapability.capability.dmxRange.length === 2) {
      cachedFixtureCapability.centerValue = Math.floor(
        (cachedFixtureCapability.capability.dmxRange[0] + cachedFixtureCapability.capability.dmxRange[1]) / 2
      );
    }
    return cachedFixtureCapability;
  }

  private getCapabilitiesByChannel(
    fixtureChannel: FixtureChannel,
    channelName: string,
    profile: FixtureProfile
  ): CachedFixtureCapability[] {
    const capabilites: CachedFixtureCapability[] = [];

    if (fixtureChannel.capability) {
      capabilites.push(this.getFixtureCapability(fixtureChannel.capability, channelName, profile));
    } else if (fixtureChannel.capabilities) {
      for (const capability of fixtureChannel.capabilities) {
        capabilites.push(this.getFixtureCapability(capability, channelName, profile));
      }
    }

    return capabilites;
  }

  private getMaxValueByChannel(fixtureChannel: FixtureChannel): number {
    return Math.pow(256, 1 + fixtureChannel.fineChannelAliases.length) - 1;
  }

  private getDefaultValueByChannel(fixtureChannel: FixtureChannel): number {
    if (!fixtureChannel.defaultValue) {
      return undefined;
    }

    if (isNaN(fixtureChannel.defaultValue as any) && (fixtureChannel.defaultValue as string).endsWith('%')) {
      // percentage value
      const percentage = Number.parseInt((fixtureChannel.defaultValue as string).replace('%', ''), 10);
      const maxValue = this.getMaxValueByChannel(fixtureChannel);
      return (maxValue / 100) * percentage;
    } else {
      // DMX value
      return Number.parseInt(fixtureChannel.defaultValue as any, 10);
    }
  }

  private getColorWheelByChannel(channel: CachedFixtureChannel, profile: FixtureProfile): FixtureWheel {
    for (const channelCapability of channel.capabilities) {
      if (channelCapability.wheelIsColor) {
        return channelCapability.wheel;
      }
    }

    return undefined;
  }

  getChannelByName(fixture: CachedFixture, channelName: string): CachedFixtureChannel {
    for (const channel of fixture.channels) {
      if (
        (channel.name && channel.name === channelName) ||
        (channel.channel && channel.channel.fineChannelAliases.indexOf(channelName) > -1)
      ) {
        return channel;
      }
    }

    return undefined;
  }

  private getChannelNameWithPixelKey(templateChannelName: string, pixelKey: string) {
    return templateChannelName.replace('$pixelKey', pixelKey);
  }

  private addCachedChannel(
    channels: CachedFixtureChannel[],
    channel: FixtureChannel,
    templateChannelName: string,
    pixelKey: string,
    profile: FixtureProfile
  ) {
    const cachedFixtureChannel = new CachedFixtureChannel();
    const channelName = this.getChannelNameWithPixelKey(templateChannelName, pixelKey);

    cachedFixtureChannel.channel = channel;
    cachedFixtureChannel.name = channelName;
    cachedFixtureChannel.capabilities = this.getCapabilitiesByChannel(cachedFixtureChannel.channel, channelName, profile);
    const defaultValue = this.getDefaultValueByChannel(cachedFixtureChannel.channel);
    if (defaultValue) {
      cachedFixtureChannel.defaultValue = defaultValue;
    }
    cachedFixtureChannel.maxValue = this.getMaxValueByChannel(cachedFixtureChannel.channel);
    cachedFixtureChannel.colorWheel = this.getColorWheelByChannel(cachedFixtureChannel, profile);
    channels.push(cachedFixtureChannel);
  }

  private evenlySpacedPosCm(index: number, count: number, size: number): number {
    if (count <= 0) return 0;
    if (index < 0 || index >= count) return 0;
    if (count === 1) return size / 2;

    const step = size / (count + 1); // equal edge margins
    const pos = (index + 1) * step; // center position
    return pos;
  }

  private createPixel(key: string, x: number, y: number, z: number): CachedFixturePixel {
    const pixel = new CachedFixturePixel();
    pixel.key = key;
    pixel.x = x;
    pixel.y = y;
    pixel.z = z;
    return pixel;
  }

  // the key the fixture library gives a pixel of a matrix defined by its pixel count, e.g. "3" in a
  // row of pixels, "(2, 3)" on a plane or "(1, 2, 3)" in a cube. Like the library: on a plane, the
  // first number is X (or else Y) and the last Y (or else Z).
  static getDefaultPixelKey(pixelCount: number[], x: number, y: number, z: number): string {
    const xDefined = pixelCount[0] > 1;
    const yDefined = pixelCount[1] > 1;
    const zDefined = pixelCount[2] > 1;
    const definedAxes = (xDefined ? 1 : 0) + (yDefined ? 1 : 0) + (zDefined ? 1 : 0);

    if (definedAxes === 2) {
      return '(' + (xDefined ? x : y) + ', ' + (yDefined ? y : z) + ')';
    }
    if (definedAxes === 3) {
      return '(' + x + ', ' + y + ', ' + z + ')';
    }
    return String(Math.max(x, y, z));
  }

  // the number of pixels the matrix has on each axis (X, Y, Z)
  private getMatrixSize(profile: FixtureProfile): number[] {
    const matrix = profile.matrix;

    if (matrix.pixelKeys) {
      let rows = 0;
      let columns = 0;

      for (const layer of matrix.pixelKeys) {
        rows = Math.max(rows, layer.length);

        for (const row of layer) {
          columns = Math.max(columns, row.length);
        }
      }

      return [columns, rows, matrix.pixelKeys.length];
    }

    return matrix.pixelCount;
  }

  // the position of each pixel's beam, spread evenly over the fixture like the fixture library
  // places them: X from left to right, Y from top to bottom and Z from front to back
  private setPixelPositions(profile: FixtureProfile, pixels: CachedFixturePixel[]) {
    // dimensions in mm
    const dimensions = profile.physical ? profile.physical.dimensions : [];
    const widthCm = (dimensions[0] || 0) / 10;
    const heightCm = (dimensions[1] || 0) / 10;
    const depthCm = (dimensions[2] || 0) / 10;
    const size = this.getMatrixSize(profile);

    for (const pixel of pixels) {
      pixel.positionX = this.evenlySpacedPosCm(pixel.x - 1, size[0], widthCm) - widthCm / 2;
      pixel.positionY = heightCm / 2 - this.evenlySpacedPosCm(pixel.y - 1, size[1], heightCm);
      pixel.positionZ = depthCm / 2 - this.evenlySpacedPosCm(pixel.z - 1, size[2], depthCm);
    }
  }

  // all pixels of the matrix at their positions, counted from 1 like in the fixture library. The
  // library gives the pixel keys by Z, Y and X, so the pixels come layer by layer and row by row:
  // X changes fastest.
  getAllPixelKeys(profile: FixtureProfile): CachedFixturePixel[] {
    const result: CachedFixturePixel[] = [];
    const matrix = profile.matrix;

    if (!matrix) {
      return result;
    }

    if (matrix.pixelKeys) {
      for (let z = 0; z < matrix.pixelKeys.length; z++) {
        const layer = matrix.pixelKeys[z];

        for (let y = 0; y < layer.length; y++) {
          const row = layer[y];

          for (let x = 0; x < row.length; x++) {
            if (row[x] != null) {
              result.push(this.createPixel(row[x], x + 1, y + 1, z + 1));
            }
          }
        }
      }
    } else if (matrix.pixelCount && matrix.pixelCount.length === 3) {
      const pixelCount = matrix.pixelCount;

      for (let z = 1; z <= pixelCount[2]; z++) {
        for (let y = 1; y <= pixelCount[1]; y++) {
          for (let x = 1; x <= pixelCount[0]; x++) {
            result.push(this.createPixel(FixtureService.getDefaultPixelKey(pixelCount, x, y, z), x, y, z));
          }
        }
      }
    }

    this.setPixelPositions(profile, result);

    return result;
  }

  private getPosition(pixel: CachedFixturePixel, axis: string): number {
    switch (axis) {
      case 'X':
        return pixel.x;
      case 'Y':
        return pixel.y;
      default:
        return pixel.z;
    }
  }

  // the pixels in the order of the passed axes, e.g. "YXZ": Y changes fastest, Z slowest
  private getPixelsByAxes(pixels: CachedFixturePixel[], axes: string): CachedFixturePixel[] {
    return pixels
      .slice()
      .sort(
        (pixel1, pixel2) =>
          this.getPosition(pixel1, axes[2]) - this.getPosition(pixel2, axes[2]) ||
          this.getPosition(pixel1, axes[1]) - this.getPosition(pixel2, axes[1]) ||
          this.getPosition(pixel1, axes[0]) - this.getPosition(pixel2, axes[0])
      );
  }

  private getPixelGroupNames(profile: FixtureProfile): string[] {
    if (!profile.matrix || !profile.matrix.pixelGroups) {
      return [];
    }

    return Object.keys(profile.matrix.pixelGroups);
  }

  // a pixel group as one pixel: its channels (e.g. "Red Inner ring") control all of its pixels at
  // once. The preview shows it in the middle of its pixels.
  private createGroupPixel(profile: FixtureProfile, allPixels: CachedFixturePixel[], groupName: string): CachedFixturePixel {
    const pixel = this.createPixel(groupName, 0, 0, 0);
    const groupPixels = this.fixturePixelGroupResolveService.resolveGroupPixels(profile.matrix.pixelGroups[groupName], allPixels);

    pixel.positionX = 0;
    pixel.positionY = 0;
    pixel.positionZ = 0;

    for (const groupPixel of groupPixels) {
      pixel.positionX += groupPixel.positionX / groupPixels.length;
      pixel.positionY += groupPixel.positionY / groupPixels.length;
      pixel.positionZ += groupPixel.positionZ / groupPixels.length;
    }

    return pixel;
  }

  // the pixels a channel of the mode is repeated for, in the order of their channels. A pixel group
  // counts as one.
  getPixelsInOrder(profile: FixtureProfile, repeatFor: string[]): CachedFixturePixel[] {
    const result: CachedFixturePixel[] = [];

    if (!repeatFor || repeatFor.length === 0 || !profile.matrix) {
      // a channel of its own, no pixels
      return result;
    }

    const allPixels = this.getAllPixelKeys(profile);
    const groupNames = this.getPixelGroupNames(profile);

    if (repeatFor.length === 1 && typeof repeatFor[0] === 'string' && repeatFor[0].startsWith('eachPixel')) {
      const order = repeatFor[0].substring('eachPixel'.length);

      if (order === 'ABC') {
        // the pixel keys in alphanumerical order
        return allPixels.sort((pixel1, pixel2) => FixturePixelGroupResolveService.compareKeys(pixel1.key, pixel2.key));
      } else if (order === 'Group') {
        // the pixel groups in the order of the profile
        return groupNames.map((groupName) => this.createGroupPixel(profile, allPixels, groupName));
      } else if (order.length === 3 && order.indexOf('X') >= 0 && order.indexOf('Y') >= 0 && order.indexOf('Z') >= 0) {
        // by position, e.g. eachPixelXYZ
        return this.getPixelsByAxes(allPixels, order);
      }

      return result;
    }

    // pixel keys and pixel groups
    for (const entry of repeatFor) {
      const pixel = allPixels.find((p) => p.key === entry);

      if (pixel) {
        result.push(pixel);
      } else if (groupNames.indexOf(entry) >= 0) {
        result.push(this.createGroupPixel(profile, allPixels, entry));
      }
    }

    return result;
  }

  getModeChannelCount(profile: FixtureProfile, mode: FixtureMode): number {
    let count: number = 0;

    // already calculated?
    if (mode.channelCount) {
      return mode.channelCount;
    }

    for (let channel of mode.channels) {
      if (channel.insert === 'matrixChannels') {
        count += this.getPixelsInOrder(profile, channel.repeatFor).length * channel.templateChannels.length;
      } else {
        count++;
      }
    }

    mode.channelCount = count;

    return mode.channelCount;
  }

  getCachedChannels(profile: FixtureProfile, mode: FixtureMode, pixelKey: string): CachedFixtureChannel[] {
    const channels: CachedFixtureChannel[] = [];

    // the pixels and the pixel groups, which the template channels can be named after (e.g. "Red Master")
    const pixelKeysAndGroups = this.getAllPixelKeys(profile)
      .map((pixel) => pixel.key)
      .concat(this.getPixelGroupNames(profile));

    if (!mode) {
      return channels;
    }

    for (const channel of mode.channels) {
      if (channel.name && !pixelKey) {
        // direct reference to a channel
        // don't check the fine channels. only add the coarse channel.
        let channelFound = false;

        for (const availableChannelName of Object.keys(profile.availableChannels)) {
          if (channel.name === availableChannelName) {
            const availableChannel: FixtureChannel = profile.availableChannels[availableChannelName];
            channelFound = true;
            this.addCachedChannel(channels, availableChannel, availableChannelName, null, profile);
          }
        }

        // check the template channels, if not found in the available channels
        if (!channelFound) {
          for (const templateChannelName of Object.keys(profile.templateChannels)) {
            for (const existingPixelKey of pixelKeysAndGroups) {
              const channelName = this.getChannelNameWithPixelKey(templateChannelName, existingPixelKey);

              if (channel.name === channelName) {
                const templateChannel: FixtureChannel = profile.templateChannels[templateChannelName];

                this.addCachedChannel(channels, templateChannel, channelName, existingPixelKey, profile);
              }
            }
          }
        }
      } else {
        // reference a channel through a pixel matrix
        const availablePixels = this.getPixelsInOrder(profile, channel.repeatFor);

        if (channel.channelOrder === 'perPixel') {
          // each channel for each pixel

          for (const availablePixel of availablePixels) {
            if (availablePixel.key === pixelKey) {
              for (const modeTemplateChannelName of channel.templateChannels) {
                for (const templateChannelName of Object.keys(profile.templateChannels)) {
                  // don't check the fine channels. only add the coarse channel.
                  if (modeTemplateChannelName === templateChannelName) {
                    const templateChannel: FixtureChannel = profile.templateChannels[templateChannelName];

                    this.addCachedChannel(channels, templateChannel, templateChannelName, availablePixel.key, profile);
                  }
                }
              }
            }
          }
        } else if (channel.channelOrder === 'perChannel') {
          // each pixel for each channel

          for (const modeTemplateChannelName of channel.templateChannels) {
            for (const availablePixel of availablePixels) {
              if (availablePixel.key === pixelKey) {
                for (const templateChannelName of Object.keys(profile.templateChannels)) {
                  // don't check the fine channels. only add the coarse channel.
                  if (modeTemplateChannelName === templateChannelName) {
                    const templateChannel: FixtureChannel = profile.templateChannels[templateChannelName];

                    this.addCachedChannel(channels, templateChannel, templateChannelName, availablePixel.key, profile);
                  }
                }
              }
            }
          }
        }
      }
    }

    return channels;
  }

  // get all used pixels for all channels in the currently used fixture mode
  fixtureGetUniquePixels(fixture: Fixture): CachedFixturePixel[] {
    let pixels: CachedFixturePixel[] = [];

    let profile = this.getProfileByUuid(fixture.profileUuid);
    let mode = this.getModeByFixture(profile, fixture);

    // add the unique pixel keys
    for (let channel of mode.channels) {
      this.getPixelsInOrder(profile, channel.repeatFor).forEach((pixel) => {
        if (pixels.filter((p) => p.key === pixel.key).length === 0) {
          pixels.push(pixel);
        }
      });
    }

    return pixels;
  }

  // does the fixture have a general channel without reference to specific pixel keys in the current mode?
  fixtureHasGeneralChannel(fixture: Fixture): boolean {
    let profile = this.getProfileByUuid(fixture.profileUuid);
    let mode = this.getModeByFixture(profile, fixture);

    // add the unique pixel keys
    for (let channel of mode.channels) {
      if (this.getPixelsInOrder(profile, channel.repeatFor).length === 0) {
        return true;
      }
    }

    return false;
  }

  updateCachedFixtures() {
    // calculate some frequently used values as a cache to save cpu time
    // afterwards
    this.cachedFixtures = [];

    for (const fixture of this.projectService.project.fixtures) {
      if (this.fixtureHasGeneralChannel(fixture)) {
        const cachedFixture = new CachedFixture();
        cachedFixture.fixture = fixture;
        cachedFixture.profile = this.getProfileByUuid(fixture.profileUuid);
        cachedFixture.mode = this.getModeByFixture(cachedFixture.profile, fixture);
        cachedFixture.channels = this.getCachedChannels(cachedFixture.profile, cachedFixture.mode, null);
        this.cachedFixtures.push(cachedFixture);
      }

      const pixels = this.fixtureGetUniquePixels(fixture);

      for (let pixel of pixels) {
        const cachedFixture = new CachedFixture();
        cachedFixture.fixture = fixture;
        cachedFixture.pixel = pixel;
        cachedFixture.profile = this.getProfileByUuid(fixture.profileUuid);
        cachedFixture.mode = this.getModeByFixture(cachedFixture.profile, fixture);
        cachedFixture.channels = this.getCachedChannels(cachedFixture.profile, cachedFixture.mode, pixel.key);
        this.cachedFixtures.push(cachedFixture);
      }
    }
  }

  capabilitiesMatch(
    type1: FixtureCapabilityType,
    type2: FixtureCapabilityType,
    color1: FixtureCapabilityColor,
    color2: FixtureCapabilityColor,
    wheel1: string,
    wheel2: string,
    profileUuid1: string,
    profileUuid2: string
  ): boolean {
    // checks, whether two provided capapabilities match
    return (
      type1 === type2 &&
      (!color1 || color1 === color2) &&
      (!wheel1 || wheel1 === wheel2) &&
      (!profileUuid1 || profileUuid1 === profileUuid2)
    );
  }

  private parseBrightnessNumber(brightness: string, unit: string): number {
    const text = brightness.substring(0, brightness.length - unit.length).trim();
    const number = Number(text);
    return text === '' || isNaN(number) ? undefined : number;
  }

  // how bright a capability lights, from 0 to 1, like the fixture library gives it: "off", "dark",
  // "bright", in percent or in lumens (compared to the brightest capability of the channel)
  private getBrightness(brightness: string, maxLumens: number): number {
    if (brightness == null) {
      return undefined;
    }

    switch (brightness) {
      case 'off':
        return 0;
      case 'dark':
        return 0.01;
      case 'bright':
        return 1;
    }

    if (brightness.endsWith('%')) {
      const percent = this.parseBrightnessNumber(brightness, '%');
      return percent === undefined ? undefined : percent / 100;
    }
    if (brightness.endsWith('lm') && maxLumens > 0) {
      const lumens = this.parseBrightnessNumber(brightness, 'lm');
      return lumens === undefined ? undefined : lumens / maxLumens;
    }

    return undefined;
  }

  getMaxLumens(capabilities: CachedFixtureCapability[]): number {
    let maxLumens = 0;

    for (const channelCapability of capabilities) {
      const capability = channelCapability.capability;

      for (const brightness of [capability.brightness, capability.brightnessStart, capability.brightnessEnd]) {
        if (brightness && brightness.endsWith('lm')) {
          const lumens = this.parseBrightnessNumber(brightness, 'lm');
          if (lumens !== undefined) {
            maxLumens = Math.max(maxLumens, lumens);
          }
        }
      }
    }

    return maxLumens;
  }

  // the brightness at the start and at the end of a capability: from off to bright, if not given
  getBrightnessRange(capability: FixtureCapability, maxLumens: number): number[] {
    let start: number;
    let end: number;

    if (capability.brightness != null) {
      start = this.getBrightness(capability.brightness, maxLumens);
      end = start;
    } else {
      start = this.getBrightness(capability.brightnessStart, maxLumens);
      end = this.getBrightness(capability.brightnessEnd, maxLumens);
    }

    return [start === undefined ? 0 : start, end === undefined ? 1 : end];
  }

  // the capability of a channel lighting with the passed brightness (0 to 1). A channel with more
  // capabilities (e.g. a dimmer sharing it with a strobe) uses the capability giving the
  // brightness, or else the closest one (the brighter one, if two are as close).
  getBrightnessCapability(
    channel: CachedFixtureChannel,
    brightnessCapabilities: CachedFixtureCapability[],
    brightness: number
  ): CachedFixtureCapability {
    const maxLumens = this.getMaxLumens(channel.capabilities);
    let best: CachedFixtureCapability;
    let bestDistance = Number.MAX_VALUE;
    let bestBrightness = 0;
    let bestIsRange = false;

    for (const channelCapability of brightnessCapabilities) {
      const range = this.getBrightnessRange(channelCapability.capability, maxLumens);
      const low = Math.min(range[0], range[1]);
      const high = Math.max(range[0], range[1]);
      const reached = Math.max(low, Math.min(high, brightness));
      const distance = Math.abs(reached - brightness);
      const isRange = low < high;
      let better: boolean;

      if (!best || distance < bestDistance - 1e-9) {
        better = true;
      } else if (distance > bestDistance + 1e-9) {
        better = false;
      } else if (distance === 0) {
        // both give it: a range rather than a single brightness, else the first one
        better = isRange && !bestIsRange;
      } else {
        // as close: the brighter one
        better = reached > bestBrightness;
      }

      if (better) {
        best = channelCapability;
        bestDistance = distance;
        bestBrightness = reached;
        bestIsRange = isRange;
      }
    }

    return best;
  }

  // the value of a channel lighting with the passed brightness (0 to 1) through the passed capability
  getBrightnessValue(channel: CachedFixtureChannel, channelCapability: CachedFixtureCapability, brightness: number): number {
    const range = this.getBrightnessRange(channelCapability.capability, this.getMaxLumens(channel.capabilities));

    if (channel.capabilities.length === 1) {
      // the whole channel, maybe from bright to off
      return range[0] > range[1] ? channel.maxValue * (1 - brightness) : channel.maxValue * brightness;
    }

    const dmxRange = channelCapability.capability.dmxRange;

    if (!dmxRange || dmxRange.length < 2) {
      return undefined;
    }

    if (range[0] === range[1]) {
      return channelCapability.centerValue;
    }

    const reached = Math.max(Math.min(range[0], range[1]), Math.min(Math.max(range[0], range[1]), brightness));
    return dmxRange[0] + ((dmxRange[1] - dmxRange[0]) * (reached - range[0])) / (range[1] - range[0]);
  }

  // how bright a channel value lights through the passed capability (0 to 1)
  getBrightnessOfValue(channel: CachedFixtureChannel, channelCapability: CachedFixtureCapability, value: number): number {
    const range = this.getBrightnessRange(channelCapability.capability, this.getMaxLumens(channel.capabilities));
    const dmxRange = channelCapability.capability.dmxRange;
    let position: number;

    if (dmxRange && dmxRange.length >= 2) {
      position = dmxRange[1] === dmxRange[0] ? 0 : (value - dmxRange[0]) / (dmxRange[1] - dmxRange[0]);
    } else {
      position = value / channel.maxValue;
    }

    return range[0] + (range[1] - range[0]) * position;
  }

  settingsFixtureIsSelected(fixture: Fixture): boolean {
    for (const selectedFixture of this.selectedSettingsFixtures) {
      if (selectedFixture === fixture) {
        return true;
      }
    }

    return false;
  }

  switchSettingsFixtureSelection(fixture: Fixture) {
    if (this.settingsFixtureIsSelected(fixture)) {
      this.selectedSettingsFixtures.splice(this.selectedSettingsFixtures.indexOf(fixture), 1);
    } else {
      this.selectedSettingsFixtures.push(fixture);
    }
  }

  getFixtureIconClass(profile: FixtureProfile): string {
    if (!profile) {
      return '';
    }
    if (profile.categories.length === 0) {
      return '';
    }
    if (!profile.categories[0]) {
      return '';
    }
    return profile.categories[0].replace(' ', '-').toLocaleLowerCase();
  }

  updateProfiles() {
    return this.http.post('update-profiles', null);
  }

  getNextFreeDmxChannel(fixturePool: Fixture[], neededChannels: number): number {
    // get the next free space for this fixture
    let freeChannels = 0;

    for (let i = 0; i < 512; i++) {
      let occupiedChannels = 0;

      for (const fixture of fixturePool) {
        const profile = this.getProfileByUuid(fixture.profileUuid);
        const mode = this.getModeByFixture(this.getProfileByUuid(fixture.profileUuid), fixture);
        const channelCount = this.getModeChannelCount(profile, mode);

        if (i >= fixture.dmxFirstChannel && i < fixture.dmxFirstChannel + channelCount) {
          // this channel is already occupied by a fixture -> move forward to the end of the fixture
          if (channelCount > occupiedChannels) {
            occupiedChannels = channelCount - (i - fixture.dmxFirstChannel);
          }
        }
      }

      if (occupiedChannels > 0) {
        i += occupiedChannels - 1;
        freeChannels = 0;
      } else {
        freeChannels++;
      }

      if (freeChannels === neededChannels) {
        return i - freeChannels + 1;
      }
    }

    // no free space left for the needed channels
    return -1;
  }

  addFixture(profile: FixtureProfile, fixturePool: Fixture[], channelPool?: Fixture[]): Fixture {
    const fixture = new Fixture();

    fixture.uuid = this.uuidService.getUuid();
    fixture.profileUuid = profile.uuid;
    fixture.name = profile.name;

    if (profile.modes && profile.modes.length > 0) {
      fixture.modeShortName = profile.modes[0].shortName;
    }

    // add the same mode as an existing fixture, if available
    let existingModeShortName: string;
    for (const existingFixture of fixturePool) {
      const existingProfile = this.getProfileByUuid(existingFixture.profileUuid);

      if (existingProfile === profile) {
        existingModeShortName = existingFixture.modeShortName;
        break;
      }
    }

    if (existingModeShortName) {
      fixture.modeShortName = existingModeShortName;
    } else {
      fixture.modeShortName = profile.modes[0].shortName || profile.modes[0].name;
    }

    const mode = this.getModeByFixture(profile, fixture);
    const channelCount = this.getModeChannelCount(profile, mode);
    const firstChannel = this.getNextFreeDmxChannel(channelPool ?? fixturePool, channelCount);

    if (firstChannel >= 0) {
      fixture.dmxFirstChannel = firstChannel;
      fixturePool.push(fixture);
      return fixture;
    } else {
      // no free space anymore
      const msg = 'designer.fixture-pool.no-free-space';
      const title = 'designer.fixture-pool.no-free-space-title';

      this.translateService.get([msg, title]).subscribe((result) => {
        this.toastrService.error(result[msg], result[title]);
      });
    }
  }
}
