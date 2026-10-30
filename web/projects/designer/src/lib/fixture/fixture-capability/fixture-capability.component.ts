import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { CachedFixtureChannel } from '../../models/cached-fixture-channel';
import { FixtureProfile } from '../../models/fixture-profile';
import { FixtureWheelSlotType } from '../../models/fixture-wheel-slot';
import { FixtureCapabilityColor, FixtureCapabilityType } from '../../models/fixture-capability';
import { getPlayingTypes } from '../../models/capability-position';
import { FixtureService } from '../../services/fixture.service';
import { IntroService } from '../../services/intro.service';
import { PresetService } from '../../services/preset.service';
import { ProjectService } from '../../services/project.service';

@Component({
  selector: 'lib-app-fixture-capability',
  templateUrl: './fixture-capability.component.html',
  styleUrls: ['./fixture-capability.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class FixtureCapabilityComponent implements OnInit, OnDestroy {
  private fixtureSelectionChangedSubscription: Subscription;
  private previewSelectionChangedSubscription: Subscription;
  private stepsChangedSubscription: Subscription;

  // the channels holding a color wheel, once for each profile (a profile may have several)
  colorWheelChannels: { profile: FixtureProfile; channel: CachedFixtureChannel; fixtureChannels: CachedFixtureChannel[] }[] = [];
  hasCapabilityDimmer: boolean = false;
  hasCapabilityColorOrColorWheel: boolean = false;
  hasCapabilityPanTilt: boolean = false;

  // the gobo wheels, once for each profile, like the color wheels
  goboWheelChannels: { profile: FixtureProfile; channel: CachedFixtureChannel }[] = [];

  // the capabilities besides the dimmer, the color and pan/tilt which play the same on every model of fixture (see
  // capability-position) and the emitters of light besides red, green and blue, which the fixtures of the preset have
  positionedTypes: FixtureCapabilityType[] = [];
  emitterColors: FixtureCapabilityColor[] = [];

  private static readonly positionedPanels = [
    FixtureCapabilityType.ShutterStrobe,
    FixtureCapabilityType.StrobeDuration,
    FixtureCapabilityType.Zoom,
    FixtureCapabilityType.Focus,
    FixtureCapabilityType.Iris,
    FixtureCapabilityType.Frost,
    FixtureCapabilityType.ColorTemperature,
    FixtureCapabilityType.Prism,
    FixtureCapabilityType.PanTiltSpeed,
    FixtureCapabilityType.FogOutput,
  ];

  private static readonly emitters = [
    FixtureCapabilityColor.White,
    FixtureCapabilityColor['Warm White'],
    FixtureCapabilityColor['Cold White'],
    FixtureCapabilityColor.Amber,
    FixtureCapabilityColor.UV,
    FixtureCapabilityColor.Lime,
    FixtureCapabilityColor.Indigo,
  ];

  constructor(
    public presetService: PresetService,
    private fixtureService: FixtureService,
    private changeDetectorRef: ChangeDetectorRef,
    public projectService: ProjectService,
    public introService: IntroService
  ) {
    this.fixtureSelectionChangedSubscription = this.presetService.fixtureSelectionChanged.subscribe(() => {
      this.update();
    });

    this.previewSelectionChangedSubscription = this.presetService.previewSelectionChanged.subscribe(() => {
      this.update();
    });

    // the panels edit one step of the preset, so they follow the step being selected
    this.stepsChangedSubscription = this.presetService.stepsChanged.subscribe(() => {
      this.update();
    });

    this.introService.stepChanged.subscribe(() => {
      this.changeDetectorRef.detectChanges();
    });
  }

  ngOnInit() {
    this.update();
  }

  ngOnDestroy() {
    this.fixtureSelectionChangedSubscription.unsubscribe();
    this.previewSelectionChangedSubscription.unsubscribe();
    this.stepsChangedSubscription.unsubscribe();
  }

  private wheelInList(profile: FixtureProfile, channel: CachedFixtureChannel): boolean {
    return this.colorWheelChannels.some((wheel) => wheel.profile.uuid === profile.uuid && wheel.channel.name === channel.name);
  }

  private updateColorWheels() {
    this.colorWheelChannels = [];
    this.goboWheelChannels = [];

    if (!this.presetService.selectedPreset) {
      return;
    }

    for (const preserFixture of this.presetService.selectedPreset.fixtures) {
      const fixture = this.fixtureService.getCachedFixtureByUuid(preserFixture.fixtureUuid, preserFixture.pixelKey);
      for (const channel of fixture.channels) {
        for (const capability of channel.capabilities) {
          if (capability.wheel && capability.wheelSlots && capability.wheelSlots.length > 0) {
            if (this.fixtureService.wheelHasSlotType(capability.wheel, FixtureWheelSlotType.Color)) {
              // color wheel
              if (!this.wheelInList(fixture.profile, channel)) {
                this.colorWheelChannels.push({ profile: fixture.profile, channel, fixtureChannels: fixture.channels });
              }
            } else if (this.fixtureService.wheelHasSlotType(capability.wheel, FixtureWheelSlotType.Gobo)) {
              // gobo wheel
              if (
                !this.goboWheelChannels.some((wheel) => wheel.profile.uuid === fixture.profile.uuid && wheel.channel.name === channel.name)
              ) {
                this.goboWheelChannels.push({ profile: fixture.profile, channel });
              }
            }
          }
        }
      }
    }
  }

  private updateCapabilities() {
    this.hasCapabilityDimmer = this.presetService.hasCapabilityDimmer();
    this.hasCapabilityColorOrColorWheel = this.presetService.hasCapabilityColorOrColorWheel();
    this.hasCapabilityPanTilt = this.presetService.hasCapabilityPanTilt();

    // the strobe drives a channel of its own for its speed as well, the zoom one of the beam angle and the fog output
    // one of a kind of fog (see getPlayingTypes)
    this.positionedTypes = FixtureCapabilityComponent.positionedPanels.filter(
      (type) =>
        getPlayingTypes(type).some((playingType) => this.presetService.hasCapabilityType(playingType)) ||
        (type === FixtureCapabilityType.ShutterStrobe && this.presetService.hasCapabilityType(FixtureCapabilityType.StrobeSpeed))
    );
    this.emitterColors = FixtureCapabilityComponent.emitters.filter((color) =>
      this.presetService.hasCapabilityType(FixtureCapabilityType.ColorIntensity, color)
    );
  }

  // does any of the panels above apply to the fixtures of the preset?
  get hasCapabilities(): boolean {
    return (
      this.hasCapabilityDimmer ||
      this.hasCapabilityColorOrColorWheel ||
      this.hasCapabilityPanTilt ||
      this.positionedTypes.length > 0 ||
      this.emitterColors.length > 0 ||
      this.goboWheelChannels.length > 0
    );
  }

  private update() {
    this.updateColorWheels();
    this.updateCapabilities();
    this.changeDetectorRef.detectChanges();
  }

  isChrome(): boolean {
    if (navigator.appVersion.indexOf('Chrome/') !== -1) {
      return true;
    }
    return false;
  }
}
