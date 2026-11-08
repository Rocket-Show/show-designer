import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';
import { ToastrModule } from 'ngx-toastr';

import { profiles } from '../../../../../conformance/index';
import { FixtureCapabilityType } from '../../../models/fixture-capability';
import { Project } from '../../../models/project';
import { FixtureService } from '../../../services/fixture.service';
import { LivePreviewService } from '../../../services/live-preview.service';
import { PresetService } from '../../../services/preset.service';
import { ProjectService } from '../../../services/project.service';
import { FixtureCapabilityCommandComponent } from './fixture-capability-command.component';

// The programs of the fixtures by their number, at a speed and to the sound, and asking them to reset themselves or to
// switch their lamp on or off while the preset plays
describe('FixtureCapabilityCommandComponent', () => {
  let fixture: ComponentFixture<FixtureCapabilityCommandComponent>;
  let component: FixtureCapabilityCommandComponent;
  let element: HTMLElement;
  let presetService: PresetService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FixtureCapabilityCommandComponent],
      imports: [FormsModule, NgxBootstrapSliderModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    }).compileComponents();

    spyOn(TestBed.inject(LivePreviewService), 'previewLive');

    const project = new Project({
      fixtureProfiles: [{ ...JSON.parse(JSON.stringify(profiles['test/program-spot'])), uuid: 'test/program-spot' }],
      fixtures: [{ uuid: 'spot', profileUuid: 'test/program-spot', modeShortName: '9ch', dmxUniverseUuid: 'u', dmxFirstChannel: 0 }],
      presetFixtures: [{ fixtureUuid: 'spot' }],
      presets: [{ uuid: 'look', fixtures: [{ fixtureUuid: 'spot' }], steps: [{ uuid: 'step' }] }],
    });
    TestBed.inject(ProjectService).project = project;
    TestBed.inject(FixtureService).updateCachedFixtures();

    presetService = TestBed.inject(PresetService);
    presetService.selectedPreset = project.presets[0];
    presetService.selectedStep = project.presets[0].steps[0];
  });

  async function render(kind: 'program' | 'maintenance') {
    fixture = TestBed.createComponent(FixtureCapabilityCommandComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.componentRef.setInput('kind', kind);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('runs a program by its number, at a speed and to the sound', async () => {
    await render('program');
    expect(component.getValue()).toBeUndefined();
    expect(component.programNumbers).toEqual([1, 2, 3]);

    (element.querySelector('input[type=checkbox]') as HTMLInputElement).click();
    expect(component.getValue().programNumber).toBe(1);

    component.setProgram(3);
    component.setSpeed(0.8);
    expect(component.getValue().programNumber).toBe(3);
    expect(component.getValue().valuePercentage).toBe(0.8);
    // the speed on a channel of its own as well
    expect(presetService.getCapabilityValue(presetService.selectedStep, FixtureCapabilityType.EffectSpeed).valuePercentage).toBe(0.8);

    // to the sound: the programs controlled by the sound
    component.setSound(true);
    expect(component.getValue().soundControlled).toBe(true);
    expect(component.programNumbers).toEqual([1]);

    component.changeActive(false);
    expect(component.getValue()).toBeUndefined();
    expect(presetService.getCapabilityValue(presetService.selectedStep, FixtureCapabilityType.EffectSpeed)).toBeUndefined();
  });

  it('asks the fixtures to reset or to switch their lamp, as far as they can', async () => {
    await render('maintenance');
    expect(component.actions).toEqual(['reset', 'lamp-on', 'lamp-off']);

    (element.querySelector('button[name="maintenance-lamp-off"]') as HTMLButtonElement).click();
    expect(component.getValue().maintenanceAction).toBe('lamp-off');
    expect(component.getValue().valuePercentage).toBe(1);
  });
});
