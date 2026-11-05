import { Component, OnInit } from '@angular/core';
import { FixtureService } from '../../services/fixture.service';
import { LivePreviewService } from '../../services/live-preview.service';
import { PresetService } from '../../services/preset.service';
import { PreviewService } from '../../services/preview.service';
import { ProjectService } from '../../services/project.service';

@Component({
  selector: 'lib-app-fixture-settings',
  templateUrl: './fixture-settings.component.html',
  styleUrls: ['./fixture-settings.component.css'],
  standalone: false,
})
export class FixtureSettingsComponent implements OnInit {
  dmxChannels: number[] = [];

  constructor(
    private fixtureService: FixtureService,
    public presetService: PresetService,
    public projectService: ProjectService,
    private previewService: PreviewService,
    private livePreviewService: LivePreviewService
  ) {
    for (let i = 0; i < 512; i++) {
      this.dmxChannels.push(0);
    }
  }

  ngOnInit() {}

  // A color alone lights the fixtures lighting in colors, or they need their dimmers to be set as well (like in a show
  // of before version 11). The fixtures start their dimmers anew, the preview and the live preview show it.
  setColorDimmersAtFull(atFull: boolean) {
    this.projectService.project.colorDimmersAtFull = atFull;
    this.fixtureService.updateCachedFixtures();
    this.previewService.updateFixtureSetup();
    this.livePreviewService.previewLive();
  }

  isChrome(): boolean {
    if (navigator.appVersion.indexOf('Chrome/') !== -1) {
      return true;
    }
    return false;
  }
}
