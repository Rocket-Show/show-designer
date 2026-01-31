import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { PreviewService } from '../../../services/preview.service';
import { ProjectService } from '../../../services/project.service';

@Component({
  selector: 'lib-app-fixture-settings-stage',
  templateUrl: './fixture-settings-stage.component.html',
  styleUrls: ['./fixture-settings-stage.component.css'],
  standalone: false,
})
export class FixtureSettingsStageComponent implements OnInit {
  constructor(public projectService: ProjectService, public previewService: PreviewService, private changeDetectorRef: ChangeDetectorRef) {}

  ngOnInit() {}

  update() {
    this.previewService.updateStage();
    this.changeDetectorRef.detectChanges();
  }
}
