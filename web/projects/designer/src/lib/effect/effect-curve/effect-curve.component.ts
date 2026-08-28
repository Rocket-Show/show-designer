import { Component, ElementRef, Input, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { CachedFixtureChannel } from '../../models/cached-fixture-channel';
import { EffectCurveProfileChannels } from '../../models/effect-curve-profile-channel';
import { FixtureCapability, FixtureCapabilityColor, FixtureCapabilityType } from '../../models/fixture-capability';
import { FixtureProfile } from '../../models/fixture-profile';
import { FixtureService } from '../../services/fixture.service';
import { PresetService } from '../../services/preset.service';
import { EffectCurve } from './../../models/effect-curve';
import { AnimationService } from './../../services/animation.service';
import { EffectService } from '../../services/effect.service';
import { LivePreviewService } from '../../services/live-preview.service';
import { BsModalService } from 'ngx-bootstrap/modal';
import { EffectCurveAdvancedComponent } from './effect-curve-advanced/effect-curve-advanced.component';

// a capability checkbox, prepared for the template. the name and the checked state are
// calculated whenever they change instead of on each change detection cycle, because the
// sliders trigger change detection with each mouse move.
export interface CurveCapabilityOption {
  id: string;
  name: string;
  checked: boolean;
  capability: FixtureCapability;
}

// a channel checkbox, prepared for the template (see CurveCapabilityOption)
export interface CurveChannelOption {
  id: string;
  name: string;
  checked: boolean;
  profile: FixtureProfile;
  channel: CachedFixtureChannel;
}

@Component({
  selector: 'lib-app-effect-curve',
  templateUrl: './effect-curve.component.html',
  styleUrls: ['./effect-curve.component.css'],
  standalone: false,
})
export class EffectCurveComponent implements OnInit, OnDestroy {
  private animationFrameId: number;
  private ctx: any;
  private maxWidth: number;
  private maxHeight: number;

  public lengthMillisMin = 20;
  public lengthMillisMax = 8000;
  public amplitudeMin = 0;
  public amplitudeMax = 4;
  public percentageMin = 0;
  public percentageMax = 1;
  public phasingMillisMin = -1000;
  public phasingMillisMax = 1000;
  public phasingCyclesMin = -4;
  public phasingCyclesMax = 4;

  // the phase moves the curve inside its period, so a shift of a full period lands on
  // the same curve again -> the slider spans one period in each direction, whatever the
  // period is. it is set in cycles and shown in milliseconds.
  public phaseCyclesMin = -1;
  public phaseCyclesMax = 1;

  // the capabilities to choose from
  public capabilityOptions: CurveCapabilityOption[] = [];

  // the channels to choose from
  public channelOptions: CurveChannelOption[] = [];

  private availableChannels: Map<FixtureProfile, CachedFixtureChannel[]> = new Map<FixtureProfile, CachedFixtureChannel[]>();
  public availableProfiles: FixtureProfile[] = [];
  public selectedProfiles: FixtureProfile[] = [];

  private effectsOpenChangedSubscription: Subscription;
  private fixtureSelectionChangedSubscription: Subscription;
  private langChangeSubscription: Subscription;

  // whether this effect is the one currently opened in the accordion
  private effectSelected = false;

  // the number of fixtures the chase is distributed over. calculating it walks over all
  // fixtures of the project, which is far too expensive to repeat on each animation frame.
  private phasingCount = 0;
  private phasingCountMillis: number;

  @Input() curve: EffectCurve;

  // whether the effect is currently being edited (open) or not
  @Input()
  set isSelected(value: boolean) {
    this.effectSelected = value;

    if (value) {
      this.startAnimation();
    } else {
      this.stopAnimation();
    }
  }

  @ViewChild('curveGrid', { static: true }) curveGrid: ElementRef;

  constructor(
    public presetService: PresetService,
    private animationService: AnimationService,
    private fixtureService: FixtureService,
    private translate: TranslateService,
    private effectService: EffectService,
    private ngZone: NgZone,
    public livePreviewService: LivePreviewService,
    private modalService: BsModalService
  ) {
    this.fixtureSelectionChangedSubscription = this.presetService.fixtureSelectionChanged.subscribe(() => {
      this.updateCapabilitiesAndChannels();

      // the chase is spread over the fixtures of the preset
      this.phasingCountMillis = undefined;
    });

    this.langChangeSubscription = this.translate.onLangChange.subscribe(() => {
      this.updateOptionNames();
    });

    this.effectsOpenChangedSubscription = this.effectService.effectsOpenChanged.subscribe(() => {
      if (this.effectService.effectsOpen) {
        this.startAnimation();
      } else {
        this.stopAnimation();
      }
    });
  }

  ngOnInit() {
    // the capabilities and channels are checked against the curve, which is only available
    // once the inputs have been set
    this.updateCapabilitiesAndChannels();

    const canvas = this.curveGrid.nativeElement;
    this.ctx = canvas.getContext('2d');
    this.maxWidth = canvas.width;
    this.maxHeight = canvas.height;

    this.redraw();
  }

  ngOnDestroy() {
    this.stopAnimation();
    this.effectsOpenChangedSubscription.unsubscribe();
    this.fixtureSelectionChangedSubscription.unsubscribe();
    this.langChangeSubscription.unsubscribe();
  }

  private startAnimation() {
    if (this.animationFrameId !== undefined) {
      return;
    }

    // only the effect opened in the accordion of the opened effects tab is visible
    if (!this.effectSelected || !this.effectService.effectsOpen) {
      return;
    }

    // Avoid triggering change detection with each animation frame -> run outside zone.
    // requestAnimationFrame draws exactly once per frame and pauses in background tabs.
    this.ngZone.runOutsideAngular(() => {
      const animate = () => {
        this.redraw();
        this.animationFrameId = requestAnimationFrame(animate);
      };

      this.animationFrameId = requestAnimationFrame(animate);
    });
  }

  private stopAnimation() {
    if (this.animationFrameId !== undefined) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = undefined;
    }
  }

  private drawCurrentValue(currMillis: number, radius: number, lineWidth: number, durationMillis: number, maxHeight: number) {
    const value = this.curve.getValueAtMillis(currMillis);

    if (value === undefined) {
      // the curve has finished running and left the fixtures to the rest of the preset
      return;
    }

    const currVal = 1 - value;

    const x = (this.maxWidth * (currMillis % durationMillis)) / durationMillis;
    const y = maxHeight * currVal + lineWidth;

    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
    this.ctx.fillStyle = '#fff';
    this.ctx.fill();
    this.ctx.lineWidth = 1;
    this.ctx.strokeStyle = '#000';
    this.ctx.stroke();
  }

  private getPhasingCount(): number {
    if (!this.presetService.selectedPreset) {
      return 0;
    }

    // cache the count for a moment. it also depends on the addresses of the fixtures, which
    // can be changed without notifying this component.
    const nowMillis = Date.now();

    if (this.phasingCountMillis === undefined || nowMillis - this.phasingCountMillis > 500) {
      this.phasingCount = this.presetService.getPresetFixtureCount(this.presetService.selectedPreset);
      this.phasingCountMillis = nowMillis;
    }

    return this.phasingCount;
  }

  // the time the grid shows. it is the same window the preview repeats, so the marks on
  // the grid stay in step with the fixtures.
  private getGridDurationMillis(): number {
    const loopMillis = this.curve.getRunLoopMillis(this.getPhasingCount());

    if (loopMillis !== undefined) {
      return loopMillis;
    }

    return this.curve.lengthMillis * Math.max(Math.round(4 - this.curve.lengthMillis / 1000), 1);
  }

  redraw() {
    if (!this.ctx) {
      return;
    }

    this.ctx.clearRect(0, 0, this.maxWidth, this.maxHeight);
    this.ctx.fillStyle = '#fff';
    this.ctx.strokeStyle = '#fff';

    // the width of the lines
    const width = 3;

    this.ctx.lineWidth = width;

    const durationMillis = this.getGridDurationMillis();
    const maxHeight = this.maxHeight - width * 2;

    // sample the curve once per pixel of the grid. a finer resolution only produces line
    // segments the canvas cannot resolve anyway.
    const samples = Math.ceil(this.maxWidth);
    const stepMillis = durationMillis / samples;

    // draw the whole curve as a single path. stroking each segment on its own is by far the
    // most expensive part of the redraw and the redraw runs on each animation frame.
    this.ctx.beginPath();

    let drawing = false;

    for (let i = -2; i <= samples + 2; i++) {
      const millis = i * stepMillis;
      const value = this.curve.getValueAtMillis(millis);

      if (value === undefined) {
        // the curve does not apply here (before or after its run) -> leave a gap
        drawing = false;
        continue;
      }

      // Scale the values to the grid dimensions
      const x = (this.maxWidth * millis) / durationMillis;
      const y = maxHeight * (1 - value) + width;

      if (drawing) {
        this.ctx.lineTo(x, y);
      } else {
        this.ctx.moveTo(x, y);
        drawing = true;
      }
    }

    this.ctx.stroke();

    // draw the current value
    this.drawCurrentValue(this.animationService.timeMillis % durationMillis, 5, width, durationMillis, maxHeight);

    // draw the phasing values (chase), if required
    const phasingCount = this.getPhasingCount();

    if (this.curve.getPhasingMillis(1, phasingCount) === 0) {
      return;
    }

    for (let i = 1; i < phasingCount; i++) {
      // the phasing can be negative, which the modulo has to be normalized for
      const phasedMillis = this.animationService.timeMillis - this.curve.getPhasingMillis(i, phasingCount);

      this.drawCurrentValue(((phasedMillis % durationMillis) + durationMillis) % durationMillis, 3, width, durationMillis, maxHeight);
    }
  }

  private calculateChannelCapabilities() {
    this.availableChannels = this.presetService.getSelectedProfileChannels(this.selectedProfiles);
    this.updateChannelOptions();
  }

  changeProfileSelection($event: any, profile: FixtureProfile) {
    if (this.selectedProfiles.indexOf(profile) >= 0) {
      this.selectedProfiles.splice(this.selectedProfiles.indexOf(profile), 1);
    } else {
      this.selectedProfiles.push(profile);
    }

    this.calculateChannelCapabilities();
  }

  profileChecked(profile: FixtureProfile): boolean {
    return this.selectedProfiles.indexOf(profile) >= 0;
  }

  private updateCapabilitiesAndChannels() {
    // capabilities
    const availableCapabilities: FixtureCapability[] = [];

    if (this.presetService.hasCapabilityDimmer()) {
      const capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.Intensity;
      availableCapabilities.push(capability);
    }

    if (this.presetService.hasCapabilityColor()) {
      let capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.ColorIntensity;
      capability.color = FixtureCapabilityColor.Red;
      availableCapabilities.push(capability);

      capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.ColorIntensity;
      capability.color = FixtureCapabilityColor.Green;
      availableCapabilities.push(capability);

      capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.ColorIntensity;
      capability.color = FixtureCapabilityColor.Blue;
      availableCapabilities.push(capability);
    }

    if (this.presetService.hasCapabilityPanTilt()) {
      let capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.Pan;
      availableCapabilities.push(capability);

      capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.Tilt;
      availableCapabilities.push(capability);
    }

    this.capabilityOptions = availableCapabilities.map((capability, index) => ({
      id: 'capability_' + this.curve?.uuid + '_' + index,
      name: '',
      checked: this.capabilityChecked(capability),
      capability,
    }));

    this.updateCapabilityNames();

    // calculate all profiles
    this.availableProfiles = this.presetService.getSelectedProfiles();

    // select all profiles by default
    this.selectedProfiles = [...this.availableProfiles];

    // calculate all channels
    this.calculateChannelCapabilities();
  }

  private updateChannelOptions() {
    const channelOptions: CurveChannelOption[] = [];
    let profileIndex = 0;

    this.availableChannels.forEach((channels: CachedFixtureChannel[], profile: FixtureProfile) => {
      channels.forEach((channel: CachedFixtureChannel, channelIndex: number) => {
        channelOptions.push({
          id: 'channel_' + this.curve?.uuid + '_' + profileIndex + '_' + channelIndex,
          name: this.getChannelName(profile.name, channel.name),
          checked: this.channelChecked(profile, channel),
          profile,
          channel,
        });
      });

      profileIndex++;
    });

    this.channelOptions = channelOptions;
  }

  private updateOptionNames() {
    this.updateCapabilityNames();

    for (const option of this.channelOptions) {
      option.name = this.getChannelName(option.profile.name, option.channel.name);
    }
  }

  private updateCapabilityNames() {
    for (const option of this.capabilityOptions) {
      const capability = option.capability;
      const typeKey = 'designer.fixtureCapabilityType.' + capability.type;
      const colorKey = 'designer.fixtureCapabilityColor.' + capability.color;

      this.translate.get([typeKey, colorKey]).subscribe((result: any) => {
        option.name = capability.color ? result[typeKey] + ', ' + result[colorKey] : result[typeKey];
      });
    }
  }

  private capabilityChecked(capability: FixtureCapability): boolean {
    if (!this.curve) {
      return false;
    }

    for (const existingCapability of this.curve.capabilities) {
      if (
        this.fixtureService.capabilitiesMatch(
          existingCapability.type,
          capability.type,
          existingCapability.color,
          capability.color,
          null,
          null,
          null,
          null
        )
      ) {
        return true;
      }
    }
    return false;
  }

  toggleCapability(event: any, option: CurveCapabilityOption) {
    const capability = option.capability;

    if (event.currentTarget.checked) {
      // add the capability
      this.curve.capabilities.push(capability);
    } else {
      // Remove the channel
      for (let i = 0; i < this.curve.capabilities.length; i++) {
        const existingCapability = this.curve.capabilities[i];
        if (
          this.fixtureService.capabilitiesMatch(
            existingCapability.type,
            capability.type,
            existingCapability.color,
            capability.color,
            null,
            null,
            null,
            null
          )
        ) {
          this.curve.capabilities.splice(i, 1);
        }
      }
    }

    option.checked = this.capabilityChecked(capability);

    this.effectService.effectsChanged.next();
    this.livePreviewService.previewLive();
  }

  private getChannelName(profileName: string, channelName: string) {
    if (this.availableProfiles.length > 1) {
      return profileName + ' - ' + channelName;
    }

    return channelName;
  }

  private channelChecked(profile: FixtureProfile, channel: CachedFixtureChannel): boolean {
    if (!this.curve) {
      return false;
    }

    for (const profileChannels of this.curve.channels) {
      if (profileChannels.profileUuid === profile.uuid) {
        if (profileChannels.channels.includes(channel.name)) {
          return true;
        }

        break;
      }
    }

    return false;
  }

  toggleChannel(event: any, option: CurveChannelOption) {
    const profile = option.profile;
    const channel = option.channel;

    // add the profile, if necessary
    let profileContained = false;
    for (const profileChannels of this.curve.channels) {
      if (profileChannels.profileUuid === profile.uuid) {
        profileContained = true;
        break;
      }
    }

    if (!profileContained) {
      const profileChannels = new EffectCurveProfileChannels();
      profileChannels.profileUuid = profile.uuid;
      this.curve.channels.push(profileChannels);
    }

    // add or delete the channel
    for (const profileChannels of this.curve.channels) {
      if (profileChannels.profileUuid === profile.uuid) {
        const index = profileChannels.channels.indexOf(channel.name);

        if (index >= 0) {
          profileChannels.channels.splice(index, 1);
        } else {
          profileChannels.channels.push(channel.name);
        }

        break;
      }
    }

    option.checked = this.channelChecked(profile, channel);

    this.effectService.effectsChanged.next();
    this.livePreviewService.previewLive();
  }

  setLengthMillis(value: any) {
    if (!isNaN(value) && value >= this.lengthMillisMin && value <= this.lengthMillisMax) {
      this.curve.lengthMillis = +value;
      this.lengthMillisChanged();
    }
  }

  // the slider reports its value after it has changed, so the period cannot be bound to
  // it directly: the phase has to be brought along with the new period, not the old one
  setLengthMillisFromSlider(value: any) {
    if (isNaN(value)) {
      return;
    }

    this.curve.lengthMillis = Math.round(+value);
    this.lengthMillisChanged();
  }

  private lengthMillisChanged() {
    // the phase is bound to the period, which just changed under it
    this.wrapPhaseMillis();
    this.livePreviewService.previewLive();
  }

  // the phase repeats with the period: shifting the curve by a full period lands on the
  // same curve again. keeping it inside one period does not change what the curve puts
  // on its fixtures and keeps it on the scale of its slider.
  private wrapPhaseMillis() {
    if (this.curve.lengthMillis > 0 && Math.abs(this.curve.phaseMillis) > this.curve.lengthMillis) {
      this.curve.phaseMillis = Math.round(this.curve.phaseMillis % this.curve.lengthMillis);
    }
  }

  // the phase as the part of the period it shifts the curve by
  get phaseCycles(): number {
    if (!this.curve.lengthMillis) {
      return 0;
    }

    return this.curve.phaseMillis / this.curve.lengthMillis;
  }

  setPhaseCycles(value: any) {
    if (isNaN(value)) {
      return;
    }

    this.curve.phaseMillis = Math.round(+value * this.curve.lengthMillis);
    this.livePreviewService.previewLive();
  }

  setAmplitude(value: any) {
    if (!isNaN(value) && value >= this.amplitudeMin && value <= this.amplitudeMax) {
      this.curve.amplitude = +value;
      this.livePreviewService.previewLive();
    }
  }

  setPosition(value: any) {
    if (!isNaN(value) && value >= this.percentageMin && value <= this.percentageMax) {
      this.curve.position = +value;
      this.livePreviewService.previewLive();
    }
  }

  setPhaseMillis(value: any) {
    if (!isNaN(value) && Math.abs(value) <= this.curve.lengthMillis) {
      this.curve.phaseMillis = +value;
      this.livePreviewService.previewLive();
    }
  }

  setPhasingMillis(value: any) {
    if (!isNaN(value) && value >= this.phasingMillisMin && value <= this.phasingMillisMax) {
      this.curve.phasingMillis = +value;
      this.livePreviewService.previewLive();
    }
  }

  setPhasingCycles(value: any) {
    if (!isNaN(value) && value >= this.phasingCyclesMin && value <= this.phasingCyclesMax) {
      this.curve.phasingCycles = +value;
      this.livePreviewService.previewLive();
    }
  }

  setPhasingMode(phasingMode: string) {
    this.curve.phasingMode = phasingMode;
    this.livePreviewService.previewLive();
  }

  // whether the advanced settings hold anything else than their defaults. the button
  // marks it, so settings that are not on this screen are not lost out of sight.
  advancedActive(): boolean {
    return (
      this.curve.runMode !== 'infinite' || (this.curve.hasDutyCycle() && this.curve.dutyCycle !== 0.5) || this.curve.phasingGroupSize !== 1
    );
  }

  openAdvanced() {
    this.modalService.show(EffectCurveAdvancedComponent, {
      keyboard: true,
      ignoreBackdropClick: false,
      class: '',
      initialState: { curve: this.curve },
    });
  }
}
