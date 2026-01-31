import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../../../models/fixture-capability';
import { FixtureCapabilityValue } from '../../../models/fixture-capability-value';
import { FixtureService } from '../../../services/fixture.service';
import { PresetService } from '../../../services/preset.service';

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
  private colorPickerMounted = false;

  // avoid internal updating events
  private updatingColor = false;

  private updateSubscription: Subscription;

  constructor(private presetService: PresetService, private fixtureService: FixtureService, private changeDetectorRef: ChangeDetectorRef) {
    this.updateSubscription = this.presetService.previewSelectionChanged.subscribe(() => {
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
      this.presetService.selectedPreset,
      FixtureCapabilityType.ColorIntensity,
      FixtureCapabilityColor.Red
    );
    if (capabilityValue) {
      red = 255 * capabilityValue.valuePercentage;
    }
    capabilityValue = this.presetService.getCapabilityValue(
      this.presetService.selectedPreset,
      FixtureCapabilityType.ColorIntensity,
      FixtureCapabilityColor.Green
    );
    if (capabilityValue) {
      green = 255 * capabilityValue.valuePercentage;
    }
    capabilityValue = this.presetService.getCapabilityValue(
      this.presetService.selectedPreset,
      FixtureCapabilityType.ColorIntensity,
      FixtureCapabilityColor.Blue
    );
    if (capabilityValue) {
      blue = 255 * capabilityValue.valuePercentage;
    }
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

  private setPickerColor(red: number, green: number, blue: number) {
    this.updatingColor = true;
    if (this.colorPicker) {
      this.colorPicker.color.rgb = { r: red, g: green, b: blue };
    }
    this.updatingColor = false;
  }

  ngOnDestroy() {
    this.updateSubscription.unsubscribe();
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
    if (this.presetService.selectedPreset) {
      if (color) {
        this.presetService.setCapabilityValue(
          this.presetService.selectedPreset,
          FixtureCapabilityType.ColorIntensity,
          color.rgb.r / 255,
          undefined,
          FixtureCapabilityColor.Red
        );
        this.presetService.setCapabilityValue(
          this.presetService.selectedPreset,
          FixtureCapabilityType.ColorIntensity,
          color.rgb.g / 255,
          undefined,
          FixtureCapabilityColor.Green
        );
        this.presetService.setCapabilityValue(
          this.presetService.selectedPreset,
          FixtureCapabilityType.ColorIntensity,
          color.rgb.b / 255,
          undefined,
          FixtureCapabilityColor.Blue
        );
      } else {
        this.presetService.deleteCapabilityValue(
          this.presetService.selectedPreset,
          FixtureCapabilityType.ColorIntensity,
          FixtureCapabilityColor.Red
        );
        this.presetService.deleteCapabilityValue(
          this.presetService.selectedPreset,
          FixtureCapabilityType.ColorIntensity,
          FixtureCapabilityColor.Green
        );
        this.presetService.deleteCapabilityValue(
          this.presetService.selectedPreset,
          FixtureCapabilityType.ColorIntensity,
          FixtureCapabilityColor.Blue
        );
      }
      this.changeDetectorRef.detectChanges();
      this.presetService.fixtureColorChanged.next();
      this.presetService.previewLive();
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
    this.presetService.previewLive();
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
