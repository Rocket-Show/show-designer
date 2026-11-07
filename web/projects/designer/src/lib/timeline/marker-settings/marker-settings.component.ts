import { Component, HostListener, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { CompositionMarker } from '../../models/composition-marker';
import { TimelineService } from '../../services/timeline.service';

// The settings of a marker of the timeline: its name, whether it only marks a point of the composition (a label) or
// the playback stops there until GO (a hold point), and where it is. Edited on the side and taken over on OK; the
// marker can be removed here as well.
@Component({
  selector: 'lib-app-marker-settings',
  templateUrl: './marker-settings.component.html',
  standalone: false,
})
export class MarkerSettingsComponent implements OnInit {
  // the marker edited, handed over by the timeline
  marker: CompositionMarker;

  name: string;
  type: string;
  positionMillis: any;

  constructor(public bsModalRef: BsModalRef, private timelineService: TimelineService) {}

  ngOnInit() {
    this.name = this.marker.name;
    this.type = this.marker.type;
    this.positionMillis = this.marker.positionMillis;
  }

  // A marker keeps its name, rather than being left without one, and its position, unless a point in time from the
  // start on is typed in (rounded to whole milliseconds).
  ok() {
    const name = (this.name || '').trim();
    const positionMillis = this.positionMillis === '' || this.positionMillis === null ? NaN : +this.positionMillis;

    if (name) {
      this.marker.name = name;
    }

    this.marker.type = this.type === 'hold' ? 'hold' : 'label';

    if (!isNaN(positionMillis) && positionMillis >= 0) {
      this.marker.positionMillis = Math.round(positionMillis);
    }

    this.timelineService.markerChanged();
    this.bsModalRef.hide();
  }

  remove() {
    this.timelineService.removeMarker(this.marker);
    this.bsModalRef.hide();
  }

  cancel() {
    this.bsModalRef.hide();
  }

  @HostListener('document:keydown.enter')
  handleEnter() {
    this.ok();
  }
}
