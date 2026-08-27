import { Component, HostListener, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { TransitionCurveType, transitionCurveTypes } from '../../models/transition-curve';
import { Scene } from '../../models/scene';

@Component({
  selector: 'lib-scene-settings',
  templateUrl: './scene-settings.component.html',
  styleUrls: ['./scene-settings.component.css'],
  standalone: false,
})
export class SceneSettingsComponent implements OnInit {
  scene: Scene;

  name: string;
  fadeInMillis: number;
  fadeOutMillis: number;
  fadeInPre: boolean;
  fadeOutPost: boolean;
  fadeInCurve: TransitionCurveType;
  fadeOutCurve: TransitionCurveType;

  transitionCurveTypes = transitionCurveTypes;

  constructor(public bsModalRef: BsModalRef) {}

  ngOnInit() {
    this.name = this.scene.name;
    this.fadeInMillis = this.scene.fadeInMillis;
    this.fadeOutMillis = this.scene.fadeOutMillis;
    this.fadeInPre = this.scene.fadeInPre;
    this.fadeOutPost = this.scene.fadeOutPost;
    this.fadeInCurve = this.scene.fadeInCurve;
    this.fadeOutCurve = this.scene.fadeOutCurve;
  }

  ok() {
    this.scene.name = this.name;

    if (!isNaN(this.fadeInMillis) && this.fadeInMillis >= 0) {
      this.scene.fadeInMillis = +this.fadeInMillis;
    }
    if (!isNaN(this.fadeOutMillis) && this.fadeOutMillis >= 0) {
      this.scene.fadeOutMillis = +this.fadeOutMillis;
    }

    this.scene.fadeInPre = this.fadeInPre;
    this.scene.fadeOutPost = this.fadeOutPost;
    this.scene.fadeInCurve = this.fadeInCurve;
    this.scene.fadeOutCurve = this.fadeOutCurve;

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
