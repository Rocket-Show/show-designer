import { Component, HostListener } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { UniverseConfig } from '../../models/universe-config';
import { UuidService } from '../../services/uuid.service';

@Component({
  selector: 'lib-fixture-pool-edit-universes',
  templateUrl: './fixture-pool-edit-universes.component.html',
  styleUrls: ['./fixture-pool-edit-universes.component.css'],
  standalone: false,
})
export class FixturePoolEditUniversesComponent {
  public universes: UniverseConfig[] = [];
  public newUniverseName = '';
  public onClose: Subject<UniverseConfig[] | undefined> = new Subject();

  constructor(public bsModalRef: BsModalRef, private uuidService: UuidService) {}

  addUniverse() {
    const name = (this.newUniverseName || '').trim();
    if (!name) return;
    this.universes.push({ uuid: this.uuidService.getUuid(), name });
    this.newUniverseName = '';
  }

  removeUniverse(universe: UniverseConfig) {
    const index = this.universes.findIndex((u) => u.uuid === universe.uuid);
    if (index >= 0) {
      this.universes.splice(index, 1);
    }
  }

  ok() {
    this.onClose.next(this.universes);
    this.bsModalRef.hide();
  }

  cancel() {
    this.onClose.next(undefined);
    this.bsModalRef.hide();
  }
}
