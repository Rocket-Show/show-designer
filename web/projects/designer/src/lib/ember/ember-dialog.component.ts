import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subscription } from 'rxjs';
import { EmberHost } from '../models/ember-host';
import { ConfigService } from '../services/config.service';
import { ProjectService } from '../services/project.service';

// The Ember stick of the host application (see EmberHost): connecting it, what it plays, copying the project onto it,
// the preview live on the lights, and its button. In a browser which can't talk to a stick (Safari), the show as a
// file to copy onto the stick's drive.
@Component({
  selector: 'lib-app-ember-dialog',
  templateUrl: './ember-dialog.component.html',
  styleUrls: ['./ember-dialog.component.css'],
  standalone: false,
})
export class EmberDialogComponent implements OnInit, OnDestroy {
  // the project was copied onto the stick just now
  sent = false;

  // the mark the show of this project has (see EmberHost.showMark)
  private projectMark: string;

  private subscription: Subscription;

  constructor(
    private bsModalRef: BsModalRef,
    private configService: ConfigService,
    private projectService: ProjectService,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  get ember(): EmberHost {
    return this.configService.ember;
  }

  ngOnInit() {
    this.subscription = this.ember.changed.subscribe(() => this.changeDetectorRef.markForCheck());

    this.ember
      .showMark(this.projectJson())
      .catch((): string => undefined)
      .then((mark) => {
        this.projectMark = mark;
        this.changeDetectorRef.markForCheck();
      });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  // the project as it would be saved now
  private projectJson(): string {
    const project = this.projectService.project;
    this.projectService.writeCompatibilityValues(project);

    if (this.configService.freeUniverseEdit) {
      project.universes = this.configService.universes;
    }

    return this.projectService.getSavedJson(project);
  }

  // Does the stick play this project as it is now. Undefined as long as it is not known.
  get playsProject(): boolean {
    const showMark = this.ember.stick?.showMark;
    return this.projectMark === undefined || showMark === undefined ? undefined : this.projectMark === showMark;
  }

  // the show on the stick, in KB
  get showKb(): number {
    return Math.ceil((this.ember.stick?.showBytes || 0) / 1024);
  }

  get sendingPercent(): number {
    const sending = this.ember.sending;
    return sending && sending.blocks > 0 ? Math.round((sending.taken / sending.blocks) * 100) : 0;
  }

  async sendShow() {
    this.sent = false;
    this.sent = await this.ember.send(this.projectJson());
    this.changeDetectorRef.markForCheck();
  }

  download() {
    this.ember.download(this.projectJson(), this.projectService.project.name || 'show');
  }

  close() {
    this.bsModalRef.hide();
  }
}
