import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { FixtureCapabilityType } from '../../../models/fixture-capability';
import { FixtureCapabilityValue } from '../../../models/fixture-capability-value';
import { defaultPanRangeDegrees, defaultTiltRangeDegrees, getAxisRange, hasAim } from '../../../models/pan-tilt';
import { FixtureService } from '../../../services/fixture.service';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { PreviewService } from '../../../services/preview.service';

// the size of the square the position is dragged in
const padSize = 200;

// Where the step being edited points the moving heads: in degrees from the middle of what they reach, dragged in a
// square (the pan across, the tilt up and down) or typed in, which points every model the same way (see pan-tilt). The
// heads can be fanned out over a number of degrees, or point at a spot on the stage picked in the 3D preview from
// wherever they hang. The mirror belongs to the whole preset.
@Component({
  selector: 'lib-app-fixture-capability-pan-tilt',
  templateUrl: './fixture-capability-pan-tilt.component.html',
  styleUrls: ['./fixture-capability-pan-tilt.component.css'],
  standalone: false,
})
export class FixtureCapabilityPanTiltComponent implements OnInit, OnDestroy {
  readonly pan = FixtureCapabilityType.Pan;
  readonly tilt = FixtureCapabilityType.Tilt;
  readonly padSize = padSize;

  // what the square reaches on each axis: the most any moving head of the preset reaches, in degrees
  panRange = defaultPanRangeDegrees;
  tiltRange = defaultTiltRangeDegrees;

  private dragging = false;
  private subscriptions: Subscription[] = [];

  constructor(
    private presetService: PresetService,
    private fixtureService: FixtureService,
    private previewService: PreviewService,
    private changeDetectorRef: ChangeDetectorRef,
    private livePreviewService: LivePreviewService
  ) {}

  ngOnInit() {
    this.updateRanges();

    this.subscriptions.push(
      this.presetService.fixtureSelectionChanged.subscribe(() => this.updateRanges()),
      this.previewService.spotPicked.subscribe((spot) => this.aimAt(spot))
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());

    // a spot picked after the panel is gone would aim nothing
    this.previewService.pickSpot(false);
  }

  // the most the moving heads of the preset reach on each axis
  private updateRanges() {
    let panRange = 0;
    let tiltRange = 0;

    for (const presetFixture of this.presetService.selectedPreset?.fixtures || []) {
      const fixture = this.fixtureService.getCachedFixtureByUuid(presetFixture.fixtureUuid, presetFixture.pixelKey);

      for (const channel of fixture?.channels || []) {
        panRange = Math.max(panRange, Math.abs(getAxisRange(channel, FixtureCapabilityType.Pan) ?? 0));
        tiltRange = Math.max(tiltRange, Math.abs(getAxisRange(channel, FixtureCapabilityType.Tilt) ?? 0));
      }
    }

    this.panRange = panRange || defaultPanRangeDegrees;
    this.tiltRange = tiltRange || defaultTiltRangeDegrees;
  }

  private getValue(type: FixtureCapabilityType): FixtureCapabilityValue {
    return this.presetService.getCapabilityValue(this.presetService.selectedStep, type);
  }

  private getRange(type: FixtureCapabilityType): number {
    return type === FixtureCapabilityType.Pan ? this.panRange : this.tiltRange;
  }

  isActive(): boolean {
    return !!this.getValue(FixtureCapabilityType.Pan) || !!this.getValue(FixtureCapabilityType.Tilt);
  }

  // the degrees the step points the heads at on an axis, from the middle of what they reach, or undefined if it
  // doesn't (a position of a project before the degrees is shown on the widest of the heads)
  getDegrees(type: FixtureCapabilityType): number {
    const value = this.getValue(type);

    if (!value) {
      return undefined;
    }

    if (typeof value.valueDegrees === 'number') {
      return value.valueDegrees;
    }

    return value.valuePercentage >= 0 ? (value.valuePercentage - 0.5) * this.getRange(type) : undefined;
  }

  getDegreesText(type: FixtureCapabilityType): number {
    const degrees = this.getDegrees(type);

    return degrees === undefined ? 0 : Math.round(degrees * 10) / 10;
  }

  // change the value of the step on an axis, keeping what else it says
  private change(type: FixtureCapabilityType, change: (value: FixtureCapabilityValue) => void) {
    const step = this.presetService.selectedStep;

    if (!step) {
      return;
    }

    const existing = this.getValue(type);
    const value = new FixtureCapabilityValue(existing ? { ...existing } : { type });
    change(value);
    this.presetService.putCapabilityValue(step, value);

    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  // point the heads at the passed degrees on an axis, as far as they reach. Pointing them stops aiming at a spot.
  setDegrees(type: FixtureCapabilityType, degrees: any) {
    const number = Number(degrees);

    if (degrees === '' || degrees === null || isNaN(number)) {
      return;
    }

    const half = this.getRange(type) / 2;
    this.stopAiming();
    this.change(type, (value) => {
      value.valueDegrees = Math.max(Math.min(number, half), -half);
      value.valuePercentage = undefined;
    });
  }

  getSpread(type: FixtureCapabilityType): number {
    return this.getValue(type)?.spreadDegrees ?? 0;
  }

  // fan the heads out over the passed degrees on an axis, from the first to the last of them
  setSpread(type: FixtureCapabilityType, spread: any) {
    const number = Number(spread);

    if (spread === '' || spread === null || isNaN(number)) {
      return;
    }

    if (!this.getValue(type)) {
      // a fan around the middle
      this.change(type, (value) => (value.valueDegrees = 0));
    }

    this.change(type, (value) => (value.spreadDegrees = number === 0 ? undefined : number));
  }

  // ---- the square ----

  // where the position is in the square, the pan across and the tilt up
  getPadX(): number {
    return padSize / 2 + ((this.getDegrees(FixtureCapabilityType.Pan) ?? 0) / (this.panRange / 2)) * (padSize / 2);
  }

  getPadY(): number {
    return padSize / 2 - ((this.getDegrees(FixtureCapabilityType.Tilt) ?? 0) / (this.tiltRange / 2)) * (padSize / 2);
  }

  // point the heads at where the pointer is in the square
  private setPadPosition(event: PointerEvent) {
    const bounds = (event.currentTarget as Element).getBoundingClientRect();

    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }

    const x = Math.max(Math.min((event.clientX - bounds.left) / bounds.width, 1), 0);
    const y = Math.max(Math.min((event.clientY - bounds.top) / bounds.height, 1), 0);

    this.setDegrees(FixtureCapabilityType.Pan, Math.round((x - 0.5) * this.panRange * 10) / 10);
    this.setDegrees(FixtureCapabilityType.Tilt, Math.round((0.5 - y) * this.tiltRange * 10) / 10);
  }

