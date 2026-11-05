import { ChangeDetectorRef, Component, Input } from '@angular/core';
import { isRotationCapabilityType } from '../../../models/capability-position';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../../../models/fixture-capability';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';

// the colors the light of an emitter is shown in on its card
const emitterColors: { [color: string]: string } = {
  White: '#ffffff',
  'Warm White': '#ffd8a8',
  'Cold White': '#dcebff',
  Amber: '#ffbf00',
  UV: '#7a3cff',
  Lime: '#bfff00',
  Indigo: '#4b0082',
};

// A capability of the step being edited which plays the same on every model of fixture: a position between the two
// ends of what a fixture does (the strobe, the zoom, the focus, the iris, the frost, the color temperature, see
// capability-position), a prism put in or taken out, a rotation either way, a blade of a framing shutter, the pulse of
// an iris or a frost, or an emitter of light besides red, green and blue (e.g. white, amber or UV). Switched off, the
// step leaves it alone.
@Component({
  selector: 'lib-app-fixture-capability-position',
  templateUrl: './fixture-capability-position.component.html',
  styleUrls: ['./fixture-capability-position.component.css'],
  standalone: false,
})
export class FixtureCapabilityPositionComponent {
  // the capability, e.g. Zoom, or ColorIntensity for an emitter
  @Input()
  type: FixtureCapabilityType;

  // the color of an emitter
  @Input()
  color: FixtureCapabilityColor;

  // the blade of a framing shutter (Top, Right, Bottom or Left)
  @Input()
  blade: string;

  constructor(
    private presetService: PresetService,
    private changeDetectorRef: ChangeDetectorRef,
    private livePreviewService: LivePreviewService
  ) {}

  // the prism is either in or out
  get isSwitch(): boolean {
    return this.type === FixtureCapabilityType.Prism;
  }

  get isEmitter(): boolean {
    return this.type === FixtureCapabilityType.ColorIntensity;
  }

  // what the card is named after: the color of an emitter, the blade or the capability
  get labelKey(): string {
    if (this.blade) {
      return 'designer.fixture.capability-blade.' + this.type + '.' + this.blade;
    }

    return this.isEmitter ? 'designer.fixtureCapabilityColor.' + this.color : 'designer.fixtureCapabilityType.' + this.type;
  }

  // what the ends of the slider mean, e.g. narrow and wide
  get lowKey(): string {
    return 'designer.fixture.capability-position-low.' + (this.isEmitter ? 'ColorIntensity' : this.type);
  }

  get highKey(): string {
    return 'designer.fixture.capability-position-high.' + (this.isEmitter ? 'ColorIntensity' : this.type);
  }

  get emitterColor(): string {
    return emitterColors[this.color] || '#ffffff';
  }

  get id(): string {
    return 'capabilityPosition' + this.type + (this.color ? this.color.replace(' ', '') : '') + (this.blade || '');
  }

  // The strobe drives the speed of a fixture with a channel of its own for it (see StrobeSpeed) as well
  private get types(): FixtureCapabilityType[] {
    return this.type === FixtureCapabilityType.ShutterStrobe ? [this.type, FixtureCapabilityType.StrobeSpeed] : [this.type];
  }

  // where a capability switched on starts: the prism in and the emitter at full, a rotation, a blade turned and the
  // whole framing shutter turned in the middle (standing still or straight), a pulse pulsing, the others at their low
  // end (e.g. the shutter open, a blade out)
  get startValue(): number {
    if (this.isSwitch || this.isEmitter) {
      return 1;
    }

    const middle = [
      FixtureCapabilityType.BladeRotation,
      FixtureCapabilityType.BladeSystemRotation,
      FixtureCapabilityType.IrisEffect,
      FixtureCapabilityType.FrostEffect,
    ];

    return isRotationCapabilityType(this.type) || middle.indexOf(this.type) >= 0 ? 0.5 : 0;
  }

  getValue(): number {
    const capabilityValue = this.presetService.getCapabilityValue(
      this.presetService.selectedStep,
      this.type,
      this.color,
      undefined,
      undefined,
      this.blade
    );

    return capabilityValue ? capabilityValue.valuePercentage : undefined;
  }

  getValueText(): number {
    const value = this.getValue();

    return value >= 0 ? Math.round(value * 100 * 100) / 100 : undefined;
  }

  setValue(value: any) {
    if (isNaN(value) || value < 0 || value > 1 || !this.presetService.selectedStep) {
      return;
    }

    for (const type of this.types) {
      this.presetService.setCapabilityValue(
        this.presetService.selectedStep,
        type,
        value,
        undefined,
        this.color,
        undefined,
        undefined,
        this.blade
      );
    }

    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  changeActive(active: boolean) {
    if (active) {
      this.setValue(this.startValue);
      return;
    }

    for (const type of this.types) {
      this.presetService.deleteCapabilityValue(this.presetService.selectedStep, type, this.color, undefined, undefined, this.blade);
    }

    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }
}
