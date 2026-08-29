import { Component } from '@angular/core';
import { HardwarePromoService } from '../services/hardware-promo.service';
import { IntroService } from '../services/intro.service';

@Component({
  selector: 'lib-app-hardware-promo-bar',
  templateUrl: './hardware-promo-bar.component.html',
  styleUrls: ['./hardware-promo-bar.component.css'],
  standalone: false,
})
export class HardwarePromoBarComponent {
  public link: string;

  constructor(public hardwarePromoService: HardwarePromoService, public introService: IntroService) {
    this.link = this.hardwarePromoService.link('returning-visitor-bar');
  }

  // don't get in the way of the introduction, which owns the screen
  get show(): boolean {
    return this.hardwarePromoService.showBar && !this.introService.showIntro;
  }

  dismiss() {
    this.hardwarePromoService.dismissBar();
  }
}
