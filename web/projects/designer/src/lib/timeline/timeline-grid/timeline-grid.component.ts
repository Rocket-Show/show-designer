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

  // The fields hand out what is typed into them as text: the grid is kept in numbers (an
  // offset kept as text would be added to the times of the bars as text). A field which
  // holds no number keeps what is set.
  private static toNumber(value: any, current: number): number {
    return value === '' || value === null || value === undefined || isNaN(value) ? current : +value;
  }

  ok() {
    const composition = this.timelineService.selectedComposition;

    composition.gridType = this.gridType;
    composition.beatsPerMinute = TimelineGridComponent.toNumber(this.beatsPerMinute, composition.beatsPerMinute);
    composition.timeSignatureUpper = TimelineGridComponent.toNumber(this.timeSignatureUpper, composition.timeSignatureUpper);
    composition.timeSignatureLower = TimelineGridComponent.toNumber(this.timeSignatureLower, composition.timeSignatureLower);
    composition.snapToGrid = this.snapToGrid;
    composition.gridOffsetMillis = TimelineGridComponent.toNumber(this.gridOffsetMillis, composition.gridOffsetMillis);
    composition.gridResolution = TimelineGridComponent.toNumber(this.gridResolution, composition.gridResolution);

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
