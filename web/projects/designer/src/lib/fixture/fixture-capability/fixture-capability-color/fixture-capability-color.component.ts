import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { GradientStop } from '../../../gradient-editor/gradient-editor.component';
import { FanStop, getFanValue } from '../../../models/fan';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../../../models/fixture-capability';
import { FixtureCapabilityValue } from '../../../models/fixture-capability-value';
import { FixtureService } from '../../../services/fixture.service';
import { PresetService } from '../../../services/preset.service';
import { LivePreviewService } from '../../../services/live-preview.service';

declare var iro: any;

@Component({
  selector: 'lib-app-fixture-capability-color',
  templateUrl: './fixture-capability-color.component.html',
  styleUrls: ['./fixture-capability-color.component.css'],
  standalone: false,
})
export class FixtureCapabilityColorComponent implements OnInit, OnDestroy {
  color = '#ffffff';
  colorPicker: any;
  active = false;

  // The step spans a gradient of colors over the fixtures of the preset: red, green and blue fanned out over them with
  // stops at the same places (see fan). Its stops, as the gradient editor shows them.
  gradient = false;
  gradientStops: GradientStop[] = [];
  private colorPickerMounted = false;

  // avoid internal updating events
  private updatingColor = false;

  private updateSubscription: Subscription;
  private stepsChangedSubscription: Subscription;

  constructor(
    private presetService: PresetService,
    private fixtureService: FixtureService,
    private changeDetectorRef: ChangeDetectorRef,
    private livePreviewService: LivePreviewService
  ) {
    this.updateSubscription = this.presetService.previewSelectionChanged.subscribe(() => {
      this.update();
      this.changeDetectorRef.detectChanges();
    });

    // the color belongs to the step being edited, so it follows the step being selected
    this.stepsChangedSubscription = this.presetService.stepsChanged.subscribe(() => {
      this.update();
      this.changeDetectorRef.detectChanges();
    });

    this.update();
  }

  private update() {
    let red: number;
    let green: number;
    let blue: number;
    let capabilityValue: FixtureCapabilityValue;
    capabilityValue = this.presetService.getCapabilityValue(
      this.presetService.selectedStep,
      FixtureCapabilityType.ColorIntensity,
      FixtureCapabilityColor.Red
    );
    if (capabilityValue) {
      red = 255 * capabilityValue.valuePercentage;
    }
    capabilityValue = this.presetService.getCapabilityValue(
      this.presetService.selectedStep,
      FixtureCapabilityType.ColorIntensity,
      FixtureCapabilityColor.Green
    );
    if (capabilityValue) {
      green = 255 * capabilityValue.valuePercentage;
    }
    capabilityValue = this.presetService.getCapabilityValue(
      this.presetService.selectedStep,
      FixtureCapabilityType.ColorIntensity,
      FixtureCapabilityColor.Blue
    );
    if (capabilityValue) {
      blue = 255 * capabilityValue.valuePercentage;
    }
    this.updateGradient();

    if (red !== undefined && green !== undefined && blue !== undefined) {
      this.active = true;
    } else {
      this.active = false;
      red = 255;
      green = 255;
      blue = 255;
    }
    this.color = this.fixtureService.rgbToHex(red, green, blue);
    this.setPickerColor(red, green, blue);
  }

  private static readonly gradientColors = [FixtureCapabilityColor.Red, FixtureCapabilityColor.Green, FixtureCapabilityColor.Blue];

  // the fans of red, green and blue of the step, if all three are fanned
  private getColorFans(): FanStop[][] {
    const fans = FixtureCapabilityColorComponent.gradientColors.map((color) =>
      this.presetService.getCapabilityFan(this.presetService.selectedStep, FixtureCapabilityType.ColorIntensity, color)
    );

    return fans.every((fan) => fan) ? fans : undefined;
  }

  // Whether the step spans a gradient over the fixtures, and its stops: the places of the stops of the red, each with
  // its color made of all three at that place
  private updateGradient() {
    const fans = this.getColorFans();

    this.gradient = !!fans;
    this.gradientStops = fans
      ? fans[0].map((stop) => {
          const [red, green, blue] = fans.map((fan) => Math.round(255 * getFanValue(fan, stop.position)));
          return { position: stop.position, color: this.fixtureService.rgbToHex(red, green, blue) };
        })
      : [];
  }

