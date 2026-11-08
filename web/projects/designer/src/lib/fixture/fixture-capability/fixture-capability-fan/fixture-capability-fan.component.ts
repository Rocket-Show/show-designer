import { ChangeDetectorRef, Component, Input } from '@angular/core';
import { FanShape, FanStop, getFanStops, getFanValue, readFanStops } from '../../../models/fan';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../../../models/fixture-capability';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';

// how many fixtures the strip below the sliders shows at most
const maxBars = 24;

// A value of the step being edited fanned out over the fixtures of the preset (see fan): from the first to the last
// fixture, or from the one in the middle out to both ends, each end of the fan on a slider of its own. The strip below
// them shows what each fixture of the preset gets, in the order of the fan.
@Component({
  selector: 'lib-app-fixture-capability-fan',
  templateUrl: './fixture-capability-fan.component.html',
  styleUrls: ['./fixture-capability-fan.component.css'],
  standalone: false,
})
export class FixtureCapabilityFanComponent {
  // the capabilities the fan is put on (e.g. the strobe and its speed), the first one is shown
  @Input()
  types: FixtureCapabilityType[] = [];

  // the color of an emitter, the blade of a framing shutter
  @Input()
  color: FixtureCapabilityColor;

  @Input()
  blade: string;

  // what the ends of the sliders mean, e.g. narrow and wide (none for a dimmer)
  @Input()
  lowKey: string;

  @Input()
  highKey: string;

  constructor(
    private presetService: PresetService,
    private changeDetectorRef: ChangeDetectorRef,
    private livePreviewService: LivePreviewService
  ) {}

  private get stops(): FanStop[] {
    return this.types.length > 0
      ? this.presetService.getCapabilityFan(this.presetService.selectedStep, this.types[0], this.color, this.blade)
      : undefined;
  }

  get fan(): { shape: FanShape; from: number; to: number } {
    const stops = this.stops;

    return stops ? readFanStops(stops) : { shape: 'linear', from: 0, to: 0 };
  }

  get shape(): FanShape {
    return this.fan.shape;
  }

  // the values at the ends of the fan, in percent
  getText(end: 'from' | 'to'): number {
    return Math.round(this.fan[end] * 100 * 100) / 100;
  }

  // what each fixture of the preset gets, in the order of the fan (a few of them, if there are many)
  get bars(): number[] {
    const stops = this.stops;
    const preset = this.presetService.selectedPreset;

    if (!stops) {
      return [];
    }

    const count = Math.min(Math.max((preset ? this.presetService.getPresetFixtureCount(preset) : 0) || 0, 2), maxBars);

    return Array.from({ length: count }, (_, index) => getFanValue(stops, index / (count - 1)));
  }

  private write(shape: FanShape, from: number, to: number) {
    for (const type of this.types) {
      this.presetService.setCapabilityFan(this.presetService.selectedStep, type, getFanStops(shape, from, to), this.color, this.blade);
    }

    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  // set an end of the fan (between 0 and 1)
  setEnd(end: 'from' | 'to', value: any) {
    const number = Number(value);

    if (value === '' || value === null || isNaN(number) || number < 0 || number > 1) {
      return;
    }

    const fan = this.fan;
    this.write(fan.shape, end === 'from' ? number : fan.from, end === 'to' ? number : fan.to);
  }

  setShape(shape: FanShape) {
    const fan = this.fan;
    this.write(shape, fan.from, fan.to);
  }
}