  padDown(event: PointerEvent) {
    this.dragging = true;

    try {
      // the square keeps the pointer while it is dragged out of it
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    } catch {
      // a pointer the browser doesn't know (anymore) can't be kept
    }

    this.setPadPosition(event);
  }

  padMove(event: PointerEvent) {
    if (this.dragging) {
      this.setPadPosition(event);
    }
  }

  padUp() {
    this.dragging = false;
  }

  // straight ahead again
  padCenter() {
    this.setDegrees(FixtureCapabilityType.Pan, 0);
    this.setDegrees(FixtureCapabilityType.Tilt, 0);
  }

  // the arrow keys move the position by a degree, by ten with the shift key
  padKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 10 : 1;
    const moves: { [key: string]: [FixtureCapabilityType, number] } = {
      ArrowLeft: [FixtureCapabilityType.Pan, -step],
      ArrowRight: [FixtureCapabilityType.Pan, step],
      ArrowUp: [FixtureCapabilityType.Tilt, step],
      ArrowDown: [FixtureCapabilityType.Tilt, -step],
    };
    const move = moves[event.key];

    if (!move) {
      return;
    }

    event.preventDefault();
    this.setDegrees(move[0], (this.getDegrees(move[0]) ?? 0) + move[1]);
  }

  // ---- a spot on the stage ----

  isAiming(): boolean {
    const value = this.getValue(FixtureCapabilityType.Pan);

    return !!value && hasAim(value);
  }

  isPickingSpot(): boolean {
    return this.previewService.pickingSpot;
  }

  // pick the spot to aim at with the next click into the 3D preview
  pickSpot() {
    this.previewService.pickSpot(!this.previewService.pickingSpot);
  }

  getAim(index: number): number {
    const value = this.getValue(FixtureCapabilityType.Pan);

    return value ? [value.aimX, value.aimY, value.aimZ][index] : undefined;
  }

  // aim the heads at the passed spot on the stage (in cm)
  aimAt(spot: number[]) {
    if (!this.presetService.selectedStep || !spot || spot.some((coordinate) => typeof coordinate !== 'number' || isNaN(coordinate))) {
      return;
    }

    for (const type of [FixtureCapabilityType.Pan, FixtureCapabilityType.Tilt]) {
      this.change(type, (value) => {
        [value.aimX, value.aimY, value.aimZ] = spot;

        if (typeof value.valueDegrees !== 'number' && !(value.valuePercentage >= 0)) {
          // where the heads point again once they stop aiming
          value.valueDegrees = 0;
        }
      });
    }
  }

  // move the spot along one of its axes
  setAim(index: number, coordinate: any) {
    const number = Number(coordinate);

    if (coordinate === '' || coordinate === null || isNaN(number) || !this.isAiming()) {
      return;
    }

    const spot = [0, 1, 2].map((axis) => (axis === index ? number : this.getAim(axis)));
    this.aimAt(spot);
  }

  // point the heads where they pointed before they aimed at the spot
  stopAiming() {
    for (const type of [FixtureCapabilityType.Pan, FixtureCapabilityType.Tilt]) {
      const value = this.getValue(type);

      if (value && hasAim(value)) {
        this.change(type, (changed) => {
          changed.aimX = undefined;
          changed.aimY = undefined;
          changed.aimZ = undefined;
        });
      }
    }
  }

  // ---- the mirror ----

  // the mirror belongs to the whole preset, not to the step being edited: it flips
  // everything the preset puts on that axis, its steps and its effects alike
  getMirrorPan(): boolean {
    return this.presetService.selectedPreset ? this.presetService.selectedPreset.mirrorPan : false;
  }

  setMirrorPan(mirror: boolean) {
    if (!this.presetService.selectedPreset) {
      return;
    }

    this.presetService.selectedPreset.mirrorPan = mirror;
    this.mirrorChanged();
  }

  getMirrorTilt(): boolean {
    return this.presetService.selectedPreset ? this.presetService.selectedPreset.mirrorTilt : false;
  }

  setMirrorTilt(mirror: boolean) {
    if (!this.presetService.selectedPreset) {
      return;
    }

    this.presetService.selectedPreset.mirrorTilt = mirror;
    this.mirrorChanged();
  }

  // the channels show what the capabilities put on them, so they follow the mirror
  private mirrorChanged() {
    this.presetService.capabilityValuesChanged.next();
    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  changeActive(active: boolean) {
    if (active) {
      // straight ahead
      this.padCenter();
      return;
    }

    this.previewService.pickSpot(false);
    this.presetService.deleteCapabilityValue(this.presetService.selectedStep, FixtureCapabilityType.Pan);
    this.presetService.deleteCapabilityValue(this.presetService.selectedStep, FixtureCapabilityType.Tilt);
    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }
}
