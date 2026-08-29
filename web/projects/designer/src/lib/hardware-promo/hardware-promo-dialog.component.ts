import { Component } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { HardwarePromoService } from '../services/hardware-promo.service';

@Component({
  selector: 'lib-app-hardware-promo-dialog',
  templateUrl: './hardware-promo-dialog.component.html',
  standalone: false,
})
export class HardwarePromoDialogComponent {
  public link: string;

  constructor(private bsModalRef: BsModalRef, hardwarePromoService: HardwarePromoService) {
    this.link = hardwarePromoService.link('export');
  }

  close() {
    this.bsModalRef.hide();
  }
}
