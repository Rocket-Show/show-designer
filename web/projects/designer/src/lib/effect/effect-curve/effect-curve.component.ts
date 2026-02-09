import { Component, ElementRef, Input, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Observable, Subscription, timer } from 'rxjs';
import { map } from 'rxjs/operators';
import { CachedFixtureChannel } from '../../models/cached-fixture-channel';
import { EffectCurveProfileChannels } from '../../models/effect-curve-profile-channel';
import { FixtureCapability, FixtureCapabilityColor, FixtureCapabilityType } from '../../models/fixture-capability';
import { FixtureProfile } from '../../models/fixture-profile';
import { FixtureService } from '../../services/fixture.service';
import { PresetService } from '../../services/preset.service';
import { EffectCurve } from './../../models/effect-curve';
import { AnimationService } from './../../services/animation.service';
import { EffectService } from '../../services/effect.service';

@Component({
  selector: 'lib-app-effect-curve',
  templateUrl: './effect-curve.component.html',
  styleUrls: ['./effect-curve.component.css'],
  standalone: false,
})
export class EffectCurveComponent implements OnInit, OnDestroy {
  private gridUpdateSubscription: Subscription;
  private ctx: any;
  private maxWidth: number;
  private maxHeight: number;

  public lengthMillisMin = 20;
  public lengthMillisMax = 8000;
  public amplitudeMin = 0;
  public amplitudeMax = 4;
  public percentageMin = 0;
  public percentageMax = 1;
  public phaseMillisMin = -1000;
  public phaseMillisMax = 1000;
  public phasingMillisMin = 0;
  public phasingMillisMax = 1000;

  // the selected capabilities
  public availableCapabilities: FixtureCapability[] = [];

  // the selected channels
  public availableChannels: Map<FixtureProfile, CachedFixtureChannel[]> = new Map<FixtureProfile, CachedFixtureChannel[]>();
  public availableProfiles: FixtureProfile[] = [];
  public selectedProfiles: FixtureProfile[] = [];

  private effectsOpenChangedSubscription: Subscription;

  @Input() curve: EffectCurve;

  // whether the effect is currently being edited (open) or not
  @Input()
  set isSelected(value: boolean) {
    if (value) {
      this.startUpdateTimer();
    } else {
      this.stopUpdateTimer();
    }
  }

  @ViewChild('curveGrid', { static: true }) curveGrid: ElementRef;

  constructor(
    public presetService: PresetService,
    private animationService: AnimationService,
    private fixtureService: FixtureService,
    private translate: TranslateService,
    private effectService: EffectService,
    private ngZone: NgZone
  ) {
    this.presetService.fixtureSelectionChanged.subscribe(() => {
      this.updateCapabilitiesAndChannels();
    });

    this.updateCapabilitiesAndChannels();

    this.effectsOpenChangedSubscription = this.effectService.effectsOpenChanged.subscribe(() => {
      if (this.effectService.effectsOpen) {
        this.startUpdateTimer();
      } else {
        this.stopUpdateTimer();
      }
    });
    if (this.effectService.effectsOpen) {
      this.startUpdateTimer();
    }
  }

  ngOnInit() {
    const canvas = this.curveGrid.nativeElement;
    this.ctx = canvas.getContext('2d');
    this.maxWidth = canvas.width;
    this.maxHeight = canvas.height;

    this.redraw();
  }

  ngOnDestroy() {
    this.stopUpdateTimer();
    this.effectsOpenChangedSubscription.unsubscribe();
  }

  private startUpdateTimer() {
    if (!this.gridUpdateSubscription) {
      // Avoid triggering change detection with each animation frame -> run outside zone
      this.ngZone.runOutsideAngular(() => {
        this.gridUpdateSubscription = timer(0, 15).subscribe(() => {
          this.redraw();
        });
      });
    }
  }

  private stopUpdateTimer() {
    if (this.gridUpdateSubscription) {
      this.gridUpdateSubscription.unsubscribe();
      this.gridUpdateSubscription = undefined;
    }
  }

  private drawCurrentValue(currMillis: number, radius: number, lineWidth: number, durationMillis: number, maxHeight: number) {
    const currVal = 1 - this.curve.getValueAtMillis(currMillis);

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
    let count = 0;
    const countedFirstDmxChannelPixelKey: any[] = [];

    for (const presetFixture of this.presetService.selectedPreset.fixtures) {
      const fixture = this.fixtureService.getFixtureByUuid(presetFixture.fixtureUuid);
      const firstDmxChannelAndFixtureUuid = {
        firstDmxChannel: fixture.dmxFirstChannel,
        pixelKey: presetFixture.pixelKey,
      };

      const exists = countedFirstDmxChannelPixelKey.some(
        (item) =>
          item.firstDmxChannel === firstDmxChannelAndFixtureUuid.firstDmxChannel &&
          ((!item.pixelKey && !firstDmxChannelAndFixtureUuid.pixelKey) || item.pixelKey === firstDmxChannelAndFixtureUuid.pixelKey)
      );

      // don't count it, if it has the same DMX address and pixel key (if available),
      // as an already counted one
      if (!exists) {
        count++;
        countedFirstDmxChannelPixelKey.push(firstDmxChannelAndFixtureUuid);
      }
    }

    return count;
  }

