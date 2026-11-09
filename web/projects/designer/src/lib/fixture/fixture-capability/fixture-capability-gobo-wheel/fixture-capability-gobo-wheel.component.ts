import {
  AfterViewChecked,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  QueryList,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { followFloatingPicker, placeFloatingPicker } from '../../../floating-picker';
import { CachedFixtureCapability } from '../../../models/cached-fixture-capability';
import { CachedFixtureChannel } from '../../../models/cached-fixture-channel';
import { turnsWheel, turnsWheelToAngle } from '../../../models/capability-position';
import { FixtureCapabilityType } from '../../../models/fixture-capability';
import { FixtureCapabilityValue } from '../../../models/fixture-capability-value';
import { FixtureProfile } from '../../../models/fixture-profile';
import { FixtureWheelSlotType } from '../../../models/fixture-wheel-slot';
import { GoboPatternChoice } from '../../../models/gobo-pattern-choice';
import {
  drawGoboPattern,
  getGoboPattern,
  getGoboPatternChoice,
  getShownGoboPattern,
  goboCatalog,
  GoboPattern,
} from '../../../preview/models/gobo';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { ProjectService } from '../../../services/project.service';

// The gobo wheel of a profile in the preset: the step being edited picks one of its slots, by its name (or its number)
// like the fixture library gives it, and shakes it from slow to fast, if the fixture can. A gobo is the model's own, so
// it only plays on fixtures of this profile.
//
// The fixture library has no pictures of the gobos, so the preview draws a pattern for each (see preview/models/gobo).
// The one a gobo picked shows with can be matched by hand from the patterns of the catalog: for all fixtures of the
// model. The patterns open on their own the first time a gobo is picked, which no pattern was matched to yet.
@Component({
  selector: 'lib-app-fixture-capability-gobo-wheel',
  templateUrl: './fixture-capability-gobo-wheel.component.html',
  styleUrls: ['./fixture-capability-gobo-wheel.component.css'],
  standalone: false,
})
export class FixtureCapabilityGoboWheelComponent implements AfterViewChecked, OnDestroy {
  // the gobos the patterns opened for on their own already, which they don't again (by profile, wheel and slot)
  private static offered = new Set<string>();

  _fixtureProfile: FixtureProfile;
  _channel: CachedFixtureChannel;
  wheelName: string;
  slotCapabilities: CachedFixtureCapability[] = [];

  readonly catalog = goboCatalog;
  pickingPattern = false;

  // the pattern of the gobo picked, which opens the patterns to match it with below it
  @ViewChild('patternToggle') patternToggle: ElementRef<HTMLElement>;

  // all pictures of gobos shown, drawn as soon as they show another pattern (see ngAfterViewChecked)
  @ViewChildren('goboCanvas') goboCanvases: QueryList<ElementRef<HTMLCanvasElement>>;

  // the patterns shown, by the key they are drawn by
  private patterns = new Map<string, GoboPattern>();

  // the patterns to pick from, over the panels, and what places them and closes them (see floating-picker)
  private pickerElement: HTMLElement;
  private stopFollowingPicker: () => void;

  @ViewChild('picker') set picker(picker: ElementRef<HTMLElement>) {
    const element = picker?.nativeElement;

    if (element === this.pickerElement) {
      return;
    }

    this.stopFollowing();
    this.pickerElement = element;

    if (element) {
      this.placePicker();
      this.stopFollowingPicker = followFloatingPicker(
        this.ngZone,
        () => this.pickerElement,
        () => this.patternToggle?.nativeElement,
        () => this.placePicker(),
        () => this.closePicker()
      );
    }
  }

  @Input()
  set profile(value: FixtureProfile) {
    this._fixtureProfile = value;
    this.update();
  }

  @Input()
  set channel(value: CachedFixtureChannel) {
    this._channel = value;
    this.update();
  }

  // the channels of a fixture of the profile, which may turn the wheel
  @Input()
  fixtureChannels: CachedFixtureChannel[] = [];

  constructor(
    private presetService: PresetService,
    private changeDetectorRef: ChangeDetectorRef,
    private livePreviewService: LivePreviewService,
    private projectService: ProjectService,
    private translateService: TranslateService,
    private ngZone: NgZone
  ) {}

  ngAfterViewChecked() {
    this.drawGobos();
  }

  ngOnDestroy() {
    this.stopFollowing();
  }

  private update() {
    this.slotCapabilities = [];
    this.wheelName = undefined;

    if (!this._fixtureProfile || !this._channel) {
      return;
    }

    // the slots a position of the channel picks, one per slot (a split between two slots or a slot shaking is left out)
    for (const capability of this._channel.capabilities) {
      if (capability.capability.type === FixtureCapabilityType.WheelSlot && capability.wheel) {
        this.wheelName = this.wheelName || capability.wheelName;

        if (capability.wheelName === this.wheelName && capability.wheelSlots.length === 1) {
          this.slotCapabilities.push(capability);
        }
      }
    }
  }

  // what kind of wheel it is: of gobos, of animations, of prisms, of frosts, of irises, or else another one
  get wheelKind(): string {
    const types = this.slotCapabilities.map((capability) => capability.wheelSlots[0]?.type);

    for (const [type, kind] of [
      [FixtureWheelSlotType.Gobo, 'gobo'],
      [FixtureWheelSlotType.AnimationGoboStart, 'animation'],
      [FixtureWheelSlotType.Prism, 'prism'],
      [FixtureWheelSlotType.Frost, 'frost'],
      [FixtureWheelSlotType.Iris, 'iris'],
    ] as [FixtureWheelSlotType, string][]) {
      if (types.indexOf(type) >= 0) {
        return kind;
      }
    }

    return 'other';
  }

  // ---- the rotation of the wheel (of the gobo picked) ----

  private get rotatingChannels(): CachedFixtureChannel[] {
    return (this.fixtureChannels || []).filter(
      (channel) => channel.channel && turnsWheel(channel, FixtureCapabilityType.WheelSlotRotation, this.wheelName)
    );
  }

  // can a fixture of the profile turn the gobo of this wheel, and turn it to an angle (index it)?
  canRotate(): boolean {
    return !!this.wheelName && this.rotatingChannels.length > 0;
  }

  canIndex(): boolean {
    return this.rotatingChannels.some((channel) => turnsWheelToAngle(channel, FixtureCapabilityType.WheelSlotRotation, this.wheelName));
  }

  private getRotationValue(): FixtureCapabilityValue {
    return this.presetService.getExactCapabilityValue(
      this.presetService.selectedStep,
      FixtureCapabilityType.WheelSlotRotation,
      this.wheelName,
      this._fixtureProfile?.uuid
    );
  }

  // how fast the gobo turns: anticlockwise below the middle, standing in it, clockwise above it (see capability-position)
  getRotation(): number {
    const value = this.getRotationValue();

    return value && value.valuePercentage >= 0 ? value.valuePercentage : 0.5;
  }

  // the angle the gobo is turned to and held at, if it is
  getAngle(): number {
    const value = this.getRotationValue();

    return typeof value?.valueDegrees === 'number' ? value.valueDegrees : undefined;
  }

  isRotating(): boolean {
    return !!this.getRotationValue();
  }

  private putRotation(change: (value: FixtureCapabilityValue) => void) {
    const value = new FixtureCapabilityValue();
    value.type = FixtureCapabilityType.WheelSlotRotation;
    value.wheel = this.wheelName;
    value.profileUuid = this._fixtureProfile?.uuid;
    change(value);
    this.presetService.putExactCapabilityValue(
      this.presetService.selectedStep,
      FixtureCapabilityType.WheelSlotRotation,
      this.wheelName,
      this._fixtureProfile?.uuid,
      value
    );
    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  setRotation(speed: any) {
    const number = Number(speed);

    if (speed === '' || speed === null || isNaN(number) || number < 0 || number > 1) {
      return;
    }

    this.putRotation((value) => (value.valuePercentage = number));
  }

  setAngle(angle: any) {
    const number = Number(angle);

    if (angle === '' || angle === null || isNaN(number)) {
      return;
    }

    this.putRotation((value) => (value.valueDegrees = number));
  }

  // the wheel left to the rest of the preset again
  stopRotation() {
    this.presetService.putExactCapabilityValue(
      this.presetService.selectedStep,
      FixtureCapabilityType.WheelSlotRotation,
      this.wheelName,
      this._fixtureProfile?.uuid,
      undefined
    );
    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  // what a slot is shown as: the name of its gobo, else what kind of slot it is, with its number
  getSlotName(capability: CachedFixtureCapability): string {
    const slot = capability.wheelSlots[0];

    return (
      capability.capability.slotNumber +
      (slot?.name ? ' ' + slot.name : slot?.type && slot.type !== FixtureWheelSlotType.Gobo ? ' ' + slot.type : '')
    );
  }

  getCurrentSlotNumber(): number {
    return this.presetService.getCapabilityValue(
      this.presetService.selectedStep,
      FixtureCapabilityType.WheelSlot,
      undefined,
      this.wheelName,
      this._fixtureProfile?.uuid
    )?.slotNumber;
  }

  // can the gobo picked shake?
  canShake(): boolean {
    const slotNumber = this.getCurrentSlotNumber();

    return (
      slotNumber !== undefined &&
      !!this._channel?.capabilities.some(
        (capability) =>
          capability.capability.type === FixtureCapabilityType.WheelShake &&
          (capability.capability.slotNumber === undefined || capability.capability.slotNumber === slotNumber)
      )
    );
  }

  // how fast the gobo picked shakes, 0 for not at all
  getShake(): number {
    return (
      this.presetService.getCapabilityValue(
        this.presetService.selectedStep,
        FixtureCapabilityType.WheelShake,
        undefined,
        this.wheelName,
        this._fixtureProfile?.uuid
      )?.valuePercentage ?? 0
    );
  }

  setShake(value: any) {
    const speed = Number(value);

    if (isNaN(speed) || speed < 0 || speed > 1 || !this.presetService.selectedStep) {
      return;
    }

    // shaking the gobo turns it on
    this.presetService.reactivateCapabilityValue(
      this.presetService.selectedStep,
      FixtureCapabilityType.WheelSlot,
      undefined,
      this.wheelName,
      this._fixtureProfile.uuid
    );
    this.putShake(speed);
    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  // shake the gobo picked at the passed speed, or stop shaking it at 0
  private putShake(speed: number) {
    if (speed > 0 && this.canShake()) {
      this.presetService.setCapabilityValue(
        this.presetService.selectedStep,
        FixtureCapabilityType.WheelShake,
        speed,
        this.getCurrentSlotNumber(),
        undefined,
        this.wheelName,
        this._fixtureProfile.uuid
      );
    } else {
      this.presetService.deleteCapabilityValue(
        this.presetService.selectedStep,
        FixtureCapabilityType.WheelShake,
        undefined,
        this.wheelName,
        this._fixtureProfile.uuid
      );
    }
  }

  selectSlotNumber(slotNumber: number) {
    const shake = this.getShake();

    // the first time a gobo without a pattern matched to it is picked, the patterns open to match one
    const capability = this.slotCapabilities.find((candidate) => candidate.capability.slotNumber === slotNumber);
    const offerKey = this._fixtureProfile?.uuid + '|' + this.wheelName + '|' + slotNumber;

    if (
      capability &&
      this.isGoboSlot(capability) &&
      !this.getPatternChoiceId(capability) &&
      !FixtureCapabilityGoboWheelComponent.offered.has(offerKey)
    ) {
      FixtureCapabilityGoboWheelComponent.offered.add(offerKey);
      this.pickingPattern = true;
    } else if (!capability || !this.isGoboSlot(capability)) {
      this.pickingPattern = false;
    }

    this.presetService.setCapabilityValue(
      this.presetService.selectedStep,
      FixtureCapabilityType.WheelSlot,
      undefined,
      slotNumber,
      undefined,
      this.wheelName,
      this._fixtureProfile.uuid
    );

    // the shake goes over to the gobo picked, if it can shake as well
    if (shake > 0) {
      this.putShake(shake);
    }

    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  // whether the step sets a slot of the wheel: it may keep one turned off (see played-values)
  isActive(): boolean {
    return this.presetService.hasActiveCapabilityValue(
      this.presetService.selectedStep,
      FixtureCapabilityType.WheelSlot,
      undefined,
      this.wheelName,
      this._fixtureProfile?.uuid
    );
  }

  // Turns the slot and its shake off, keeping them, or on again as they were (the first slot, if there wasn't one
  // yet). The rotation has a switch of its own.
  changeActive(active: boolean) {
    const step = this.presetService.selectedStep;
    const profileUuid = this._fixtureProfile.uuid;

    if (active) {
      if (!this.presetService.reactivateCapabilityValue(step, FixtureCapabilityType.WheelSlot, undefined, this.wheelName, profileUuid)) {
        // the first slot, which is open on most wheels
        this.selectSlotNumber(this.slotCapabilities[0]?.capability.slotNumber ?? 1);
        return;
      }

      this.presetService.reactivateCapabilityValue(step, FixtureCapabilityType.WheelShake, undefined, this.wheelName, profileUuid);
    } else {
      this.presetService.deactivateCapabilityValue(step, FixtureCapabilityType.WheelSlot, undefined, this.wheelName, profileUuid);
      this.presetService.deactivateCapabilityValue(step, FixtureCapabilityType.WheelShake, undefined, this.wheelName, profileUuid);
    }

    this.changeDetectorRef.detectChanges();
    this.livePreviewService.previewLive();
  }

  // ---- the pattern the preview shows a gobo with ----

  isGoboSlot(capability: CachedFixtureCapability): boolean {
    const type = capability.wheelSlots[0]?.type;

    return type === FixtureWheelSlotType.Gobo || type === FixtureWheelSlotType.AnimationGoboStart;
  }

  // the slot picked, if it is a gobo
  getCurrentGoboSlot(): CachedFixtureCapability {
    const slotNumber = this.getCurrentSlotNumber();

    return this.slotCapabilities.find((capability) => capability.capability.slotNumber === slotNumber && this.isGoboSlot(capability));
  }

  // the id of the pattern matched to the gobo by hand, undefined while it shows the one its name brings
  getPatternChoiceId(capability: CachedFixtureCapability): string {
    return getGoboPatternChoice(
      this.projectService.project?.goboPatterns,
      this._fixtureProfile?.uuid,
      this.wheelName,
      capability.capability.slotNumber
    )?.pattern;
  }

  // the pattern the preview shows the gobo with
  getShownPattern(capability: CachedFixtureCapability): GoboPattern {
    return getShownGoboPattern(
      this.projectService.project?.goboPatterns,
      this._fixtureProfile?.uuid,
      this.wheelName,
      capability.capability.slotNumber,
      capability.wheelSlots[0]?.name
    );
  }

  // the pattern the name of the gobo brings
  getAutomaticPattern(capability: CachedFixtureCapability): GoboPattern {
    return getGoboPattern(capability.wheelSlots[0]?.name, capability.capability.slotNumber);
  }

  // what a pattern of the catalog is called: its kind and how many points, dots, lines, ... it has (the kinds without
  // a count to tell are numbered)
  getPatternName(id: string): string {
    const entry = this.catalog.find((candidate) => candidate.id === id);

    if (!entry) {
      return '';
    }

    const family = entry.pattern.family;
    const number =
      family === 'breakup'
        ? this.catalog.filter((candidate) => candidate.pattern.family === family).indexOf(entry) + 1
        : entry.pattern.count;

    return this.translateService.instant('designer.fixture.gobo-family.' + family) + ' ' + number;
  }

  // the key a picture of a gobo is drawn by
  getPatternKey(pattern: GoboPattern): string {
    const key = pattern.family + ':' + pattern.count + ':' + pattern.seed;
    this.patterns.set(key, pattern);

    return key;
  }

  togglePicker() {
    this.pickingPattern = !this.pickingPattern;
  }

  // Close the patterns, also from a click elsewhere or Escape, which this card isn't drawn anew for on its own (it is
  // drawn when it changes, see selectSlotNumber)
  closePicker() {
    if (!this.pickingPattern) {
      return;
    }

    this.pickingPattern = false;
    this.changeDetectorRef.detectChanges();
  }

  // Show the gobo picked with the passed pattern of the catalog in the preview, or with the one its name brings again
  // (undefined), on all fixtures of the model
  pickPattern(id: string) {
    const capability = this.getCurrentGoboSlot();
    const project = this.projectService.project;

    this.closePicker();

    if (!capability || !project) {
      return;
    }

    const slotNumber = capability.capability.slotNumber;
    const others = (project.goboPatterns || []).filter(
      (choice) => choice.profileUuid !== this._fixtureProfile.uuid || choice.wheel !== this.wheelName || choice.slotNumber !== slotNumber
    );

    project.goboPatterns = id
      ? [...others, new GoboPatternChoice({ profileUuid: this._fixtureProfile.uuid, wheel: this.wheelName, slotNumber, pattern: id })]
      : others;
  }

  placePicker() {
    placeFloatingPicker(this.pickerElement, this.patternToggle?.nativeElement);
  }

  private stopFollowing() {
    if (this.stopFollowingPicker) {
      this.stopFollowingPicker();
      this.stopFollowingPicker = undefined;
    }
  }

  // Draw the pictures of the gobos which show another pattern than they were drawn with, as sharp as the screen shows
  // them
  private drawGobos() {
    const pixelRatio = window.devicePixelRatio || 1;

    this.goboCanvases?.forEach((element) => {
      const canvas = element.nativeElement;
      const pattern = this.patterns.get(canvas.dataset.key);
      const size = Math.round((canvas.clientWidth || Number(canvas.getAttribute('width')) || 32) * pixelRatio);
      const drawn = canvas.dataset.key + '@' + size;

      if (!pattern || canvas.dataset.drawn === drawn) {
        return;
      }

      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');

      if (context) {
        drawGoboPattern(context, pattern, size);
      }

      canvas.dataset.drawn = drawn;
    });
  }
}
