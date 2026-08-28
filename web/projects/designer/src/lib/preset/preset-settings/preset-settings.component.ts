import { Component, HostListener, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { TransitionCurveType, transitionCurveTypes } from '../../models/transition-curve';
import { Preset } from '../../models/preset';
import { ColorService } from '../../services/color.service';
import { PresetService } from '../../services/preset.service';

@Component({
  selector: 'lib-preset-settings',
  templateUrl: './preset-settings.component.html',
  styleUrls: ['./preset-settings.component.css'],
  standalone: false,
})
export class PresetSettingsComponent implements OnInit {
  preset: Preset;

  name: string;
  color: string;
  colorAuto: boolean;
  icon: string;
  startMillis: number;
  endMillis: number;
  fadeInMillis: number;
  fadeOutMillis: number;
  fadeInPre: boolean;
  fadeOutPost: boolean;
  fadeInCurve: TransitionCurveType;
  fadeOutCurve: TransitionCurveType;

  transitionCurveTypes = transitionCurveTypes;

  // the color the preset takes from what it puts on its fixtures, which cannot change
  // while the dialog is open
  derivedColor: string;

  readonly defaultIcon = PresetService.defaultIcon;

  palette: string[];

  constructor(public bsModalRef: BsModalRef, private colorService: ColorService, private presetService: PresetService) {}

  ngOnInit() {
    this.name = this.preset.name;
    this.color = this.preset.color;
    this.colorAuto = this.preset.colorAuto;
    this.icon = this.preset.icon;
    this.startMillis = this.preset.startMillis;
    this.endMillis = this.preset.endMillis;
    this.fadeInMillis = this.preset.fadeInMillis;
    this.fadeOutMillis = this.preset.fadeOutMillis;
    this.fadeInPre = this.preset.fadeInPre;
    this.fadeOutPost = this.preset.fadeOutPost;
    this.fadeInCurve = this.preset.fadeInCurve;
    this.fadeOutCurve = this.preset.fadeOutCurve;

    this.derivedColor = this.colorService.getDerivedPresetColor(this.preset);
    this.palette = this.colorService.pickerColors;
  }

  // what the preset ends up being marked with, so the icons are shown the way the
  // lists will show them
  shownColor(): string {
    return (this.colorAuto ? this.derivedColor : undefined) || this.color;
  }

  ok() {
    this.preset.name = this.name;
    this.preset.color = this.color;
    this.preset.colorAuto = this.colorAuto;
    this.preset.icon = this.icon;

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
    this.preset.fadeInCurve = this.fadeInCurve;
    this.preset.fadeOutCurve = this.fadeOutCurve;

    // the icon and the color of the preset are part of the lists, which are only built
    // again when the presets change
    this.presetService.presetsChanged.next();

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