  // Span the passed gradient over the fixtures of the preset: red, green and blue each fanned out with a stop at each of
  // its places
  setGradient(stops: GradientStop[]) {
    if (!this.presetService.selectedStep || !stops || stops.length === 0) {
      return;
    }

    const colors = stops.map((stop) => this.fixtureService.hexToRgb(stop.color) || { red: 0, green: 0, blue: 0 });
    const channels = ['red', 'green', 'blue'];

    FixtureCapabilityColorComponent.gradientColors.forEach((color, index) => {
      const fan = stops.map(
        (stop, stopIndex) => new FanStop({ position: stop.position, valuePercentage: colors[stopIndex][channels[index]] / 255 })
      );
      this.presetService.setCapabilityFan(this.presetService.selectedStep, FixtureCapabilityType.ColorIntensity, fan, color);
    });

    this.active = true;
    this.gradient = true;
    this.gradientStops = stops;
    this.changeDetectorRef.detectChanges();
    this.presetService.fixtureColorChanged.next();
    this.livePreviewService.previewLive();
  }

  // Span a gradient over the fixtures from the color of the step to blue (to red, if it is blue already), or take it
  // away again, leaving all of them in the color of the one in the middle
  toggleGradient() {
    const fans = this.getColorFans();

    if (fans) {
      const [red, green, blue] = fans.map((fan) => 255 * getFanValue(fan, 0.5));
      this.gradient = false;
      this.gradientStops = [];
      this.color = this.fixtureService.rgbToHex(red, green, blue);
      this.setPickerColor(red, green, blue);
      this.updateFixtureColor({ rgb: { r: red, g: green, b: blue } });
      return;
    }

    const from = this.active ? this.color : '#ff0000';
    const to = from.toLowerCase() === '#0000ff' ? '#ff0000' : '#0000ff';

    this.setGradient([
      { position: 0, color: from },
      { position: 1, color: to },
    ]);
  }

  private setPickerColor(red: number, green: number, blue: number) {
    this.updatingColor = true;
    if (this.colorPicker) {
      this.colorPicker.color.rgb = { r: red, g: green, b: blue };
    }
    this.updatingColor = false;
  }

  ngOnDestroy() {
    this.updateSubscription.unsubscribe();
    this.stepsChangedSubscription.unsubscribe();
  }

  ngOnInit() {
    this.colorPicker = new iro.ColorPicker('#color-picker-container', {
      width: 180,
      color: this.color,
      borderWidth: 1,
      borderColor: '#ffffff',
      sliderMargin: 20,
    });

    this.colorPicker.on('color:change', this.changeColor.bind(this));

    // mounted may be called, before this callback has been added. use input:start therefore
    this.colorPicker.on('input:start', this.mount.bind(this));
  }

  mount() {
    this.colorPickerMounted = true;
  }

  private updateFixtureColor(color: any) {
    if (this.presetService.selectedStep) {
      if (color) {
        this.presetService.setCapabilityValue(
          this.presetService.selectedStep,
          FixtureCapabilityType.ColorIntensity,
          color.rgb.r / 255,
          undefined,
          FixtureCapabilityColor.Red
        );
        this.presetService.setCapabilityValue(
          this.presetService.selectedStep,
          FixtureCapabilityType.ColorIntensity,
          color.rgb.g / 255,
          undefined,
          FixtureCapabilityColor.Green
        );
        this.presetService.setCapabilityValue(
          this.presetService.selectedStep,
          FixtureCapabilityType.ColorIntensity,
          color.rgb.b / 255,
          undefined,
          FixtureCapabilityColor.Blue
        );
      } else {
        this.presetService.deleteCapabilityValue(
          this.presetService.selectedStep,
          FixtureCapabilityType.ColorIntensity,
          FixtureCapabilityColor.Red
        );
        this.presetService.deleteCapabilityValue(
          this.presetService.selectedStep,
          FixtureCapabilityType.ColorIntensity,
          FixtureCapabilityColor.Green
        );
        this.presetService.deleteCapabilityValue(
          this.presetService.selectedStep,
          FixtureCapabilityType.ColorIntensity,
          FixtureCapabilityColor.Blue
        );
      }
      this.changeDetectorRef.detectChanges();
      this.presetService.fixtureColorChanged.next();
      this.livePreviewService.previewLive();
    }
  }

  changeActive(active: boolean) {
    this.active = active;

    if (active) {
      this.updateFixtureColor(this.colorPicker.color);
    } else {
      this.updateFixtureColor(undefined);
      this.setPickerColor(255, 255, 255);
      this.color = '#ffffff';
    }
    this.livePreviewService.previewLive();
  }

  // a color typed in as hex (e.g. "#ff0000" or "#f00") colors the fixtures, once it is one
  typeColor(text: string) {
    this.color = text;

    const rgb = text ? this.fixtureService.hexToRgb(text.trim()) : undefined;

    if (!rgb) {
      return;
    }

    this.active = true;
    this.setPickerColor(rgb.red, rgb.green, rgb.blue);
    this.updateFixtureColor({ rgb: { r: rgb.red, g: rgb.green, b: rgb.blue } });
  }

  changeColor(color: any) {
    if (!this.colorPickerMounted || this.updatingColor) {
      return;
    }

    this.active = true;
    this.color = color.hexString;
    this.updateFixtureColor(color);
  }
}
