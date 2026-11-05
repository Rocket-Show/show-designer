import { cycleSine } from './cycle-sine';
import { Effect } from './effect';
import { EffectCurveProfileChannels } from './effect-curve-profile-channel';
import { FixtureCapability } from './fixture-capability';

export class EffectCurve extends Effect {
  // a cycle border is never hit exactly when the curve is sampled, so the value held
  // after a run is taken just before it
  private static readonly cycleEpsilon = 1e-9;

  // the tempo a curve synced to the beat falls back to: a preset previewed on its own is
  // not played inside a composition, so there is no tempo to take it from
  public static readonly defaultBeatsPerMinute = 120;

  curveType = 'sine';

  capabilities: FixtureCapability[] = [];
  channels: EffectCurveProfileChannels[] = [];

  // how the period is measured: 'millis' holds it at a fixed time, 'beats' locks it to
  // the tempo of the composition, so the curve keeps running with the music when the
  // tempo is changed or guessed again
  lengthMode = 'millis';

  lengthMillis = 2500;

  // the period in beats, while it follows the tempo: 1 is a beat, 4 a bar in 4/4 time,
  // 0.5 an eighth
  lengthBeats = 4;

  phaseMillis = 0;

  // the phase in beats, while the period follows the tempo. keeping it musical as well
  // holds the curve at the same place inside its period when the tempo changes.
  phaseBeats = 0;

  amplitude = 1;
  position = 0.5;

  // the part of the period the curve is on (above its position), between 0 and 1. 0.5 is
  // the plain curve. every curve keeps its shape: a narrower width runs it faster and
  // rests it at its bottom for the rest of the period, a wider one rests it at its top. a
  // sine, a triangle and a square stay centered on their peak, a sawtooth keeps its jump.
  // a chase shows it as the part of the fixtures that are on at the same time: 0.1 lights
  // one fixture out of ten.
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
  // 'millis' shifts it by a fixed time, 'beats' by a musical one that follows the tempo,
  // 'spread' distributes phasingCycles full cycles over all fixtures of the preset, which
  // keeps the chase intact when the period or the number of fixtures changes.
  // all three values are signed: a negative one chases in the opposite direction.
  phasingMode = 'millis';
  phasingMillis = 0;
  phasingBeats = 0;
  phasingCycles = 1;

  // how many fixtures share the same chase step (1 = each fixture on its own)
  phasingGroupSize = 1;

  // a movement of the pan and the tilt runs on the timing of a curve as well (see EffectPanTilt)
  constructor(data?: any, type = 'curve') {
    super(type, data);

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

    // a value missing or null keeps the default, like in Rocket Show
    this.lengthMillis = data.lengthMillis ?? 2500;
    this.phaseMillis = data.phaseMillis ?? 0;
    this.amplitude = data.amplitude ?? 1;
    this.position = data.position ?? 0.5;
    this.phasingMillis = data.phasingMillis ?? 0;
    this.curveType = data.curveType ?? 'sine';

    // curves used to run on a fixed time only, without a tempo to follow
    this.lengthMode = data.lengthMode || 'millis';
    this.lengthBeats = data.lengthBeats ?? 4;
    this.phaseBeats = data.phaseBeats ?? 0;
    this.phasingBeats = data.phasingBeats ?? 0;

    // projects before version 4 only knew a fixed phasing time
    this.phasingMode = data.phasingMode || 'millis';
    this.phasingCycles = data.phasingCycles ?? 1;
    this.phasingGroupSize = data.phasingGroupSize ?? 1;

    // curves used to be symmetric and to run forever
    this.dutyCycle = data.dutyCycle ?? 0.5;
    this.runMode = data.runMode || 'infinite';
    this.runCycles = data.runCycles ?? 1;
    this.runDurationMillis = data.runDurationMillis ?? 5000;
    this.endMode = data.endMode || 'hold';
  }

  // how long a beat lasts at the passed tempo
  public static getBeatMillis(beatsPerMinute?: number): number {
    const bpm = beatsPerMinute && beatsPerMinute > 0 ? beatsPerMinute : EffectCurve.defaultBeatsPerMinute;

    return 60000 / bpm;
  }

  // whether the curve follows the tempo instead of a fixed time
  public isBeatSynced(): boolean {
    return this.lengthMode === 'beats';
  }

  // the period of the curve at the tempo it is played at
  public getLengthMillis(beatsPerMinute?: number): number {
    if (!this.isBeatSynced()) {
      return this.lengthMillis;
    }

    // a period of zero would divide by zero when the cycle is sampled
    return Math.max(this.lengthBeats * EffectCurve.getBeatMillis(beatsPerMinute), 1);
  }

