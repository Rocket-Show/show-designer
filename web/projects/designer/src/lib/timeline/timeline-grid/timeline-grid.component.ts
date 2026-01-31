import { Component, HostListener, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { TimelineService } from '../../services/timeline.service';

@Component({
  selector: 'lib-app-timeline-grid',
  templateUrl: './timeline-grid.component.html',
  styleUrls: ['./timeline-grid.component.css'],
  standalone: false,
})
export class TimelineGridComponent implements OnInit {
  public gridType: string;
  public beatsPerMinute: number;
  public timeSignatureUpper: number;
  public timeSignatureLower: number;
  public snapToGrid: boolean;
  public gridOffsetMillis: number;
  public gridResolution: number;

  constructor(public bsModalRef: BsModalRef, public timelineService: TimelineService) {
    this.gridType = timelineService.selectedComposition.gridType;
    this.beatsPerMinute = timelineService.selectedComposition.beatsPerMinute;
    this.timeSignatureUpper = timelineService.selectedComposition.timeSignatureUpper;
    this.timeSignatureLower = timelineService.selectedComposition.timeSignatureLower;
    this.snapToGrid = timelineService.selectedComposition.snapToGrid;
    this.gridOffsetMillis = timelineService.selectedComposition.gridOffsetMillis;
    this.gridResolution = timelineService.selectedComposition.gridResolution;
  }

  ngOnInit() {}

  ok() {
    this.timelineService.selectedComposition.gridType = this.gridType;
    this.timelineService.selectedComposition.beatsPerMinute = this.beatsPerMinute;
    this.timelineService.selectedComposition.timeSignatureUpper = this.timeSignatureUpper;
    this.timelineService.selectedComposition.timeSignatureLower = this.timeSignatureLower;
    this.timelineService.selectedComposition.snapToGrid = this.snapToGrid;
    this.timelineService.selectedComposition.gridOffsetMillis = this.gridOffsetMillis;
    this.timelineService.selectedComposition.gridResolution = this.gridResolution;

    this.timelineService.updateGrid();
    this.bsModalRef.hide();
  }

  cancel() {
    this.bsModalRef.hide();
  }

  @HostListener('document:keydown.enter', ['$event'])
  handleKeyboardEvent(event: any) {
    this.ok();
  }
}
