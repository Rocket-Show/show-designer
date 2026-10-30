import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { ToastrModule } from 'ngx-toastr';

import { profiles } from '../../../../conformance/index';
import { Preset } from '../../models/preset';
import { PresetFixture } from '../../models/preset-fixture';
import { Project } from '../../models/project';
import { FixtureService } from '../../services/fixture.service';
import { PresetService } from '../../services/preset.service';
import { ProjectService } from '../../services/project.service';
import { FixtureCapabilityChannelComponent } from '../fixture-capability/fixture-capability-channel/fixture-capability-channel.component';
import { FixtureChannelComponent } from './fixture-channel.component';

// All channels of the fixtures of the preset being edited, each set in a panel of its own,
// filtered by the profiles of the fixtures. Without anything to set, it says what is missing.
// The fixtures are a par with a dimmer, colors and a strobe, and a moving head.
describe('FixtureChannelComponent', () => {
  let fixture: ComponentFixture<FixtureChannelComponent>;
  let element: HTMLElement;
  let project: Project;
  let presetService: PresetService;
  let preset: Preset;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FixtureChannelComponent, FixtureCapabilityChannelComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot(), PopoverModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    }).compileComponents();

    project = new Project({
      fixtureProfiles: ['test/rgb-par', 'test/moving-head'].map((name) => ({ ...JSON.parse(JSON.stringify(profiles[name])), uuid: name })),
      fixtures: [
        { uuid: 'par', profileUuid: 'test/rgb-par', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 0 },
        { uuid: 'head', profileUuid: 'test/moving-head', modeShortName: '6ch', dmxUniverseUuid: 'u', dmxFirstChannel: 10 },
      ],
      presetFixtures: [{ fixtureUuid: 'par' }, { fixtureUuid: 'head' }],
      presets: [{ uuid: 'look', fixtures: [{ fixtureUuid: 'par' }], steps: [{ uuid: 'step' }] }],
    });
    TestBed.inject(ProjectService).project = project;
    TestBed.inject(FixtureService).updateCachedFixtures();

    preset = project.presets[0];
    presetService = TestBed.inject(PresetService);
    presetService.selectedPreset = preset;
    presetService.selectedStep = preset.steps[0];
  });

  afterEach(() => fixture.destroy());

  async function render() {
    fixture = TestBed.createComponent(FixtureChannelComponent);
    element = fixture.nativeElement;
    await update();
  }

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  // the preset lights the passed fixtures now
  async function light(...fixtureUuids: string[]) {
    preset.fixtures = fixtureUuids.map((fixtureUuid) => new PresetFixture({ fixtureUuid }));
    presetService.fixtureSelectionChanged.next();
    await update();
  }

  // the channel panels, by the profile and the name of their channel
  function channels(): string[] {
    return fixture.debugElement
      .queryAll(By.directive(FixtureCapabilityChannelComponent))
      .map((panel) => panel.componentInstance as FixtureCapabilityChannelComponent)
      .map((panel) => panel.profile.uuid + '/' + panel._channel.name);
  }

  function profileCheckboxes(): HTMLInputElement[] {
    return Array.from(element.querySelectorAll('input[id^="capabilityFilter"]'));
  }

  function message(): string {
    return element.querySelector('p.text-muted')?.textContent.trim();
  }

  it('asks for fixtures while the project has none', async () => {
    project.fixtures = [];
    preset.fixtures = [];
    await render();

    expect(message()).toBe('designer.fixture.no-fixtures');
  });

  it('asks for the fixtures of the preset while it has none', async () => {
    preset.fixtures = [];
    await render();

    expect(channels()).toEqual([]);
    expect(message()).toBe('designer.fixture.no-fixtures-selected');
  });

  it('shows nothing to set while no preset is being edited', async () => {
    presetService.selectedPreset = undefined;
    await render();

    expect(element.querySelector('.row')).toBeNull();
  });

  it('shows the channels of the fixtures of the preset', async () => {
    await render();

    expect(channels()).toEqual(['Dimmer', 'Red', 'Green', 'Blue', 'Strobe'].map((name) => 'test/rgb-par/' + name));
    expect(profileCheckboxes().length).toBe(0);
    expect(message()).toBeUndefined();
  });

  it('says that what the channels are set to only plays on their model of fixture', async () => {
    await render();
    expect(element.querySelector('.model-specific-hint .card-body').textContent.trim()).toBe('designer.fixture.model-specific-hint');

    await light();
    expect(element.querySelector('.model-specific-hint')).toBeNull();
  });

  it('filters the channels by the profiles, while the fixtures have several', async () => {
    await render();
    await light('par', 'head');

    expect(
      Array.from(element.querySelectorAll('.form-check-label[for^="capabilityFilter"]')).map((label) => label.textContent.trim())
    ).toEqual(['RGB par', 'Moving head']);
    expect(profileCheckboxes().map((checkbox) => checkbox.checked)).toEqual([true, true]);
    expect(channels()).toContain('test/moving-head/Pan');

    profileCheckboxes()[0].click();
    await update();

    expect(channels().every((channel) => channel.startsWith('test/moving-head/'))).toBe(true);

    profileCheckboxes()[0].click();
    await update();

    expect(channels()).toContain('test/rgb-par/Strobe');
  });

  it('numbers the channel panels apart, also over several profiles', async () => {
    await render();
    await light('par', 'head');

    const ids = Array.from(element.querySelectorAll('input[id^="capabilityGeneric"][id$="Active"]')).map((input) => input.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('capabilityGeneric10000Active');
  });

  it('stretches the panels to its height in Chrome only', async () => {
    await render();
    expect(element.querySelector('.row').classList).toContain('h-100');

    spyOnProperty(Navigator.prototype, 'appVersion', 'get').and.returnValue('5.0 (Macintosh) Version/17.0 Safari/605.1.15');
    await update();

    expect(element.querySelector('.row').classList).not.toContain('h-100');
  });

  it('follows the preset being picked', async () => {
    await render();

    preset.fixtures = [new PresetFixture({ fixtureUuid: 'head' })];
    presetService.previewSelectionChanged.next();
    await update();

    expect(channels().every((channel) => channel.startsWith('test/moving-head/'))).toBe(true);
  });

  it('stops following the preset once it is gone', async () => {
    await render();
    const component = fixture.componentInstance;
    fixture.destroy();

    preset.fixtures = [new PresetFixture({ fixtureUuid: 'head' })];
    presetService.fixtureSelectionChanged.next();
    presetService.previewSelectionChanged.next();

    expect(component.profiles.map((profile) => profile.uuid)).toEqual(['test/rgb-par']);
  });
});
