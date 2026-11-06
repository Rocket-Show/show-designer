import { Component, ElementRef, EventEmitter, Input, OnChanges, Optional, Output, ViewChild } from '@angular/core';
import { ColorService } from '../services/color.service';

// a color at its place along a gradient, from 0 (the left end) to 1 (the right one)
export interface GradientStop {
  position: number;
  color: string;
}

// how far below the stops a stop is dragged to take it away, in CSS pixels
const REMOVE_DISTANCE = 28;

// the steps a stop moves in: with the mouse, with an arrow key and with shift held as well
const POSITION_STEP = 0.01;
const POSITION_STEP_LARGE = 0.1;

/**
 * Edits the colors of a gradient the way image editors do: the gradient as a bar, each of
 * its colors a stop below it. A stop is dragged along the bar to move its color, dragged
 * down off it to take it away, and a click on the bar adds a color where it went, mixed
 * from its neighbours. The stop picked last is set up below the bar: its color with the
 * color picker of the designer, its place as a number.
 *
 * The stops are never put in another order: whatever shows the gradient sorts them by their
 * places. Each change comes out as new stops, while a stop is being dragged as well.
 */
@Component({
  selector: 'lib-app-gradient-editor',
  templateUrl: './gradient-editor.component.html',
  styleUrls: ['./gradient-editor.component.css'],
  standalone: false,
})
export class GradientEditorComponent implements OnChanges {
  @Input() stops: GradientStop[] = [];

  @Output() stopsChange = new EventEmitter<GradientStop[]>();

  // what the bar shows (a CSS background), where the gradient is not blended smoothly from
  // one stop to the next one
  @Input() background: string;

  // how many stops are kept at least, and added at most
  @Input() minStops = 2;
  @Input() maxStops = 16;

  // the colors the color picker offers for a quick choice
  @Input() swatches: string[];

  @ViewChild('track', { static: true }) trackRef: ElementRef<HTMLElement>;

  // the stop set up below the bar
  selected = 0;

  // the color picker is open for the selected stop
  pickingColor = false;

  // the stop which is taken away when the drag ends here (-1: none)
  leaving = -1;

  // what the place of the selected stop is typed as (in percent), and its color
  percent = '';
  hex = '';

  private dragged = -1;

  constructor(@Optional() private colorService?: ColorService) {}

  ngOnChanges() {
    this.selected = Math.max(0, Math.min(this.selected, (this.stops || []).length - 1));
    this.updateFields();
  }

  get selectedStop(): GradientStop {
    return (this.stops || [])[this.selected];
  }

  get pickerSwatches(): string[] {
    return this.swatches || this.colorService?.pickerColors || [];
  }

  get barBackground(): string {
    return this.background || gradientCss(this.stops || []);
  }

  canRemove(): boolean {
    return (this.stops || []).length > this.minStops;
  }

  // ---- the stops on the bar --------------------------------------------------

  select(index: number) {
    if (index !== this.selected) {
      this.selected = index;
      this.updateFields();
    }
  }

  // a stop is picked up: it follows the mouse along the bar, and away from it to be taken away
  startDrag(index: number, event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.select(index);
    this.dragged = index;
    this.leaving = -1;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    (event.currentTarget as HTMLElement)?.focus?.();
  }

  drag(event: PointerEvent) {
    if (this.dragged < 0) {
      return;
    }

    const bounds = this.trackRef.nativeElement.getBoundingClientRect();

    this.leaving = this.canRemove() && event.clientY > bounds.bottom + REMOVE_DISTANCE ? this.dragged : -1;
    this.moveTo(this.dragged, this.positionAt(event.clientX));
  }

  endDrag() {
    if (this.dragged < 0) {
      return;
    }

    const leaving = this.leaving;

    this.dragged = -1;
    this.leaving = -1;

    if (leaving >= 0) {
      this.remove(leaving);
    }
  }

  // a click on the bar (or between the stops) adds a color there, picked up to be dragged on
  add(event: PointerEvent) {
    const stops = this.stops || [];

    if (stops.length >= this.maxStops) {
      return;
    }

    const position = this.positionAt(event.clientX);

    this.emit([...stops, { position, color: colorAt(stops, position) }]);
    this.selected = stops.length;
    this.pickingColor = false;
    this.updateFields();
    this.startDrag(this.selected, event);
  }

  remove(index: number) {
    if (!this.canRemove()) {
      return;
    }

    this.emit(this.stops.filter((stop, i) => i !== index));
    this.selected = Math.max(0, Math.min(this.selected > index ? this.selected - 1 : this.selected, this.stops.length - 1));
    this.pickingColor = false;
    this.updateFields();
  }

