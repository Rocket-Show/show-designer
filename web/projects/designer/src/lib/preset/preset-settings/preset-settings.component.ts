import { Component, HostListener, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Preset } from '../../models/preset';

@Component({
  selector: 'lib-preset-settings',
  templateUrl: './preset-settings.component.html',
  styleUrls: ['./preset-settings.component.css'],
  standalone: false,
})
export class PresetSettingsComponent implements OnInit {
  preset: Preset;

  name: string;
  startMillis: number;
  endMillis: number;
  fadeInMillis: number;
  fadeOutMillis: number;
  fadeInPre: boolean;
  fadeOutPost: boolean;

  constructor(public bsModalRef: BsModalRef) {}

  ngOnInit() {
    this.name = this.preset.name;
    this.startMillis = this.preset.startMillis;
    this.endMillis = this.preset.endMillis;
    this.fadeInMillis = this.preset.fadeInMillis;
    this.fadeOutMillis = this.preset.fadeOutMillis;
    this.fadeInPre = this.preset.fadeInPre;
    this.fadeOutPost = this.preset.fadeOutPost;
  }

  ok() {
    this.preset.name = this.name;

    if (this.startMillis === undefined || this.startMillis === null || (this.startMillis as any) === '') {
      this.preset.startMillis = undefined;
    } else if (!isNaN(this.startMillis) && this.startMillis >= 0) {
      this.preset.startMillis = +this.startMillis;
    }
    if (this.endMillis === undefined || this.endMillis === null || (this.endMillis as any) === '') {
      this.preset.endMillis = undefined;
    } else if (!isNaN(this.endMillis) && this.endMillis >= 0) {
      this.preset.endMillis = +this.endMillis;
    }
    if (!isNaN(this.fadeInMillis) && this.fadeInMillis >= 0) {
      this.preset.fadeInMillis = +this.fadeInMillis;
    }
    if (!isNaN(this.fadeOutMillis) && this.fadeOutMillis >= 0) {
      this.preset.fadeOutMillis = +this.fadeOutMillis;
    }

    this.preset.fadeInPre = this.fadeInPre;
    this.preset.fadeOutPost = this.fadeOutPost;

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
