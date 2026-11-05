import { cycleSine } from './cycle-sine';
import { EffectCurve } from './effect-curve';

// A movement of the moving heads of a preset around where the preset points them (or around the middle, if it
// doesn't): a circle, a figure 8, a line back and forth or a wave (back and forth on the pan, nodding three times on
// the tilt on the way), its size given in degrees on each axis, which moves every model the same way. It runs on the
// timing of a curve: its period, its phase, the chase over the fixtures and how long it runs. Rocket Show plays it
// the very same way (EffectPanTilt).
export class EffectPanTilt extends EffectCurve {
  shape = 'circle';

  // how far the movement reaches from one side to the other, in degrees
  sizePanDegrees = 60;
  sizeTiltDegrees = 30;

  constructor(data?: any) {
    super(data, 'pan-tilt');

    if (!data) {
      return;
    }

    // a value missing or null keeps the default, like in Rocket Show
    this.shape = data.shape || 'circle';
    this.sizePanDegrees = data.sizePanDegrees ?? 60;
    this.sizeTiltDegrees = data.sizeTiltDegrees ?? 30;
  }

  // where the shape is at a position inside its cycle (between 0 and 1), from -1 to 1 on each axis
  public getShapePosition(cyclePosition: number): { pan: number; tilt: number } {
    const twice = (cyclePosition * 2) % 1;
    const thrice = (cyclePosition * 3) % 1;

    switch (this.shape) {
      case 'figure8':
        return { pan: cycleSine(cyclePosition), tilt: cycleSine(twice) };
      case 'line':
        return { pan: cycleSine(cyclePosition), tilt: cycleSine(cyclePosition) };
      case 'wave':
        return { pan: cycleSine(cyclePosition), tilt: cycleSine(thrice) };
      default:
        // a circle: the cosine is the sine a quarter of a cycle ahead
        return { pan: cycleSine(cyclePosition), tilt: cycleSine((cyclePosition + 0.25) % 1) };
    }
  }

  // how far the passed fixture is moved away from where the preset points it, in degrees on each axis, or undefined if
  // the movement does not apply at this moment
  public getOffsetAtMillis(
    timeMillis: number,
    fixtureIndex?: number,
    fixtureCount?: number,
    beatsPerMinute?: number
  ): { pan: number; tilt: number } | undefined {
    const cyclePosition = this.getCyclePositionAtMillis(timeMillis, fixtureIndex, fixtureCount, beatsPerMinute);

    if (cyclePosition === undefined) {
      return undefined;
    }

    const shape = this.getShapePosition(cyclePosition);

    return { pan: (this.sizePanDegrees / 2) * shape.pan, tilt: (this.sizeTiltDegrees / 2) * shape.tilt };
  }
}