  // the arrows move a stop, delete takes it away, enter picks its color
  onKey(index: number, event: KeyboardEvent) {
    const step = event.shiftKey ? POSITION_STEP_LARGE : POSITION_STEP;

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        this.moveTo(index, this.stops[index].position - step);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        this.moveTo(index, this.stops[index].position + step);
        break;
      case 'Home':
        this.moveTo(index, 0);
        break;
      case 'End':
        this.moveTo(index, 1);
        break;
      case 'Delete':
      case 'Backspace':
        this.remove(index);
        break;
      case 'Enter':
        this.select(index);
        this.pickingColor = true;
        break;
      default:
        return;
    }

    event.preventDefault();
  }

  // ---- the selected stop ------------------------------------------------------

  setColor(color: string, updateTyped = true) {
    if (/^#[0-9a-fA-F]{6}$/.test(color || '') && this.selectedStop && color.toLowerCase() !== this.selectedStop.color) {
      this.emit(this.stops.map((stop, i) => (i === this.selected ? { position: stop.position, color: color.toLowerCase() } : stop)));
    }

    if (updateTyped) {
      this.updateFields();
    }
  }

  // a color typed as its hex value, which counts once it is complete: "#abc", "abc",
  // "#aabbcc" or "aabbcc"
  setHex(value: string) {
    this.hex = value;

    const hex = (value || '').trim().replace(/^#/, '');
    const full = /^[0-9a-f]{3}$/i.test(hex) ? hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] : hex;

    if (/^[0-9a-f]{6}$/i.test(full)) {
      this.setColor('#' + full, false);
    }
  }

  resetHex() {
    this.updateFields();
  }

  // a place typed in percent, which counts once it is a number
  setPercent(value: string) {
    this.percent = value;

    const percent = parseFloat(String(value).replace(',', '.'));

    if (!isNaN(percent) && this.selectedStop) {
      this.moveTo(this.selected, percent / 100, false);
    }
  }

  resetPercent() {
    this.updateFields();
  }

  // ---- helpers ----------------------------------------------------------------

  private moveTo(index: number, position: number, updateTyped = true) {
    const place = roundPosition(position);

    if (place !== this.stops[index].position) {
      this.emit(this.stops.map((stop, i) => (i === index ? { position: place, color: stop.color } : stop)));
    }

    if (updateTyped) {
      this.updateFields();
    }
  }

  private positionAt(clientX: number): number {
    const bounds = this.trackRef.nativeElement.getBoundingClientRect();

    return roundPosition(bounds.width > 0 ? (clientX - bounds.left) / bounds.width : 0);
  }

  private emit(stops: GradientStop[]) {
    this.stops = stops;
    this.stopsChange.emit(stops);
  }

  // what the fields of the selected stop show
  private updateFields() {
    const stop = this.selectedStop;

    this.percent = stop ? String(Math.round(stop.position * 100)) : '';
    this.hex = stop ? stop.color : '';
  }
}

// a place between 0 and 1, in hundredths (the steps a stop moves in)
function roundPosition(position: number): number {
  return Math.round(Math.max(0, Math.min(1, position)) / POSITION_STEP) / Math.round(1 / POSITION_STEP);
}

function sortedStops(stops: GradientStop[]): GradientStop[] {
  return stops.slice().sort((stop1, stop2) => stop1.position - stop2.position);
}

// the gradient of the stops blended smoothly, as a CSS background
export function gradientCss(stops: GradientStop[]): string {
  const sorted = sortedStops(stops);

  if (sorted.length === 0) {
    return 'transparent';
  }

  if (sorted.length === 1) {
    return sorted[0].color;
  }

  return 'linear-gradient(90deg, ' + sorted.map((stop) => stop.color + ' ' + Math.round(stop.position * 1000) / 10 + '%').join(', ') + ')';
}

// the color the stops blend to at a place, as #rrggbb
export function colorAt(stops: GradientStop[], position: number): string {
  const sorted = sortedStops(stops);

  if (sorted.length === 0) {
    return '#ffffff';
  }

  if (position <= sorted[0].position) {
    return sorted[0].color;
  }

  for (let i = 1; i < sorted.length; i++) {
    if (position <= sorted[i].position) {
      const width = sorted[i].position - sorted[i - 1].position;
      const share = width > 0 ? (position - sorted[i - 1].position) / width : 1;
      const from = rgbOf(sorted[i - 1].color);
      const to = rgbOf(sorted[i].color);

      return '#' + from.map((value, channel) => hex2(value + (to[channel] - value) * share)).join('');
    }
  }

  return sorted[sorted.length - 1].color;
}

function rgbOf(color: string): number[] {
  const hex = /^#[0-9a-fA-F]{6}$/.test(color || '') ? color.slice(1) : 'ffffff';

  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function hex2(value: number): string {
  const rounded = Math.max(0, Math.min(255, Math.round(value)));

  return (rounded < 16 ? '0' : '') + rounded.toString(16);
}
