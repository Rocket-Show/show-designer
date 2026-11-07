import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrModule } from 'ngx-toastr';

import { CachedFixture } from '../models/cached-fixture';
import { FixtureChannelValue } from '../models/fixture-channel-value';
import { Project } from '../models/project';
import { ConfigService } from '../services/config.service';
import { DmxService } from '../services/dmx.service';
import { FixtureService } from '../services/fixture.service';
import { LivePreviewService } from '../services/live-preview.service';
import { PreviewService } from '../services/preview.service';
import { ProjectService } from '../services/project.service';
import { DmxChannelsComponent } from './dmx-channels.component';

// The DMX channels of a universe with the values sent on them and a fader for each: a par at address 1 with an unused
// channel of its mode at address 5, and a moving head at address 11.
describe('DmxChannelsComponent', () => {
  let fixture: ComponentFixture<DmxChannelsComponent>;
  let element: HTMLElement;
  let project: Project;
  let dmxService: DmxService;
  let previewLive: jasmine.Spy;
  let channelValues: Map<CachedFixture, FixtureChannelValue[]>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DmxChannelsComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        { provide: BsModalRef, useValue: jasmine.createSpyObj('BsModalRef', ['hide']) },
      ],
    }).compileComponents();

    project = new Project({
      fixtureProfiles: [
        {
          uuid: 'par',
          name: 'Par',
          availableChannels: {
            Dimmer: { capability: { type: 'Intensity' } },
            Red: { capability: { type: 'ColorIntensity', color: 'Red' } },
            Green: { capability: { type: 'ColorIntensity', color: 'Green' } },
            Blue: { capability: { type: 'ColorIntensity', color: 'Blue' } },
            Strobe: { capability: { type: 'ShutterStrobe', shutterEffect: 'Strobe' } },
          },
          modes: [{ name: 'Mode', shortName: 'mode', channels: ['Dimmer', 'Red', 'Green', 'Blue', null, 'Strobe'] }],
        },
        {
          uuid: 'head',
          name: 'Head',
          availableChannels: {
            Pan: { fineChannelAliases: ['Pan fine'], capability: { type: 'Pan', angleStart: '0deg', angleEnd: '540deg' } },
            Dimmer: { capability: { type: 'Intensity' } },
          },
          modes: [{ name: 'Mode', shortName: 'mode', channels: ['Pan', 'Pan fine', 'Dimmer'] }],
        },
      ],
      fixtures: [
        { uuid: 'par', name: 'Par 1', profileUuid: 'par', modeShortName: 'mode', dmxUniverseUuid: 'front', dmxFirstChannel: 0 },
        { uuid: 'head', name: 'Head 1', profileUuid: 'head', modeShortName: 'mode', dmxUniverseUuid: 'front', dmxFirstChannel: 10 },
      ],
    });

    TestBed.inject(ProjectService).project = project;
    TestBed.inject(ConfigService).universes = [{ uuid: 'front', name: 'Front' }];
    const fixtureService = TestBed.inject(FixtureService);
    fixtureService.updateCachedFixtures();
    dmxService = TestBed.inject(DmxService);
    previewLive = spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    // what the presets light the fixtures with: the par at full
    const par = fixtureService.cachedFixtures.find((candidate) => candidate.fixture.uuid === 'par');
    channelValues = new Map([[par, [new FixtureChannelValue({ channelName: 'Dimmer', value: 255 })]]]);
    const previewService = TestBed.inject(PreviewService);
    spyOn(previewService, 'getPresets').and.returnValue([]);
    spyOn(previewService, 'getChannelValues').and.callFake(() => channelValues);

    fixture = TestBed.createComponent(DmxChannelsComponent);
    element = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => fixture.destroy());

  function groups(): string[] {
    return Array.from(element.querySelectorAll('.dmx-group')).map(
      (group) =>
        group.querySelector('.dmx-group-label').textContent.trim() + ' ' + group.querySelector('.dmx-group-range').textContent.trim()
    );
  }

  function strip(address: number): HTMLElement {
    return Array.from(element.querySelectorAll<HTMLElement>('.dmx-strip')).find(
      (candidate) => candidate.querySelector('.dmx-address').textContent.trim() === '' + address
    );
  }

  it('shows the channels of each fixture, an unused channel of its mode among them', () => {
    expect(groups()).toEqual(['Par 1 1–6', 'Head 1 11–13']);
    expect(strip(5).querySelector('.dmx-name').textContent.trim()).toBe('');
    expect(strip(12).querySelector('.dmx-name').textContent.trim()).toBe('Pan fine');
  });

  it('shows the channels no fixture is patched to, if asked to', async () => {
    const showUnpatched = element.querySelector<HTMLInputElement>('#dmxShowUnpatched');
    showUnpatched.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(groups()).toEqual(['Par 1 1–6', 'designer.dmx.unpatched 7–10', 'Head 1 11–13', 'designer.dmx.unpatched 14–512']);
  });

  it('shows the value sent on each channel', () => {
    expect(strip(1).querySelector('.dmx-value').textContent.trim()).toBe('255');
    expect(strip(2).querySelector('.dmx-value').textContent.trim()).toBe('0');
  });

  it('holds a channel at the value of its fader until it is let go', () => {
    const fader = strip(2).querySelector<HTMLInputElement>('.dmx-fader');
    fader.value = '128';
    fader.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(dmxService.getOverride('front', 1).value).toBe(128);
    expect(previewLive).toHaveBeenCalled();
    expect(strip(2).classList).toContain('dmx-strip-held');
    expect(strip(2).querySelector('.dmx-value').textContent.trim()).toBe('128');

    strip(2).querySelector<HTMLButtonElement>('.dmx-release').click();
    fixture.detectChanges();

    expect(dmxService.getOverride('front', 1)).toBeUndefined();
    expect(strip(2).classList).not.toContain('dmx-strip-held');
  });

  it('lets go of all faders when it is closed', () => {
    dmxService.setOverride('front', 0, 10);
    dmxService.setOverride('front', 11, 20);

    fixture.destroy();

    expect(project.dmxOverrides).toEqual([]);
  });
});
