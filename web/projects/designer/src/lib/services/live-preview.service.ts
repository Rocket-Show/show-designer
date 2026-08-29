import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AnimationService } from './animation.service';
import { ConfigService } from './config.service';
import { ProjectService } from './project.service';
import { TimelineStateService } from './timeline-state.service';

@Injectable({
  providedIn: 'root',
})
export class LivePreviewService {
  // the shortest time between two updates sent to the backend. every update serializes the
  // whole project, so sending one per mouse move of a slider would flood both the browser
  // and the backend.
  private static readonly throttleMillis = 50;

  private livePreviewTimer: any;

  // the position of the update collected while the throttle timer is running, if any
  private pendingPositionMillis: number;

  constructor(
    private configService: ConfigService,
    private http: HttpClient,
    private projectService: ProjectService,
    private animationService: AnimationService,
    private timelineStateService: TimelineStateService
  ) {}

  previewLive(compositionName: string = '', positionMillis?: number) {
    if (!this.configService.livePreview) {
      return;
    }

    if (!compositionName && this.timelineStateService.playState === 'playing' && this.timelineStateService.selectedComposition) {
      compositionName = this.timelineStateService.selectedComposition.name;
    }

    let position = positionMillis;

    if (position === undefined) {
      position = Math.round(this.animationService.timeMillis);
    }

    // composition-bound updates need to be delivered always
    if (compositionName) {
      this.postPreview(position, compositionName);
      return;
    }

    // collect all changes in between and send only the last one of them
    if (this.livePreviewTimer) {
      this.pendingPositionMillis = position;
      return;
    }

    this.postPreview(position, '');
    this.startThrottleTimer();
  }

  private startThrottleTimer() {
    this.livePreviewTimer = setTimeout(() => {
      this.livePreviewTimer = undefined;

      if (this.pendingPositionMillis === undefined) {
        return;
      }

      const position = this.pendingPositionMillis;
      this.pendingPositionMillis = undefined;

      this.postPreview(position, '');

      // keep throttling as long as the changes keep coming in
      this.startThrottleTimer();
    }, LivePreviewService.throttleMillis);
  }

  private postPreview(positionMillis: number, compositionName: string) {
    this.http
      .post('preview?positionMillis=' + positionMillis + '&compositionName=' + compositionName, JSON.stringify(this.projectService.project))
      .subscribe();
  }

  stopPreviewPlay() {
    if (!this.configService.livePreview) {
      return;
    }

    this.http.post('stop-preview-play', null).subscribe();
  }
}
