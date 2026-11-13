import { Component, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { getForwardingErrorKey } from '../../models/api-error';
import { FixtureProfile } from '../../models/fixture-profile';
import { FixtureLibraryService, FixtureManufacturer } from '../../services/fixture-library.service';
import { FixtureService } from '../../services/fixture.service';
import { ProjectService } from '../../services/project.service';
import { UserEnsureLoginService } from '../../services/user-ensure-login.service';

// "Offer to the library" (see docs/fixture-library.md, section 10): a profile created from a file becomes a version of
// the library from a user, which everyone can use and vote on, e.g. one the user corrected by hand. The library checks
// it like a profile of the AI. The file is what is offered, not the copy in the project (the designer reads a profile
// into a model of its own): the one read in this session, or the user picks it again. The new version goes into the
// project, and the fixture pool changes the fixtures of the file to it, so that they count for it.
@Component({
  selector: 'lib-fixture-offer',
  templateUrl: './fixture-offer.component.html',
  standalone: false,
})
export class FixtureOfferComponent implements OnInit {
  // the value of the list of the manufacturers which stands for a new one (no key of the library holds a "~")
  static readonly newManufacturer = '~new';

  // set by the fixture pool: the copy of the profile created from a file
  profile: FixtureProfile;

  // the version of the library the profile became, once in the project
  onClose = new Subject<FixtureProfile>();

  manufacturers: FixtureManufacturer[] = [];
  manufacturerShortName = '';
  manufacturerName = '';

  // the profile file, as it was read
  file: any;

  sending = false;

  // what went wrong, as the key of the translation, and what the library found wrong with the profile
  errorKey: string;
  errors: string[] = [];

  constructor(
    public bsModalRef: BsModalRef,
    private fixtureLibraryService: FixtureLibraryService,
    private fixtureService: FixtureService,
    private projectService: ProjectService,
    private userEnsureLoginService: UserEnsureLoginService
  ) {}

  ngOnInit() {
    this.file = this.fixtureLibraryService.files.get(this.profile.uuid);
    this.manufacturerName = this.profile.manufacturerName || '';

    // the manufacturer of the file, if the library has it, else a new one by the name of the file
    this.fixtureLibraryService.getManufacturers().subscribe({
      next: (manufacturers) => {
        this.manufacturers = manufacturers;
        this.manufacturerShortName = manufacturers.some((manufacturer) => manufacturer.shortName === this.profile.manufacturerShortName)
          ? this.profile.manufacturerShortName
          : FixtureOfferComponent.newManufacturer;
      },
      error: () => (this.manufacturerShortName = FixtureOfferComponent.newManufacturer),
    });
  }

  get newManufacturer(): boolean {
    return this.manufacturerShortName === FixtureOfferComponent.newManufacturer;
  }

  get canOffer(): boolean {
    return !!this.file && !this.sending && (this.newManufacturer ? !!this.manufacturerName.trim() : !!this.manufacturerShortName);
  }

  // The profile file picked again: the one of this profile (by its keys) only
  async setFile(file: File) {
    this.errorKey = undefined;
    this.file = undefined;

    if (!file) {
      return;
    }

    let json: any;

    try {
      json = JSON.parse(await file.text());
    } catch {
      json = undefined;
    }

    if (json && json.manufacturerKey + '/' + json.fixtureKey === this.profile.uuid) {
      this.file = json;
      this.fixtureLibraryService.files.set(this.profile.uuid, json);
    } else {
      this.errorKey = 'designer.fixture-offer.wrong-file';
    }
  }

  offer() {
    if (!this.canOffer) {
      return;
    }

    this.userEnsureLoginService.login().subscribe(() => {
      this.sending = true;
      this.errorKey = undefined;
      this.errors = [];

      const manufacturerShortName = this.newManufacturer ? undefined : this.manufacturerShortName;
      const manufacturerName = this.newManufacturer ? this.manufacturerName.trim() : undefined;

      this.fixtureLibraryService.offer(this.file, manufacturerShortName, manufacturerName).subscribe({
        next: (response) => {
          this.sending = false;

          // the version, as the library has it, goes into the project
          let version = this.fixtureService.getProfileByUuid(response.version.uuid);

          if (!version) {
            version = new FixtureProfile({ ...response.version, ...this.file });
            this.projectService.project.fixtureProfiles.push(version);
          }

          this.onClose.next(version);
          this.bsModalRef.hide();
        },
        error: (error) => {
          this.sending = false;

          if (this.userEnsureLoginService.isRefused(error)) {
            this.errorKey = this.userEnsureLoginService.refused('designer.fixture-offer.log-in');
          } else if (error?.error?.error === 'invalid-profile') {
            this.errorKey = 'designer.fixture-offer.invalid-profile';
            this.errors = Array.isArray(error.error.errors) ? error.error.errors : [];
          } else {
            this.errorKey = getForwardingErrorKey(error) || 'designer.fixture-offer.failed';
          }
        },
      });
    });
  }

  cancel() {
    this.onClose.next(undefined);
    this.bsModalRef.hide();
  }
}
