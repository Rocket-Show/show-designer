import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subscription } from 'rxjs';
import { UniverseConfig } from '../models/universe-config';
import { EmberService } from '../services/ember.service';
import { emberErrorKeys } from './ember-protocol';

// The Ember stick: connecting it, what it plays, copying the project onto it, the preview live on the lights, and its
// buttons. In a browser without Web Serial (Safari), the show as a file to copy onto the stick's drive.
@Component({
  selector: 'lib-app-ember-dialog',
  templateUrl: './ember-dialog.component.html',
  styleUrls: ['./ember-dialog.component.css'],
  standalone: false,
})
export class EmberDialogComponent implements OnInit, OnDestroy {
  universes: UniverseConfig[] = [];

  // the project was copied onto the stick just now
  sent = false;

  private subscription: Subscription;

  constructor(private bsModalRef: BsModalRef, public ember: EmberService, private changeDetectorRef: ChangeDetectorRef) {}

  ngOnInit() {
    this.universes = this.ember.universes();
    this.subscription = this.ember.changed.subscribe(() => this.changeDetectorRef.markForCheck());
    this.ember.problem = undefined;
    this.ember.compareProject();
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  get errorKey(): string {
    return this.ember.info ? emberErrorKeys[this.ember.info.error] : undefined;
  }

  // the show on the stick, in KB
  get showKb(): number {
    return Math.ceil((this.ember.info?.imageLength || 0) / 1024);
  }

  get sendingPercent(): number {
    const sending = this.ember.sending;
    return sending && sending.blocks > 0 ? Math.round((sending.taken / sending.blocks) * 100) : 0;
  }

  connect() {
    this.ember.connect();
  }

  disconnect() {
    this.ember.disconnect();
  }

  async sendShow() {
    this.sent = false;
    this.sent = await this.ember.sendShow();
  }

  download() {
    this.ember.downloadShowFile();
  }

  setLive(on: boolean) {
    this.ember.setLive(on);
  }

  selectUniverse(uuid: string) {
    this.ember.liveUniverseUuid = uuid;
  }

  close() {
    this.bsModalRef.hide();
  }
}