  // the time the curve is shifted by inside its period
  public getPhaseMillis(beatsPerMinute?: number): number {
    if (!this.isBeatSynced()) {
      return this.phaseMillis;
    }

    return this.phaseBeats * EffectCurve.getBeatMillis(beatsPerMinute);
  }

  // how many fixtures run the same step of the chase
  private getPhasingGroupSize(): number {
    return Math.max(Math.round(this.phasingGroupSize), 1);
  }

  // the number of chase steps the fixtures of the preset are divided into. a group runs
  // as one step, so grouping leaves fewer steps than there are fixtures.
  public getPhasingStepCount(fixtureCount?: number): number {
    return Math.max(Math.ceil((fixtureCount || 1) / this.getPhasingGroupSize()), 1);
  }

  // the time the curve is shifted by for the passed step of the chase
  public getPhasingStepMillis(step: number, fixtureCount?: number, beatsPerMinute?: number): number {
    if (this.phasingMode === 'spread') {
      // distribute the cycles over all chase steps of the preset
      return (step / this.getPhasingStepCount(fixtureCount)) * this.phasingCycles * this.getLengthMillis(beatsPerMinute);
    }

    if (this.phasingMode === 'beats') {
      return step * this.phasingBeats * EffectCurve.getBeatMillis(beatsPerMinute);
    }

    return step * this.phasingMillis;
  }

  // the time the curve is shifted by for the passed fixture of the preset
  public getPhasingMillis(fixtureIndex?: number, fixtureCount?: number, beatsPerMinute?: number): number {
    const step = Math.floor((fixtureIndex || 0) / this.getPhasingGroupSize());

    return this.getPhasingStepMillis(step, fixtureCount, beatsPerMinute);
  }

  // how long the curve runs, measured from the moment its fixture starts, or undefined
  // if it never stops
  public getRunEndMillis(beatsPerMinute?: number): number | undefined {
    if (this.runMode === 'cycles') {
      return Math.max(Math.round(this.runCycles), 1) * this.getLengthMillis(beatsPerMinute);
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
  public getRunLoopMillis(fixtureCount?: number, beatsPerMinute?: number): number | undefined {
    const runEndMillis = this.getRunEndMillis(beatsPerMinute);

    if (runEndMillis === undefined) {
      return undefined;
    }

    // the chase delays the fixtures against each other, so the pass is only over once
    // the last of them has run
    const chaseMillis = Math.abs(this.getPhasingMillis(Math.max((fixtureCount || 1) - 1, 0), fixtureCount, beatsPerMinute));

    return Math.max((runEndMillis + chaseMillis) * 1.25, 1);
  }

  // the value the curve puts on its channels, or undefined if it does not apply at this
  // moment - the fixtures keep whatever the rest of the preset puts on them then
  public getValueAtMillis(timeMillis: number, fixtureIndex?: number, fixtureCount?: number, beatsPerMinute?: number): number | undefined {
    const cyclePosition = this.getCyclePositionAtMillis(timeMillis, fixtureIndex, fixtureCount, beatsPerMinute);

    return cyclePosition === undefined ? undefined : this.getCurveValue(cyclePosition);
  }

  // where the curve is inside its cycle (between 0 and 1) for the passed fixture, or undefined if it does not apply at
  // this moment
  public getCyclePositionAtMillis(
    timeMillis: number,
    fixtureIndex?: number,
    fixtureCount?: number,
    beatsPerMinute?: number
  ): number | undefined {
    const lengthMillis = this.getLengthMillis(beatsPerMinute);
    const phasingMillis = this.getPhasingMillis(fixtureIndex, fixtureCount, beatsPerMinute);
    const phaseMillis = this.getPhaseMillis(beatsPerMinute);
    const phase = phaseMillis + phasingMillis;

    const runEndMillis = this.getRunEndMillis(beatsPerMinute);

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

        return this.getCyclePosition(runEndMillis - phaseMillis, true, lengthMillis);
      }
    }

    return this.getCyclePosition(timeMillis - phase, false, lengthMillis);
  }

  // the position inside the current cycle, between 0 and 1
  private getCyclePosition(shiftedMillis: number, atRunEnd: boolean, lengthMillis: number): number {
    const cyclePosition = (((shiftedMillis / lengthMillis) % 1) + 1) % 1;

    if (atRunEnd && cyclePosition < EffectCurve.cycleEpsilon) {
      // a run of full cycles ends exactly on a cycle border, where the curve has already
      // jumped back to its beginning -> hold what it showed just before it
      return 1 - EffectCurve.cycleEpsilon;
    }

    return cyclePosition;
  }

