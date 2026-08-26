import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { Fixture } from '../models/fixture';
import { FixturePoolService } from '../services/fixture-pool.service';
import { FixtureService } from '../services/fixture.service';
import { IntroService } from '../services/intro.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { PresetFixture } from '../models/preset-fixture';
import type { Options } from 'sortablejs';
import { LivePreviewService } from '../services/live-preview.service';

@Component({
  selector: 'lib-app-fixture',
  templateUrl: './fixture.component.html',
  styleUrls: ['./fixture.component.css'],
  standalone: false,
})
export class FixtureComponent implements OnInit, OnDestroy {
  fixtureSortableOptions: Options = {
    onUpdate: () => this.fixtureListReordered(),
  };

  // the fixtures which are not part of the current preset (only used, when the preset
  // brings its own fixture order)
  otherFixtures: PresetFixture[] = [];

  private subscriptions: Subscription[] = [];

  constructor(
    public projectService: ProjectService,
    public presetService: PresetService,
    private fixturePoolService: FixturePoolService,
    public fixtureService: FixtureService,
    public introService: IntroService,
    private livePreviewService: LivePreviewService
  ) {}

  ngOnInit() {
    this.updateOtherFixtures();

    this.subscriptions.push(
      this.presetService.fixtureSelectionChanged.subscribe(() => this.updateOtherFixtures()),
      this.presetService.previewSelectionChanged.subscribe(() => this.updateOtherFixtures()),
      this.projectService.projectChanged.subscribe(() => this.updateOtherFixtures())
    );
  }

  ngOnDestroy() {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
  }

  // does the current preset define its own fixture order?
  usePresetOrder(): boolean {
    return (
      !!this.presetService.selectedPreset &&
      !this.presetService.selectedPreset.useGlobalFixtureOrder &&
      !this.fixtureService.settingsSelection
    );
  }

  // the preset either brings its own fixture order or follows the global one of the project
  switchCustomFixtureOrder(customFixtureOrder: boolean) {
    if (!this.presetService.selectedPreset) {
      return;
    }

    this.presetService.setUseGlobalFixtureOrder(this.presetService.selectedPreset, !customFixtureOrder);
    this.updateOtherFixtures();
  }

  private updateOtherFixtures() {
    const preset = this.presetService.selectedPreset;

    if (!preset) {
      this.otherFixtures = [];
      return;
    }

    this.otherFixtures = this.projectService.project.presetFixtures.filter(
      (projectFixture) => !this.presetService.getPresetFixture(preset, projectFixture.fixtureUuid, projectFixture.pixelKey)
    );
  }

  fixtureName(presetFixture: PresetFixture) {
    let name: string;
    name = this.fixtureService.getFixtureByUuid(presetFixture.fixtureUuid).name;
    if (presetFixture.pixelKey) {
      name += ' - ' + presetFixture.pixelKey;
    }
    return name;
  }

  fixtureIsSelected(presetFixture: PresetFixture): boolean {
    const fixture = this.fixtureService.getFixtureByUuid(presetFixture.fixtureUuid);
    if (this.fixtureService.settingsSelection) {
      return this.fixtureService.settingsFixtureIsSelected(fixture);
    } else {
      return this.presetService.fixtureIsSelected(fixture, presetFixture.pixelKey);
    }
  }

  selectFixture(event: any, presetFixture: PresetFixture) {
    const fixture = this.fixtureService.getFixtureByUuid(presetFixture.fixtureUuid);
    if (this.fixtureService.settingsSelection) {
      // select fixtures for the settings
      this.fixtureService.switchSettingsFixtureSelection(fixture);
      this.presetService.fixtureSelectionSettingsChanged.next();
    } else {
      // select fixtures for the current preset
      this.presetService.switchFixtureSelection(fixture, presetFixture.pixelKey);
      this.presetService.fixtureSelectionChanged.next();
      this.livePreviewService.previewLive();
    }
  }

  selectAll() {
    this.presetService.selectAllFixtures();
    this.presetService.fixtureSelectionChanged.next();
    this.livePreviewService.previewLive();
  }

  selectNone() {
    this.presetService.selectNoFixtures();
    this.presetService.fixtureSelectionChanged.next();
    this.livePreviewService.previewLive();
  }

  fixtureListReordered() {
    this.livePreviewService.previewLive();
  }

  openFixturePool() {
    this.fixturePoolService.open();
  }
}
