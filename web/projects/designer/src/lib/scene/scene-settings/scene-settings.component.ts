import { Component, HostListener, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { TransitionCurveType, transitionCurveTypes } from '../../models/transition-curve';
import { Scene } from '../../models/scene';
import { ColorService } from '../../services/color.service';
import { SceneService } from '../../services/scene.service';

@Component({
  selector: 'lib-scene-settings',
  templateUrl: './scene-settings.component.html',
  styleUrls: ['./scene-settings.component.css'],
  standalone: false,
})
export class SceneSettingsComponent implements OnInit {
  scene: Scene;

  name: string;
  color: string;
  colorAuto: boolean;
  icon: string;
  fadeInMillis: number;
  fadeOutMillis: number;
  fadeInPre: boolean;
  fadeOutPost: boolean;
  fadeInCurve: TransitionCurveType;
  fadeOutCurve: TransitionCurveType;

  transitionCurveTypes = transitionCurveTypes;

  // the color the scene takes from its presets, which cannot change while the dialog
  // is open
  derivedColor: string;

  readonly defaultIcon = SceneService.defaultIcon;

  palette: string[];

  constructor(public bsModalRef: BsModalRef, private colorService: ColorService, private sceneService: SceneService) {}

  ngOnInit() {
    this.name = this.scene.name;
    this.color = this.scene.color;
    this.colorAuto = this.scene.colorAuto;
    this.icon = this.scene.icon;
    this.fadeInMillis = this.scene.fadeInMillis;
    this.fadeOutMillis = this.scene.fadeOutMillis;
    this.fadeInPre = this.scene.fadeInPre;
    this.fadeOutPost = this.scene.fadeOutPost;
    this.fadeInCurve = this.scene.fadeInCurve;
    this.fadeOutCurve = this.scene.fadeOutCurve;

    this.derivedColor = this.colorService.getDerivedSceneColor(this.scene);
    this.palette = this.colorService.pickerColors;
  }

  // what the scene ends up being marked with, so the icons are shown the way the scene
  // tree will show them
  shownColor(): string {
    return (this.colorAuto ? this.derivedColor : undefined) || this.color;
  }

  ok() {
    this.scene.name = this.name;
    this.scene.color = this.color;
    this.scene.colorAuto = this.colorAuto;
    this.scene.icon = this.icon;

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

    // the icon and the color of the scene are part of the tree and of the timeline
    // regions, which are only built again when the scenes change
    this.sceneService.scenesChanged.next();

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
