import { Component, OnInit } from '@angular/core';
import { HardwarePromoService } from '../services/hardware-promo.service';
import { IntroService } from '../services/intro.service';

@Component({
  selector: 'lib-app-intro',
  templateUrl: './intro.component.html',
  styleUrls: ['./intro.component.css'],
  standalone: false,
})
export class IntroComponent implements OnInit {
  public promoLink: string;

  constructor(public introService: IntroService, public hardwarePromoService: HardwarePromoService) {
    this.promoLink = this.hardwarePromoService.link('intro-finish');
  }

  ngOnInit() {}

  close() {
    this.introService.setShowIntro(false);
  }
}
