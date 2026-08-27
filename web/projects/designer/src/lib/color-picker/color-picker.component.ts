import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, ViewChild } from '@angular/core';

declare var iro: any;

/**
 * Picks the color an item (a scene, a preset) is marked with: a wheel for a free
 * choice, a palette for a quick one and the hex value for an exact one.
 *
 * The color can also be left to the item itself, which is what the "automatic" switch
 * is for: the picker then shows what the item derives (autoColor), and picking anything
 * puts it back to the color chosen here.
 */
@Component({
  selector: 'lib-app-color-picker',
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.css'],
  standalone: false,
})
export class ColorPickerComponent implements AfterViewInit, OnChanges, OnDestroy {
  // the color picked by hand (undefined = none picked yet)
  @Input() color: string;

  @Output() colorChange = new EventEmitter<string>();

  // is the color derived from the item instead of picked here?
  @Input() auto = true;

  @Output() autoChange = new EventEmitter<boolean>();

  // the color the item derives and the label saying where it comes from
  @Input() autoColor: string;
  @Input() autoLabel: string;

  // the colors offered for a quick choice
  @Input() palette: string[] = [];

  @ViewChild('wheel') wheelContainer: ElementRef<HTMLElement>;

  // the hex value being typed, which only becomes the color once it is complete
  hexValue: string;

  // ties the automatic switch to its label, also when two pickers are on the same page
  readonly autoId = 'color-picker-auto-' + ColorPickerComponent.instances++;

  private static instances = 0;

  private picker: any;

  // the wheel reports the color it is set to as a change as well -> only take what the
  // user turns it to, never what our own updates put into it
  private updating = false;
  private mounted = false;

  // what the item ends up being marked with, which is what the picker shows: the
  // derived color while it is left to the item, the picked one otherwise
  get shownColor(): string {
    return (this.auto ? this.autoColor : undefined) || this.color;
  }

  ngAfterViewInit() {
    this.picker = new iro.ColorPicker(this.wheelContainer.nativeElement, {
      width: 150,
      color: this.shownColor || ColorPickerComponent.noColor,
      borderWidth: 1,
      borderColor: '#3b424d',
      sliderMargin: 16,
    });

    // the wheel may have been mounted before this callback was added, so its first
    // input is what tells us it is ready (the same way the fixture color picker does it)
    this.picker.on('input:start', () => (this.mounted = true));
    this.picker.on('color:change', (color: any) => this.onWheelChange(color.hexString));
  }

  ngOnChanges() {
    this.update();
  }

  ngOnDestroy() {
    // every picker adds a stylesheet of its own to the document, which nothing takes
    // away again once the dialog is gone
    this.picker?.stylesheet?.style?.remove();
  }

  // what the wheel shows while nothing is picked and nothing can be derived
  private static readonly noColor = '#ffffff';

  // a color picked here is the item's own one -> picking switches the automatic off
  pick(color: string) {
    this.apply(color);
    this.update();
  }

  // a hex value only counts once it is a complete color
  pickHex(value: string) {
    this.hexValue = value;

    const color = ColorPickerComponent.parseHex(value);

    if (color) {
      this.pick(color);
    }
  }

  // leaving the field with something incomplete in it discards what was typed
  resetHex() {
    this.hexValue = this.shownColor;
  }

  setAuto(auto: boolean) {
    if (auto === this.auto) {
      return;
    }

    // taking the color into one's own hands starts from what the item is marked with
    // right now, so switching the automatic off is never a step into nothing
    if (!auto && !this.color) {
      this.color = this.shownColor || ColorPickerComponent.noColor;
      this.colorChange.emit(this.color);
    }

    this.auto = auto;
    this.autoChange.emit(auto);
    this.update();
  }

  private onWheelChange(color: string) {
    if (this.updating || !this.mounted) {
      return;
    }

    this.apply(color);
    this.hexValue = this.shownColor;
  }

  private apply(color: string) {
    if (color !== this.color) {
      this.color = color;
      this.colorChange.emit(color);
    }

    this.setAuto(false);
  }

  // show what the item is marked with, wherever the color came from
  private update() {
    this.hexValue = this.shownColor;

    if (!this.picker) {
      return;
    }

    this.updating = true;
    this.picker.color.hexString = this.shownColor || ColorPickerComponent.noColor;
    this.updating = false;
  }

  // "#abc", "abc", "#aabbcc" and "aabbcc" all name a color
  private static parseHex(value: string): string {
    const hex = (value || '').trim().replace(/^#/, '');

    if (/^[0-9a-f]{3}$/i.test(hex)) {
      return ('#' + hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]).toLowerCase();
    }

    return /^[0-9a-f]{6}$/i.test(hex) ? ('#' + hex).toLowerCase() : undefined;
  }
}
