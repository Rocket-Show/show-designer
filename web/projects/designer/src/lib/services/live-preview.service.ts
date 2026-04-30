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
  private livePreviewTimer: any;
  private liveChangePending = false;
  private livePreviewPendingPositionMillis: number;

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

    // collect all changes and delay them to not flood the backend
    // (except composition-bound updates. they need to be delivered always)
    if (this.livePreviewTimer && !compositionName) {
      this.livePreviewPendingPositionMillis = position;
      this.liveChangePending = true;
      return;
    }

    this.http
      .post('preview?positionMillis=' + position + '&compositionName=' + compositionName, JSON.stringify(this.projectService.project))
      .subscribe();

    this.liveChangePending = false;

    if (!compositionName) {
      this.livePreviewTimer = setTimeout(() => {
        this.livePreviewTimer = undefined;
        if (this.liveChangePending) {
          const pendingPosition = this.livePreviewPendingPositionMillis !== undefined ? this.livePreviewPendingPositionMillis : position;
          this.livePreviewPendingPositionMillis = undefined;

          this.http
            .post(
              'preview?positionMillis=' + pendingPosition + '&compositionName=' + compositionName,
              JSON.stringify(this.projectService.project)
            )
            .subscribe();
        }
      }, 50);
    }
  }

  stopPreviewPlay() {
    if (!this.configService.livePreview) {
      return;
    }

    this.http.post('stop-preview-play', null).subscribe();
  }
}
