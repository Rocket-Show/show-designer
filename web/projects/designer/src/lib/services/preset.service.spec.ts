import { inject, TestBed } from '@angular/core/testing';

import { CachedFixtureCapability } from '../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../models/cached-fixture-channel';
import { FixtureCapability, FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { Preset } from '../models/preset';
import { PresetService } from './preset.service';

describe('PresetService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PresetService],
    });
  });

  it('should be created', inject([PresetService], (service: PresetService) => {
    expect(service).toBeTruthy();
  }));
});

// what a preset drives a capability of its fixtures to. The mirror of a preset is
// applied here, so the preview, the channels and the player all show the same position.
describe('PresetService pan/tilt mirror', () => {
  let service: PresetService;

  beforeEach(() => {
    // the value is worked out from the passed capability, channel and preset alone, so
    // the service is built without its dependencies rather than dragging the whole
    // designer into the spec
    service = new PresetService(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
  });

  // a channel of a moving head driving the passed capability over its whole range
  function channel(type: FixtureCapabilityType): CachedFixtureChannel {
    const cachedChannel = new CachedFixtureChannel();
    cachedChannel.name = type.toString();
    cachedChannel.maxValue = 255;

    const cachedCapability = new CachedFixtureCapability();
    cachedCapability.capability = new FixtureCapability();
    cachedCapability.capability.type = type;
    cachedChannel.capabilities.push(cachedCapability);

    return cachedChannel;
  }

  // the dmx value the passed preset drives the capability to
  function valueOf(preset: Preset, type: FixtureCapabilityType, valuePercentage: number): number {
    const capabilityValue = new FixtureCapabilityValue();
    capabilityValue.type = type;
    capabilityValue.valuePercentage = valuePercentage;

    const cachedChannel = channel(type);

    return service.getCapabilityChannelValue(capabilityValue, cachedChannel, cachedChannel.capabilities[0], preset);
  }

  function preset(mirrorPan: boolean, mirrorTilt: boolean): Preset {
    const mirrored = new Preset();
    mirrored.mirrorPan = mirrorPan;
    mirrored.mirrorTilt = mirrorTilt;

    return mirrored;
  }

  it('should drive a preset which mirrors nothing to the position it is written with', () => {
    expect(valueOf(preset(false, false), FixtureCapabilityType.Pan, 0.25)).toBe(255 * 0.25);
    expect(valueOf(preset(false, false), FixtureCapabilityType.Tilt, 0.25)).toBe(255 * 0.25);
  });

  it('should drive a mirrored pan to the mirrored position and leave the tilt alone', () => {
    expect(valueOf(preset(true, false), FixtureCapabilityType.Pan, 0.25)).toBe(255 * 0.75);
    expect(valueOf(preset(true, false), FixtureCapabilityType.Tilt, 0.25)).toBe(255 * 0.25);
  });

  it('should drive a mirrored tilt to the mirrored position and leave the pan alone', () => {
    expect(valueOf(preset(false, true), FixtureCapabilityType.Pan, 0.25)).toBe(255 * 0.25);
    expect(valueOf(preset(false, true), FixtureCapabilityType.Tilt, 0.25)).toBe(255 * 0.75);
  });

  it('should leave the capabilities which are not pan or tilt to a mirrored preset', () => {
    expect(valueOf(preset(true, true), FixtureCapabilityType.Intensity, 0.25)).toBe(255 * 0.25);
  });

  it('should drive to the written position where no preset asks for a mirror', () => {
    const cachedChannel = channel(FixtureCapabilityType.Pan);
    const capabilityValue = new FixtureCapabilityValue();
    capabilityValue.type = FixtureCapabilityType.Pan;
    capabilityValue.valuePercentage = 0.25;

    expect(service.getCapabilityChannelValue(capabilityValue, cachedChannel, cachedChannel.capabilities[0])).toBe(255 * 0.25);
  });
});
