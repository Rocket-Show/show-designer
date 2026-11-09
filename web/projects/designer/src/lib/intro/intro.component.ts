import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AiLooksService } from '../services/ai-looks.service';
import { ConfigService } from '../services/config.service';
import { HardwarePromoService } from '../services/hardware-promo.service';
import { IntroService } from '../services/intro.service';
import { LayoutService } from '../services/layout.service';

@Component({
  selector: 'lib-app-intro',
  templateUrl: './intro.component.html',
  styleUrls: ['./intro.component.css'],
  standalone: false,
})
export class IntroComponent implements OnInit, OnDestroy {
  public promoLink: string;

  private stepChangedSubscription: Subscription;

  constructor(
    public introService: IntroService,
    public hardwarePromoService: HardwarePromoService,
    public layoutService: LayoutService,
    public configService: ConfigService,
    private aiLooksService: AiLooksService
  ) {
    this.promoLink = this.hardwarePromoService.link('intro-finish');
  }

  ngOnInit() {
    this.stepChangedSubscription = this.introService.stepChanged.subscribe(() => {
      // on a phone, the panel of the step may be anywhere down the page: it is scrolled into
      // view, once it has been marked
      if (this.layoutService.compact) {
        setTimeout(() => document.querySelector('#designer .card-intro-active')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    });
  }

  ngOnDestroy() {
    this.stepChangedSubscription.unsubscribe();
  }

  close() {
    this.introService.setShowIntro(false);
  }

  // where the tour starts and ends, it offers to let the AI design the looks instead (see AiLooksService.start)
  get offersAi(): boolean {
    return this.configService.aiLooks && (this.introService.activeStep === 'start' || this.introService.activeStep === 'finish');
  }

  startAi() {
    this.close();
    this.aiLooksService.start();
  }
}
