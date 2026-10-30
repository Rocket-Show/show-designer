import { Component, Input } from '@angular/core';
import { EffectPanTilt } from '../../models/effect-pan-tilt';
import { LivePreviewService } from '../../services/live-preview.service';

// the size of the square the shape is drawn in
const gridSize = 150;

// A movement of the moving heads: its shape and size in degrees, how long it takes, how it chases over the heads and
// how long it runs (see EffectPanTilt)
@Component({
  selector: 'lib-app-effect-pan-tilt',
  templateUrl: './effect-pan-tilt.component.html',
  styleUrls: ['./effect-pan-tilt.component.css'],
  standalone: false,
})
export class EffectPanTiltComponent {
  @Input() effect: EffectPanTilt;

  readonly shapes = ['circle', 'figure8', 'line', 'wave'];
  readonly gridSize = gridSize;

  constructor(private livePreviewService: LivePreviewService) {}

  private changed() {
    this.livePreviewService.previewLive();
  }

  // the shape drawn in the square, the biggest of the sizes reaching its edges
  getShapePath(): string {
    if (!this.effect) {
      return '';
    }

    const largest = Math.max(Math.abs(this.effect.sizePanDegrees), Math.abs(this.effect.sizeTiltDegrees), 1);
    const scale = (gridSize / 2 - 6) / (largest / 2);
    const points: string[] = [];

    for (let i = 0; i <= 120; i++) {
      const shape = this.effect.getShapePosition((i / 120) % 1);
      const x = gridSize / 2 + shape.pan * (this.effect.sizePanDegrees / 2) * scale;
      const y = gridSize / 2 - shape.tilt * (this.effect.sizeTiltDegrees / 2) * scale;
      points.push((i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1));
    }

    return points.join(' ');
  }

  setShape(shape: string) {
    this.effect.shape = shape;
    this.changed();
  }

  private setNumber(value: any, apply: (number: number) => void, minimum?: number) {
    const number = Number(value);

    if (value === '' || value === null || isNaN(number) || (minimum !== undefined && number < minimum)) {
      return;
    }

    apply(number);
    this.changed();
  }

  setSizePan(value: any) {
    this.setNumber(value, (number) => (this.effect.sizePanDegrees = number), 0);
  }

  setSizeTilt(value: any) {
    this.setNumber(value, (number) => (this.effect.sizeTiltDegrees = number), 0);
  }

  // the period in seconds, or in beats while it follows the tempo
  getLength(): number {
    return this.effect.isBeatSynced() ? this.effect.lengthBeats : Math.round(this.effect.lengthMillis) / 1000;
  }

  setLength(value: any) {
    if (this.effect.isBeatSynced()) {
      this.setNumber(value, (number) => (this.effect.lengthBeats = Math.max(number, 0.25)), 0);
    } else {
      this.setNumber(value, (number) => (this.effect.lengthMillis = Math.max(number * 1000, 100)), 0);
    }
  }

  setLengthMode(lengthMode: string) {
    this.effect.lengthMode = lengthMode;
    this.changed();
  }

  // the chase: the cycles spread over all heads (0 moves them all together)
  getChase(): number {
    return this.effect.phasingMode === 'spread' ? this.effect.phasingCycles : 0;
  }

  setChase(value: any) {
    this.setNumber(value, (number) => {
      this.effect.phasingMode = 'spread';
      this.effect.phasingCycles = number;
    });
  }

  // how long it runs: forever, or a number of cycles
  getRunCycles(): number {
    return this.effect.runMode === 'cycles' ? this.effect.runCycles : 0;
  }

  setRunCycles(value: any) {
    this.setNumber(
      value,
      (number) => {
        this.effect.runMode = number > 0 ? 'cycles' : 'infinite';
        this.effect.runCycles = Math.max(Math.round(number), 1);
      },
      0
    );
  }

  setEndMode(endMode: string) {
    this.effect.endMode = endMode;
    this.changed();
  }
}
