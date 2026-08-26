import { Effect } from './effect';
import { EffectCurveProfileChannels } from './effect-curve-profile-channel';
import { FixtureCapability } from './fixture-capability';

export class EffectCurve extends Effect {
  curveType = 'sine';

  capabilities: FixtureCapability[] = [];
  channels: EffectCurveProfileChannels[] = [];

  lengthMillis = 2500;
  phaseMillis = 0;
  amplitude = 1;
  position = 0.5;

  // how the curve is shifted from one fixture to the next (chasing):
  // 'millis' shifts it by a fixed time, 'spread' distributes phasingCycles full
  // cycles over all fixtures of the preset, which keeps the chase intact when the
  // period or the number of fixtures changes.
  // both values are signed: a negative one chases in the opposite direction.
  phasingMode = 'millis';
  phasingMillis = 0;
  phasingCycles = 1;

  // how many fixtures share the same chase step (1 = each fixture on its own)
  phasingGroupSize = 1;

  constructor(data?: any) {
    super('curve', data);

    if (!data) {
      return;
    }

    if (data.capabilities) {
      for (const capability of data.capabilities) {
        this.capabilities.push(new FixtureCapability(capability));
      }
    }

    if (data.channels) {
      for (const channel of data.channels) {
        this.channels.push(new EffectCurveProfileChannels(channel));
      }
    }

    this.lengthMillis = data.lengthMillis;
    this.phaseMillis = data.phaseMillis;
    this.amplitude = data.amplitude;
    this.position = data.position;
    this.phasingMillis = data.phasingMillis;
    this.curveType = data.curveType;

    // projects before version 4 only knew a fixed phasing time
    this.phasingMode = data.phasingMode || 'millis';
    this.phasingCycles = data.phasingCycles === undefined ? 1 : data.phasingCycles;
    this.phasingGroupSize = data.phasingGroupSize === undefined ? 1 : data.phasingGroupSize;
  }

  // the time the curve is shifted by for the passed fixture of the preset
  public getPhasingMillis(fixtureIndex?: number, fixtureCount?: number): number {
    const groupSize = Math.max(Math.round(this.phasingGroupSize), 1);
    const step = Math.floor((fixtureIndex || 0) / groupSize);

    if (this.phasingMode === 'spread') {
      // distribute the cycles over all chase steps of the preset
      const steps = Math.max(Math.ceil((fixtureCount || 1) / groupSize), 1);
      return (step / steps) * this.phasingCycles * this.lengthMillis;
    }

    return step * this.phasingMillis;
  }

  public getValueAtMillis(timeMillis: number, fixtureIndex?: number, fixtureCount?: number): number {
    const phase = this.phaseMillis + this.getPhasingMillis(fixtureIndex, fixtureCount);

    // the position inside the current cycle, between 0 and 1
    const cyclePosition = ((((timeMillis - phase) / this.lengthMillis) % 1) + 1) % 1;

    // Calculate the value between 0 and 1 according to the curve
    let value = 0;

    switch (this.curveType) {
      case 'sine':
        value = this.position + ((this.amplitude / 2) * Math.sin((2 * Math.PI * (timeMillis - phase)) / this.lengthMillis)) / 2;
        break;
      case 'square':
        if (Math.sign(Math.sin((2 * Math.PI * (timeMillis - phase)) / this.lengthMillis) / 2) === -1) {
          value = this.position + this.amplitude / 2;
        } else {
          value = this.position - this.amplitude / 2;
        }
        break;
      case 'triangle':
        // rises and falls linearly, in phase with the sine
        value = this.position + ((this.amplitude / 2) * (1 - 4 * Math.abs(((cyclePosition + 0.25) % 1) - 0.5))) / 2;
        break;
      case 'sawtooth':
        // ramps up over the whole cycle, then jumps back
        value = this.position + ((this.amplitude / 2) * (2 * cyclePosition - 1)) / 2;
        break;
      case 'reverse-sawtooth':
        // ramps down over the whole cycle, then jumps back
        value = this.position + ((this.amplitude / 2) * (1 - 2 * cyclePosition)) / 2;
        break;
    }

    return Math.max(Math.min(value, 1), 0);
  }
}