  // the duty cycle, kept inside the range the curves are defined for
  private getClampedDutyCycle(): number {
    return Math.max(Math.min(this.dutyCycle, 1), 0);
  }

  // remaps the position inside the cycle of a sine or a triangle, so the curve is on over
  // the duty cycle. it stays symmetric around its peak: below 50 % it runs faster and
  // rests at its trough for the rest of the cycle, above it rests at its peak and dips
  // faster. the plain 50 % leaves it untouched.
  private warpCyclePosition(cyclePosition: number): number {
    const duty = this.getClampedDutyCycle();

    if (duty === 0.5) {
      return cyclePosition;
    }

    // never on or never off: the curve rests at its trough or its peak
    if (duty <= 0) {
      return 0.75;
    }

    if (duty >= 1) {
      return 0.25;
    }

    // both curves are symmetric around their peak at a quarter of the cycle, so only the
    // distance from it counts: 0 on the peak, 0.5 on the trough
    const fromPeak = Math.abs(((cyclePosition + 0.25) % 1) - 0.5);

    // the plain curve falls from its peak to its trough over half the cycle and crosses
    // its position halfway. warped, it crosses it at half the duty cycle and falls over
    // the shorter of the on and off parts, so it neither overshoots its peak nor its
    // trough and rests at them over the rest.
    const fall = Math.min(duty, 1 - duty);
    const warpedFromPeak = Math.max(Math.min(0.25 + ((fromPeak - duty / 2) / fall) * 0.5, 0.5), 0);

    return 0.25 + warpedFromPeak;
  }

  // how far a sawtooth has ramped up at a position inside its cycle, between 0 (its
  // bottom) and 1 (its top), before it jumps back at the end of the cycle. it keeps the
  // jump where it is and is on over the duty cycle before it: below 50 % it ramps faster
  // and rests at its bottom before, above it ramps right after the jump and rests at its
  // top. the plain 50 % ramps over the whole cycle.
  private getRamp(cyclePosition: number): number {
    const duty = this.getClampedDutyCycle();

    if (duty === 0.5) {
      return cyclePosition;
    }

    // never on or never off: the curve rests at its bottom or its top
    if (duty <= 0) {
      return 0;
    }

    if (duty >= 1) {
      return 1;
    }

    // the ramp crosses its middle where the duty cycle begins and takes twice the shorter
    // of the on and off parts, so it fits into the cycle on both sides of its middle
    const rampLength = 2 * Math.min(duty, 1 - duty);

    return Math.max(Math.min(0.5 + (cyclePosition - (1 - duty)) / rampLength, 1), 0);
  }

  // the value of the curve at a position inside its cycle, between 0 and 1. every curve swings
  // over its whole amplitude around its position (before project version 8, the curves except
  // the square swung over half of it).
  private getCurveValue(cyclePosition: number): number {
    let value = 0;

    switch (this.curveType) {
      case 'sine': {
        const warped = this.warpCyclePosition(cyclePosition);
        value = this.position + (this.amplitude / 2) * cycleSine(warped);
        break;
      }
      case 'square': {
        // on while the sine is above its position: over the duty cycle, centered on the
        // peak of the sine at a quarter of the cycle
        const duty = this.getClampedDutyCycle();
        const fromOn = (((cyclePosition - 0.25 + duty / 2) % 1) + 1) % 1;

        if (fromOn < duty) {
          value = this.position + this.amplitude / 2;
        } else {
          value = this.position - this.amplitude / 2;
        }
        break;
      }
      case 'triangle': {
        // rises and falls linearly, in phase with the sine
        const warped = this.warpCyclePosition(cyclePosition);
        value = this.position + (this.amplitude / 2) * (1 - 4 * Math.abs(((warped + 0.25) % 1) - 0.5));
        break;
      }
      case 'sawtooth':
        // ramps up, then jumps back at the end of the cycle
        value = this.position + (this.amplitude / 2) * (2 * this.getRamp(cyclePosition) - 1);
        break;
      case 'reverse-sawtooth':
        // the sawtooth run backwards: jumps up at the beginning of the cycle, then ramps down
        value = this.position + (this.amplitude / 2) * (2 * this.getRamp(1 - cyclePosition) - 1);
        break;
    }

    return Math.max(Math.min(value, 1), 0);
  }
}
