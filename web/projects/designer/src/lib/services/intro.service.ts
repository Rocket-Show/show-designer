import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { ConfigService } from './config.service';
import { LayoutService } from './layout.service';

// the steps of the intro in their order, and where the intro is shown on each of them (in
// percent of the designer, next to the panel the step is about). On a phone, it is shown at the
// bottom of the screen instead.
const allSteps: { name: string; topPercentage: number; leftPercentage: number }[] = [
  { name: 'start', topPercentage: 50, leftPercentage: 50 },
  { name: 'preview', topPercentage: 60, leftPercentage: 40 },
  { name: 'fixtures', topPercentage: 40, leftPercentage: 30 },
  { name: 'presets', topPercentage: 30, leftPercentage: 50 },
  { name: 'capabilities', topPercentage: 50, leftPercentage: 60 },
  { name: 'scenes', topPercentage: 50, leftPercentage: 40 },
  { name: 'timeline', topPercentage: 40, leftPercentage: 50 },
  { name: 'finish', topPercentage: 50, leftPercentage: 50 },
];

@Injectable({
  providedIn: 'root',
})
export class IntroService {
  showIntro = false;
  activeStep = 'start';
  positionTopPercentage = 50;
  positionLeftPercentage = 50;
  stepChanged: Subject<void> = new Subject<void>();

  constructor(private configService: ConfigService, private layoutService: LayoutService) {}

  // a phone has no 3D preview to show
  private get steps() {
    return this.layoutService.compact ? allSteps.filter((step) => step.name !== 'preview') : allSteps;
  }

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
    this.goTo(0);
    this.setShowIntro(true);
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
    this.goTo(Math.min(this.getStepIndex() + 1, this.steps.length - 1));
  }

  back() {
    this.goTo(Math.max(this.getStepIndex() - 1, 0));
  }

  private getStepIndex(): number {
    return this.steps.findIndex((step) => step.name === this.activeStep);
  }

  private goTo(index: number) {
    const step = this.steps[index];

    this.activeStep = step.name;
    this.positionTopPercentage = step.topPercentage;
    this.positionLeftPercentage = step.leftPercentage;
    this.stepChanged.next();
  }
}
