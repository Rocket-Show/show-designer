import { Injectable } from '@angular/core';
import { Color } from '../models/color';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../models/fixture-capability';
import { FixtureCapabilityValue } from '../models/fixture-capability-value';
import { Preset } from '../models/preset';
import { Scene } from '../models/scene';
import { FixtureService } from './fixture.service';
import { PresetService } from './preset.service';

/**
 * The colors the scenes and the presets are marked with in the lists and on the
 * timeline.
 *
 * A color is either picked by hand or derived from what the item does: a preset takes
 * the color it puts on its fixtures, a scene the mixed color of the presets it plays.
 * An item which sets no color at all falls back to the color stored with it (the one
 * picked last, or the palette color a new scene starts with).
 */
@Injectable({
  providedIn: 'root',
})
export class ColorService {
  // what a scene starts with, so scenes without a color of their own can still be told
  // apart on the timeline
  readonly palette: string[] = ['#945fda', '#61da5f', '#5fc3da', '#dad65f', '#da5f5f', '#246db7'];

  // what the color picker offers for a quick choice: the scene palette, followed by the
  // colors a look is usually built around
  readonly pickerColors: string[] = this.palette.concat([
    '#ffffff',
    '#ffd9a0',
    '#ff0000',
    '#ff7f00',
    '#ffd400',
    '#aaff00',
    '#00ff40',
    '#00ffbf',
    '#00bfff',
    '#0040ff',
    '#7f00ff',
    '#ff00bf',
  ]);

  // a color which is only dimmed down would be next to invisible on the dark surfaces.
  // The hue is what marks an item, so dark colors are scaled up to at least this.
  private static readonly MIN_BRIGHTNESS = 150;

  constructor(private fixtureService: FixtureService, private presetService: PresetService) {}

  // the color a preset is marked with (undefined = none, it is shown unmarked)
  getPresetColor(preset: Preset): string {
    if (preset.colorAuto) {
      const derived = this.getDerivedPresetColor(preset);

      if (derived) {
        return derived;
      }
    }

    return preset.color;
  }

  // the color a preset puts on its fixtures: the one mixed from its color intensities,
  // or the color of the wheel slot it selects. undefined, if it sets no color at all.
  //
  // A preset with steps is read from its first step, the look it opens with, so the
  // color it is marked with stays the same while another step is edited or played.
  getDerivedPresetColor(preset: Preset): string {
    const capabilityValues = this.getPresetCapabilityValues(preset);

    return this.getColorIntensityColor(capabilityValues) || this.getWheelSlotColor(capabilityValues);
  }

  // the color a scene is marked with (undefined = none, it is shown unmarked)
  getSceneColor(scene: Scene): string {
    if (scene.colorAuto) {
      const derived = this.getDerivedSceneColor(scene);

      if (derived) {
        return derived;
      }
    }

    return scene.color;
  }

  // the mixed color of the presets played in the scene. undefined, if none of them
  // is marked with a color.
  getDerivedSceneColor(scene: Scene): string {
    const colors: Color[] = [];
    const seen: string[] = [];

    for (const uuid of scene.presetUuids) {
      // a preset can only be once in a scene, no matter what the list says
      if (seen.indexOf(uuid) >= 0) {
        continue;
      }
      seen.push(uuid);

      const preset = this.presetService.getPresetByUuid(uuid);
      const color = preset ? this.getPresetColor(preset) : undefined;
      const rgb = color ? this.fixtureService.hexToRgb(color) : undefined;

      if (rgb) {
        colors.push(rgb);
      }
    }

    return colors.length ? this.toDisplayColor(this.fixtureService.mixColors(colors)) : undefined;
  }

  // the palette color a new scene starts with, taken in the order the scenes were
  // created and wrapping around once the palette is used up
  getNewSceneColor(sceneCount: number): string {
    return this.palette[sceneCount % this.palette.length];
  }

  // a color at a given opacity, ready to be painted with. A color which cannot be read
  // is painted white, the way an unmarked timeline region always was.
  toRgba(hex: string, alpha: number): string {
    const rgb = (hex ? this.fixtureService.hexToRgb(hex) : undefined) || new Color(255, 255, 255);

    return 'rgba(' + Math.round(rgb.red) + ', ' + Math.round(rgb.green) + ', ' + Math.round(rgb.blue) + ', ' + alpha + ')';
  }

  // the values a preset is read from: the ones of its first step. The preset carries
  // those on itself as well, but only after it has been saved (see
  // writeCompatibilityValues), so the step is what a color has to follow.
  private getPresetCapabilityValues(preset: Preset): FixtureCapabilityValue[] {
    const step = preset.steps[0];

    return (step ? step.fixtureCapabilityValues : preset.fixtureCapabilityValues) || [];
  }

  // the rgb color a preset mixes from its color intensities (what the color picker of
  // the fixtures sets)
  private getColorIntensityColor(capabilityValues: FixtureCapabilityValue[]): string {
    const red = this.getColorIntensity(capabilityValues, FixtureCapabilityColor.Red);
    const green = this.getColorIntensity(capabilityValues, FixtureCapabilityColor.Green);
    const blue = this.getColorIntensity(capabilityValues, FixtureCapabilityColor.Blue);

    if (red === undefined || green === undefined || blue === undefined) {
      return undefined;
    }

    return this.toDisplayColor(new Color(red, green, blue));
  }

  private getColorIntensity(capabilityValues: FixtureCapabilityValue[], color: FixtureCapabilityColor): number {
    const capabilityValue = this.presetService.getCapabilityValueOf(capabilityValues, FixtureCapabilityType.ColorIntensity, color);

    return capabilityValue ? 255 * capabilityValue.valuePercentage : undefined;
  }

  // the color of the wheel slots a preset selects, for the fixtures which are colored
  // by a color wheel instead of by color intensities
  private getWheelSlotColor(capabilityValues: FixtureCapabilityValue[]): string {
    for (const capabilityValue of capabilityValues) {
      if (capabilityValue.type !== FixtureCapabilityType.WheelSlot || capabilityValue.slotNumber === undefined) {
        continue;
      }

      const profile = this.fixtureService.getProfileByUuid(capabilityValue.profileUuid);
      const wheel = profile ? this.fixtureService.getWheelByName(profile, capabilityValue.wheel) : undefined;
      const color = wheel ? this.fixtureService.getMixedWheelSlotColor(wheel, capabilityValue.slotNumber) : undefined;

      if (color) {
        return this.toDisplayColor(color);
      }
    }

    return undefined;
  }

  // scale a mixed color up until it is bright enough to be seen on the dark surfaces,
  // keeping its hue. A preset fading its fixtures to black marks nothing.
  private toDisplayColor(color: Color): string {
    const max = Math.max(color.red, color.green, color.blue);

    if (max <= 0) {
      return undefined;
    }

    const scale = max < ColorService.MIN_BRIGHTNESS ? ColorService.MIN_BRIGHTNESS / max : 1;

    return this.fixtureService.rgbToHex(Math.round(color.red * scale), Math.round(color.green * scale), Math.round(color.blue * scale));
  }
}
