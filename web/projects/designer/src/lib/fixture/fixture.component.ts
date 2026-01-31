import { Component, OnInit } from '@angular/core';
import { Fixture } from '../models/fixture';
import { FixturePoolService } from '../services/fixture-pool.service';
import { FixtureService } from '../services/fixture.service';
import { IntroService } from '../services/intro.service';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';
import { PresetFixture } from '../models/preset-fixture';

@Component({
  selector: 'lib-app-fixture',
  templateUrl: './fixture.component.html',
  styleUrls: ['./fixture.component.css'],
  standalone: false,
})
export class FixtureComponent implements OnInit {
  constructor(
    public projectService: ProjectService,
    public presetService: PresetService,
    private fixturePoolService: FixturePoolService,
    public fixtureService: FixtureService,
    public introService: IntroService
  ) {}

  ngOnInit() {}

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
      this.presetService.previewLive();
    }
  }

  selectAll() {
    this.presetService.selectAllFixtures();
    this.presetService.fixtureSelectionChanged.next();
  }

  selectNone() {
    this.presetService.selectNoFixtures();
    this.presetService.fixtureSelectionChanged.next();
  }

  openFixturePool() {
    this.fixturePoolService.open();
  }
}