  redraw() {
    this.ctx.clearRect(0, 0, this.maxWidth, this.maxHeight);
    this.ctx.fillStyle = '#fff';
    this.ctx.strokeStyle = '#fff';

    // the width of the lines
    const width = 3;

    this.ctx.lineWidth = width;

    let oldX: number;
    let oldY: number;

    let step = 50;

    if (length < 500) {
      step = 5;
    }

    const durationMillis = this.curve.lengthMillis * Math.max(Math.round(4 - this.curve.lengthMillis / 1000), 1);
    const maxHeight = this.maxHeight - width * 2;

    // draw the curve
    for (let i = -step * 2; i < durationMillis + step * 2; i += step) {
      const val = 1 - this.curve.getValueAtMillis(i);

      // Scale the values to the grid dimensions
      const x = (this.maxWidth * i) / durationMillis;
      const y = maxHeight * val + width;

      if (oldY) {
        this.ctx.beginPath();
        this.ctx.moveTo(oldX, oldY);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
      }

      oldX = x;
      oldY = y;
    }

    // draw the current value
    this.drawCurrentValue(this.animationService.timeMillis % durationMillis, 5, width, durationMillis, maxHeight);

    // draw the phasing values (chase), if required
    let phasingCount = 0;

    if (this.curve.phasingMillis > 0 && this.presetService.selectedPreset) {
      phasingCount = this.getPhasingCount();
    }

    for (let i = 1; i < phasingCount; i++) {
      this.drawCurrentValue(
        (this.animationService.timeMillis - i * this.curve.phasingMillis) % durationMillis,
        3,
        width,
        durationMillis,
        maxHeight
      );
    }
  }

  private calculateChannelCapabilities() {
    this.availableChannels = this.presetService.getSelectedProfileChannels(this.selectedProfiles);
  }

  changeProfileSelection($event: any, profile: FixtureProfile) {
    if (this.selectedProfiles.indexOf(profile) >= 0) {
      this.selectedProfiles.splice(this.selectedProfiles.indexOf(profile), 1);
    } else {
      this.selectedProfiles.push(profile);
    }

    this.calculateChannelCapabilities();
  }

  private updateCapabilitiesAndChannels() {
    // capabilities
    this.availableCapabilities = [];

    if (this.presetService.hasCapabilityDimmer()) {
      const capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.Intensity;
      this.availableCapabilities.push(capability);
    }

    if (this.presetService.hasCapabilityColor()) {
      let capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.ColorIntensity;
      capability.color = FixtureCapabilityColor.Red;
      this.availableCapabilities.push(capability);

      capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.ColorIntensity;
      capability.color = FixtureCapabilityColor.Green;
      this.availableCapabilities.push(capability);

      capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.ColorIntensity;
      capability.color = FixtureCapabilityColor.Blue;
      this.availableCapabilities.push(capability);
    }

    if (this.presetService.hasCapabilityPanTilt()) {
      let capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.Pan;
      this.availableCapabilities.push(capability);

      capability = new FixtureCapability();
      capability.type = FixtureCapabilityType.Tilt;
      this.availableCapabilities.push(capability);
    }

    // calculate all profiles
    this.availableProfiles = this.presetService.getSelectedProfiles();

    // select all profiles by default
    this.selectedProfiles = [...this.availableProfiles];

    // calculate all channels
    this.calculateChannelCapabilities();
  }

  getCapabilityName(capability: FixtureCapability): Observable<string> {
    return this.translate
      .get(['designer.fixtureCapabilityType.' + capability.type, 'designer.fixtureCapabilityColor.' + capability.color])
      .pipe(
        map((result: string) => {
          let name = '';
          name += result['designer.fixtureCapabilityType.' + capability.type];

          if (capability.color) {
            name += ', ' + result['designer.fixtureCapabilityColor.' + capability.color];
          } else {
            return name;
          }

          return name;
        })
      );
  }

  capabilityChecked(capability: FixtureCapability): boolean {
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

  toggleCapability(event: any, capability: FixtureCapability) {
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

    this.presetService.previewLive();
  }

  getChannelName(profileName: string, channelName: string) {
    if (this.availableProfiles.length > 1) {
      return profileName + ' - ' + channelName;
    }

    return channelName;
  }

  channelChecked(profile: FixtureProfile, channel: CachedFixtureChannel): boolean {
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

  toggleChannel(event: any, profile: FixtureProfile, channel: CachedFixtureChannel) {
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

    this.presetService.previewLive();
  }

  setLengthMillis(value: any) {
    if (!isNaN(value) && value >= this.lengthMillisMin && value <= this.lengthMillisMax) {
      this.curve.lengthMillis = +value;
      this.presetService.previewLive();
    }
  }

  setAmplitude(value: any) {
    if (!isNaN(value) && value >= this.amplitudeMin && value <= this.amplitudeMax) {
      this.curve.amplitude = +value;
      this.presetService.previewLive();
    }
  }

  setPosition(value: any) {
    if (!isNaN(value) && value >= this.percentageMin && value <= this.percentageMax) {
      this.curve.position = +value;
      this.presetService.previewLive();
    }
  }

  setPhaseMillis(value: any) {
    if (!isNaN(value) && value >= this.phaseMillisMin && value <= this.phaseMillisMax) {
      this.curve.phaseMillis = +value;
      this.presetService.previewLive();
    }
  }

  setPhasingMillis(value: any) {
    if (!isNaN(value) && value >= this.phasingMillisMin && value <= this.phasingMillisMax) {
      this.curve.phasingMillis = +value;
      this.presetService.previewLive();
    }
  }
}
