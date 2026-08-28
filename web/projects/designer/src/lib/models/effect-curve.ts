import { Effect } from './effect';
import { EffectCurveProfileChannels } from './effect-curve-profile-channel';
import { FixtureCapability } from './fixture-capability';

export class EffectCurve extends Effect {
  // curve types the duty cycle applies to. the sawtooths are the limits of the triangle
  // (rising over the whole cycle and falling over it), so a width would only turn them
  // into a triangle again.
  private static readonly dutyCycleTypes = ['sine', 'square', 'triangle'];

  // a cycle border is never hit exactly when the curve is sampled, so the value held
  // after a run is taken just before it
  private static readonly cycleEpsilon = 1e-9;

  curveType = 'sine';

  capabilities: FixtureCapability[] = [];
  channels: EffectCurveProfileChannels[] = [];

  lengthMillis = 2500;
  phaseMillis = 0;
  amplitude = 1;
  position = 0.5;

  // the part of the period the curve is on (square) or rising (sine, triangle), between
  // 0 and 1. 0.5 is the symmetric curve. a chase shows it as the part of the fixtures
  // that are on at the same time: 0.1 lights one fixture out of ten.
  dutyCycle = 0.5;

  // how long the curve keeps running:
  // 'infinite' never stops, 'cycles' runs runCycles full periods, 'duration' runs
  // runDurationMillis. the chase delays the run of each fixture, so all of them run
  // their cycles completely.
  runMode = 'infinite';
  runCycles = 1;
  runDurationMillis = 5000;

  // what a curve that has finished running puts on its channels: 'hold' keeps the last
  // value, 'base' stops applying the effect, which leaves the fixtures with whatever
  // the rest of the preset puts on them
  endMode = 'hold';

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

    // curves used to be symmetric and to run forever
    this.dutyCycle = data.dutyCycle === undefined ? 0.5 : data.dutyCycle;
    this.runMode = data.runMode || 'infinite';
    this.runCycles = data.runCycles === undefined ? 1 : data.runCycles;
    this.runDurationMillis = data.runDurationMillis === undefined ? 5000 : data.runDurationMillis;
    this.endMode = data.endMode || 'hold';
  }

  // whether the duty cycle changes anything on the current curve type
  public hasDutyCycle(): boolean {
    return EffectCurve.dutyCycleTypes.indexOf(this.curveType) >= 0;
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

  // how long the curve runs, measured from the moment its fixture starts, or undefined
  // if it never stops
  public getRunEndMillis(): number | undefined {
    if (this.runMode === 'cycles') {
      return Math.max(Math.round(this.runCycles), 1) * this.lengthMillis;
    }

    if (this.runMode === 'duration') {
      return Math.max(this.runDurationMillis, 0);
    }

    return undefined;
  }

  // how long one pass of a curve that stops takes, from the moment the first fixture
  // starts until the last one has finished, plus a rest that shows what it leaves behind.
  // a preset that is not placed in a composition has no moment it starts at, so it is
  // previewed by repeating this pass. undefined for a curve that never stops.
  public getRunLoopMillis(fixtureCount?: number): number | undefined {
    const runEndMillis = this.getRunEndMillis();

    if (runEndMillis === undefined) {
      return undefined;
    }

    // the chase delays the fixtures against each other, so the pass is only over once
    // the last of them has run
    const chaseMillis = Math.abs(this.getPhasingMillis(Math.max((fixtureCount || 1) - 1, 0), fixtureCount));

    return Math.max((runEndMillis + chaseMillis) * 1.25, 1);
  }

  // the value the curve puts on its channels, or undefined if it does not apply at this
  // moment - the fixtures keep whatever the rest of the preset puts on them then
  public getValueAtMillis(timeMillis: number, fixtureIndex?: number, fixtureCount?: number): number | undefined {
    const phasingMillis = this.getPhasingMillis(fixtureIndex, fixtureCount);
    const phase = this.phaseMillis + phasingMillis;

    const runEndMillis = this.getRunEndMillis();

    if (runEndMillis !== undefined) {
      // the chase delays the whole run of a fixture, so each of them runs its cycles
      // completely. the phase only shifts the curve inside the run.
      const runMillis = timeMillis - phasingMillis;

      if (runMillis < 0) {
        // this fixture has not started yet
        return undefined;
      }

      if (runMillis >= runEndMillis) {
        if (this.endMode === 'base') {
          return undefined;
        }

        return this.getCurveValue(this.getCyclePosition(runEndMillis - this.phaseMillis, true));
      }
    }

    return this.getCurveValue(this.getCyclePosition(timeMillis - phase, false));
  }

  // the position inside the current cycle, between 0 and 1
  private getCyclePosition(shiftedMillis: number, atRunEnd: boolean): number {
    const cyclePosition = (((shiftedMillis / this.lengthMillis) % 1) + 1) % 1;

    if (atRunEnd && cyclePosition < EffectCurve.cycleEpsilon) {
      // a run of full cycles ends exactly on a cycle border, where the curve has already
      // jumped back to its beginning -> hold what it showed just before it
      return 1 - EffectCurve.cycleEpsilon;
    }

    return cyclePosition;
  }

  // the duty cycle, kept inside the range the curves are defined for
  private getClampedDutyCycle(): number {
    if (!this.hasDutyCycle()) {
      return 0.5;
    }

    return Math.max(Math.min(this.dutyCycle, 1), 0);
  }

  // remaps the position inside the cycle, so the curve rises over the duty cycle and
  // falls over the rest of it. the symmetric 50 % leaves it untouched.
  private warpCyclePosition(cyclePosition: number): number {
    // an instant rise or fall would divide by zero, so the curve keeps a trace of both
    const duty = Math.max(Math.min(this.getClampedDutyCycle(), 0.999), 0.001);

    if (duty === 0.5) {
      return cyclePosition;
    }

    // measured from the trough of the curve, where it starts to rise
    const fromTrough = (cyclePosition + 0.25) % 1;
    const warped = fromTrough < duty ? (fromTrough / duty) * 0.5 : 0.5 + ((fromTrough - duty) / (1 - duty)) * 0.5;

    return (warped + 0.75) % 1;
  }

  // the value of the curve at a position inside its cycle, between 0 and 1
  private getCurveValue(cyclePosition: number): number {
    let value = 0;

    switch (this.curveType) {
      case 'sine': {
        const warped = this.warpCyclePosition(cyclePosition);
        value = this.position + ((this.amplitude / 2) * Math.sin(2 * Math.PI * warped)) / 2;
        break;
      }
      case 'square':
        // the curve is on over the last part of the cycle, which leaves the default of
        // 50 % the same square as before there was a duty cycle
        if (cyclePosition >= 1 - this.getClampedDutyCycle()) {
          value = this.position + this.amplitude / 2;
        } else {
          value = this.position - this.amplitude / 2;
        }
        break;
      case 'triangle': {
        // rises and falls linearly, in phase with the sine
        const warped = this.warpCyclePosition(cyclePosition);
        value = this.position + ((this.amplitude / 2) * (1 - 4 * Math.abs(((warped + 0.25) % 1) - 0.5))) / 2;
        break;
      }
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
