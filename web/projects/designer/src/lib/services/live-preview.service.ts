import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AnimationService } from './animation.service';
import { ConfigService } from './config.service';
import { Fixture } from '../models/fixture';
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

  // the fixtures of a patch which isn't the project's yet (the one the fixture pool edits), sent instead of the ones
  // of the project while fixtures are identified in it (see previewPatch)
  private patchFixtures: Fixture[];

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
    // a composition may be named with characters which mean something in an address (e.g. "Rock & Roll")
    this.http
      .post(
        'preview?positionMillis=' + positionMillis + '&compositionName=' + encodeURIComponent(compositionName),
        JSON.stringify(this.patchFixtures ? { ...this.projectService.project, fixtures: this.patchFixtures } : this.projectService.project)
      )
      .subscribe();
  }

  // Preview the project with the passed fixtures instead of its own ones, e.g. to identify a fixture just moved to
  // another address in the fixture pool, until endPatchPreview
  previewPatch(fixtures: Fixture[]) {
    this.patchFixtures = fixtures;
    this.previewLive();
  }

  endPatchPreview() {
    this.patchFixtures = undefined;
  }

  stopPreviewPlay() {
    if (!this.configService.livePreview) {
      return;
    }

    this.http.post('stop-preview-play', null).subscribe();
  }
}
