import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { PresetService } from '../services/preset.service';
import { ProjectService } from '../services/project.service';

@Component({
  selector: 'lib-app-master-dimmer',
  templateUrl: './master-dimmer.component.html',
  styleUrls: ['./master-dimmer.component.css'],
  standalone: false,
})
export class MasterDimmerComponent implements OnInit {
  constructor(public projectService: ProjectService, private changeDetectorRef: ChangeDetectorRef, private presetService: PresetService) {}

  ngOnInit() {}

  setValue(value: any) {
    if (isNaN(value)) {
      return;
    }

    if (value < 0 || value > 1) {
      return;
    }

    this.projectService.project.masterDimmerValue = value;
    this.changeDetectorRef.detectChanges();
    this.presetService.previewLive();
  }

  getValue(): number {
    return Math.round(this.projectService.project.masterDimmerValue * 100 * 100) / 100;
  }
}
