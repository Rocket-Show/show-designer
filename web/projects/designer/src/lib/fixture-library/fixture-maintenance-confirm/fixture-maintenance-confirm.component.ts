import { Component, HostListener, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { FixtureReviewNote } from '../../models/ai-fixtures';
import { FixtureProfile } from '../../models/fixture-profile';
import { MaintenanceAction } from '../../models/maintenance';
import { AiFixturesService } from '../../services/ai-fixtures.service';

// Asks the user before the fixture pool has a fixture of a profile of the AI or a user reset itself or switch its lamp
// on (see docs/fixture-library.md, section 10): such a profile may have the channel or the range wrong, and a wrong
// value could do something else on the real fixture. It shows the channel and the range the value is sent on, and for
// a profile of the AI the row of the manual it read them from.
@Component({
  selector: 'lib-fixture-maintenance-confirm',
  templateUrl: './fixture-maintenance-confirm.component.html',
  standalone: false,
})
export class FixtureMaintenanceConfirmComponent implements OnInit {
  // set by the fixture pool: what the fixture is asked for, the profile, the channel and the capability doing it
  action: MaintenanceAction;
  profile: FixtureProfile;
  channelName: string;
  range: number[] = [];
  label: string;

  // true once the user confirmed it
  onClose = new Subject<boolean>();

  // where the AI read the channel in the manual, if it says
  note: FixtureReviewNote;
  loading = false;

  constructor(public bsModalRef: BsModalRef, private aiFixturesService: AiFixturesService) {}

  ngOnInit() {
    if (this.profile.origin !== 'ai') {
      return;
    }

    this.loading = true;

    this.aiFixturesService.getReview(this.profile.uuid).subscribe({
      next: (review) => {
        this.loading = false;
        this.note = review?.channels?.[this.channelName];
      },
      error: () => (this.loading = false),
    });
  }

  ok() {
    this.onClose.next(true);
    this.bsModalRef.hide();
  }

  cancel() {
    this.onClose.next(false);
    this.bsModalRef.hide();
  }

  @HostListener('document:keydown.enter', ['$event'])
  handleKeyboardEvent() {
    this.ok();
  }
}
