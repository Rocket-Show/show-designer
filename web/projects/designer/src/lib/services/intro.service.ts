import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { ConfigService } from './config.service';

@Injectable({
  providedIn: 'root',
})
export class IntroService {
  showIntro = false;
  activeStep = 'start';
  positionTopPercentage = 50;
  positionLeftPercentage = 50;
  stylePosition = 'top: calc(50% - 150px); left: calc(50% - 200px);';
  stepChanged: Subject<void> = new Subject<void>();

  constructor(private configService: ConfigService) {}

  refresh() {
    // called, as soon as the config has been updated
    if (this.configService.intro) {
      if (localStorage.getItem('showIntro')) {
        this.showIntro = localStorage.getItem('showIntro') === 'true';
      } else {
        this.showIntro = true;
      }
    }
  }

  setShowIntro(value: boolean) {
    this.showIntro = value;
    if (value) {
      localStorage.setItem('showIntro', 'true');
    } else {
      localStorage.setItem('showIntro', 'false');
    }
    this.stepChanged.next();
  }

  reset() {
    this.activeStep = 'start';
    this.setShowIntro(true);
    this.stepChanged.next();
  }

  showStep(step: string): boolean {
    if (!this.showIntro) {
      return false;
    }

    if (this.activeStep !== step) {
      return false;
    }

    return true;
  }

  next() {
    switch (this.activeStep) {
      case 'start':
        this.activeStep = 'preview';
        this.positionTopPercentage = 60;
        this.positionLeftPercentage = 40;
        break;
      case 'preview':
        this.activeStep = 'fixtures';
        this.positionTopPercentage = 40;
        this.positionLeftPercentage = 30;
        break;
      case 'fixtures':
        this.activeStep = 'presets';
        this.positionTopPercentage = 30;
        this.positionLeftPercentage = 50;
        break;
      case 'presets':
        this.activeStep = 'capabilities';
        this.positionTopPercentage = 50;
        this.positionLeftPercentage = 70;
        break;
      case 'capabilities':
        this.activeStep = 'scenes';
        this.positionTopPercentage = 50;
        this.positionLeftPercentage = 40;
        break;
      case 'scenes':
        this.activeStep = 'timeline';
        this.positionTopPercentage = 40;
        this.positionLeftPercentage = 50;
        break;
      case 'scene-arrangement':
        this.activeStep = 'timeline';
        this.positionTopPercentage = 50;
        this.positionLeftPercentage = 40;
        break;
      case 'timeline':
        this.activeStep = 'finish';
        this.positionTopPercentage = 50;
        this.positionLeftPercentage = 50;
        break;
    }

    this.stepChanged.next();
  }

  back() {
    switch (this.activeStep) {
      case 'preview':
        this.activeStep = 'start';
        this.positionTopPercentage = 50;
        this.positionLeftPercentage = 50;
        break;
      case 'fixtures':
        this.activeStep = 'preview';
        this.positionTopPercentage = 60;
        this.positionLeftPercentage = 40;
        break;
      case 'presets':
        this.activeStep = 'fixtures';
        this.positionTopPercentage = 30;
        this.positionLeftPercentage = 50;
        break;
      case 'capabilities':
        this.activeStep = 'presets';
        this.positionTopPercentage = 40;
        this.positionLeftPercentage = 30;
        break;
      case 'scenes':
        this.activeStep = 'capabilities';
        this.positionTopPercentage = 50;
        this.positionLeftPercentage = 60;
        break;
      case 'scene-arrangement':
        this.activeStep = 'scenes';
        this.positionTopPercentage = 50;
        this.positionLeftPercentage = 40;
        break;
      case 'timeline':
        this.activeStep = 'scene-arrangement';
        this.positionTopPercentage = 50;
        this.positionLeftPercentage = 40;
        break;
      case 'finish':
        this.activeStep = 'timeline';
        this.positionTopPercentage = 40;
        this.positionLeftPercentage = 50;
        break;
    }

    this.stepChanged.next();
  }
}
