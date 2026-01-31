import { Component, OnInit } from '@angular/core';
import { FixtureService } from '../../services/fixture.service';
import { PresetService } from '../../services/preset.service';

@Component({
  selector: 'lib-app-fixture-settings',
  templateUrl: './fixture-settings.component.html',
  styleUrls: ['./fixture-settings.component.css'],
  standalone: false,
})
export class FixtureSettingsComponent implements OnInit {
  dmxChannels: number[] = [];

  constructor(private fixtureService: FixtureService, public presetService: PresetService) {
    for (let i = 0; i < 512; i++) {
      this.dmxChannels.push(0);
    }
  }

  ngOnInit() {}

  isChrome(): boolean {
    if (navigator.appVersion.indexOf('Chrome/') !== -1) {
      return true;
    }
    return false;
  }
}
