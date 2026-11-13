import { Component, OnDestroy, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import {
  AiFixturesError,
  AiFixturesLookup,
  AiFixturesRequest,
  AiFixturesResponse,
  AiFixturesStatus,
  buildFixtureReview,
  FixtureReviewMode,
  getAiFixturesError,
} from '../../models/ai-fixtures';
import { FixtureProfile } from '../../models/fixture-profile';
import { FixtureStateBadge, FixtureVersion, getModeStateBadge, getStateBadgeKey } from '../../models/fixture-version';
import { AiFixturesService } from '../../services/ai-fixtures.service';
import { FixtureLibraryService, FixtureManufacturer } from '../../services/fixture-library.service';
import { FixtureService } from '../../services/fixture.service';
import { ProjectService } from '../../services/project.service';
import { UserEnsureLoginService } from '../../services/user-ensure-login.service';

// what the dialog shows: what the user gives, the library being searched, what it has already, the AI at work, and the
// review of the profile it made
export type FixtureAiView = 'input' | 'looking' | 'found' | 'generating' | 'review';

// what the user has the AI read: a manual (PDF), a link to one, or the manual it searches itself
export type FixtureAiSource = 'manual' | 'link' | 'search';

// What the dialog hands back to the fixture pool: a version of the library to add a fixture of (its uuid), or the
// profile the AI made, which is in the project already; in the mode chosen. Nothing, when it is closed.
export interface FixtureAiResult {
  uuid?: string;
  profile?: FixtureProfile;
  mode?: string;
}

// a version the library has already, with the state of each of its modes
interface FoundVersion {
  version: FixtureVersion;
  modes: { name: string; shortName: string; badge: FixtureStateBadge; key: string }[];
}

// "Create profile with AI" (see docs/fixture-library.md, section 10): the user names the manufacturer and the model of a
// fixture and gives its manual, a link to it, or leaves the AI to search it. The library is looked into first, which
// costs nothing: a version it has can be taken at once. Else the AI makes a profile, which takes minutes, and the
// user reviews it, channel by channel, against where the AI read it in the manual, before it is added to the project.
// Opened for a version (parent), the AI improves that version as the user says instead.
@Component({
  selector: 'lib-fixture-ai',
  templateUrl: './fixture-ai.component.html',
  styleUrls: ['./fixture-ai.component.css'],
  standalone: false,
})
export class FixtureAiComponent implements OnInit, OnDestroy {
  // the value of the list of the manufacturers which stands for a new one (no key of the library holds a "~")
  static readonly newManufacturer = '~new';

  // set by the fixture pool: the version to improve, and whether the fixtures using it are changed to the result
  parent: FixtureVersion;
  exchange = false;

  onClose = new Subject<FixtureAiResult>();

  readonly sources: FixtureAiSource[] = ['manual', 'link', 'search'];

  view: FixtureAiView = 'input';
  status: AiFixturesStatus;
  loadingStatus = true;
  manufacturers: FixtureManufacturer[] = [];

  source: FixtureAiSource = 'manual';
  manual: File;
  link = '';
  manufacturerShortName = '';
  manufacturerName = '';
  model = '';
  mode = '';
  instruction = '';

  found: AiFixturesLookup;
  foundVersions: FoundVersion[] = [];

  // the profile the AI made, and the mode of it which the review shows and which a fixture is added in
  response: AiFixturesResponse;
  reviewModes: FixtureReviewMode[] = [];
  reviewMode: FixtureReviewMode;

  // what went wrong, or the key of the translation of a request refused for want of an account
  error: AiFixturesError;

  // how long the AI has been at work
  elapsedSeconds = 0;
  private timer: ReturnType<typeof setInterval>;

  constructor(
    public bsModalRef: BsModalRef,
    private aiFixturesService: AiFixturesService,
    private fixtureLibraryService: FixtureLibraryService,
    private fixtureService: FixtureService,
    private projectService: ProjectService,
    private userEnsureLoginService: UserEnsureLoginService
  ) {}

  ngOnInit() {
    this.aiFixturesService.getStatus().subscribe({
      next: (status) => {
        this.status = status;
        this.loadingStatus = false;
      },
      error: (error) => {
        this.status = { available: false };
        this.loadingStatus = false;
        this.showError(error);
      },
    });

    if (!this.parent) {
      this.fixtureLibraryService.getManufacturers().subscribe({
        next: (manufacturers) => (this.manufacturers = manufacturers),
        error: () => (this.manufacturerShortName = FixtureAiComponent.newManufacturer),
      });
    }
  }

  ngOnDestroy() {
    this.stopTimer();
  }

  get available(): boolean {
    return !!this.status && this.status.available;
  }

  // how many profiles the user can still have made today, or undefined for as many as they like
  get requestsLeft(): number {
    if (!this.status || typeof this.status.requestsPerUserPerDay !== 'number') {
      return undefined;
    }

    return Math.max(this.status.requestsPerUserPerDay - (this.status.requestsLast24Hours || 0), 0);
  }

  get newManufacturer(): boolean {
    return this.manufacturerShortName === FixtureAiComponent.newManufacturer;
  }

  // is everything there to look the fixture up and to have it made: the manufacturer, the model and what to read
  get complete(): boolean {
    if (this.parent) {
      return !!this.instruction.trim();
    }

    const manufacturer = this.newManufacturer ? !!this.manufacturerName.trim() : !!this.manufacturerShortName;
    const source = this.source === 'manual' ? !!this.manual : this.source === 'link' ? /^https?:\/\/\S+$/i.test(this.link.trim()) : true;

    return manufacturer && !!this.model.trim() && source;
  }

  get canGenerate(): boolean {
    return this.available && this.complete && this.requestsLeft !== 0;
  }

  setSource(source: FixtureAiSource) {
    this.source = source;
  }

  // the manual picked, unless it is larger than the API takes
  setManual(file: File) {
    this.error = undefined;
    this.manual = undefined;

    if (file && this.status?.maxManualBytes && file.size > this.status.maxManualBytes) {
      this.error = {
        key: 'designer.fixture-ai.manual-too-large',
        params: { size: this.megabytes(file.size), max: this.megabytes(this.status.maxManualBytes) },
      };
      return;
    }

    this.manual = file;
  }

  private megabytes(bytes: number): string {
    return (bytes / 1024 / 1024).toFixed(1);
  }

  // the next step from the inputs: the lookup in the library, or the AI right away for a version to improve
  next() {
    if (this.parent) {
      this.generate();
    } else {
      this.lookUp();
    }
  }

  // look into the library for the fixture, and for what was made from the manual before
  async lookUp() {
    if (!this.available || !this.complete) {
      return;
    }

    this.view = 'looking';
    this.error = undefined;

    const sha256 = this.source === 'manual' ? await this.aiFixturesService.sha256(this.manual) : undefined;
    const manufacturer = this.newManufacturer ? '' : this.manufacturerShortName;

    this.aiFixturesService.lookup(manufacturer, this.model.trim(), sha256 || '').subscribe({
      next: (found) => {
        this.found = found;
        this.foundVersions = (found.versions || []).map((version) => ({
          version,
          modes: (version.modeStates || []).map((mode) => {
            const badge = getModeStateBadge(version, mode.shortName);

            return { name: mode.name || mode.shortName, shortName: mode.shortName, badge, key: getStateBadgeKey(badge) };
          }),
        }));
        this.view = 'found';
      },
      error: (error) => {
        this.view = 'input';
        this.showError(error);
      },
    });
  }

  // take a version the library has, in one of its modes (or in the mode the pool picks)
  use(version: FixtureVersion, mode?: string) {
    this.close({ uuid: version.uuid, mode });
  }

  // have the AI improve a version the library has, e.g. one missing a mode
  improveFound(version: FixtureVersion) {
    this.parent = version;
    this.view = 'input';
    this.error = undefined;
  }

  // the AI makes the profile, which the user reviews once it is there
  generate() {
    if (!this.canGenerate) {
      return;
    }

    const back = this.view;
    this.view = 'generating';
    this.error = undefined;
    this.startTimer();

    this.aiFixturesService.generate(this.getRequest()).subscribe({
      next: (response) => {
        this.stopTimer();
        this.response = response;
        this.status = {
          ...this.status,
          requestsLast24Hours: response.requestsLast24Hours,
          requestsPerUserPerDay: response.requestsPerUserPerDay,
        };

        const profile = this.getProfile();

        this.reviewModes = buildFixtureReview(
          profile,
          response.review,
          (repeatFor) => this.fixtureService.getPixelsInOrder(profile, repeatFor).length
        );
        this.reviewMode = this.reviewModes.find((mode) => mode.shortName === this.mode.trim()) || this.reviewModes[0];
        this.view = 'review';
      },
      error: (error) => {
        this.stopTimer();
        this.view = back;
        this.showError(error);
      },
    });
  }

  getRequest(): AiFixturesRequest {
    const request: AiFixturesRequest = {};

    if (this.mode.trim()) {
      request.mode = this.mode.trim();
    }

    if (this.parent) {
      request.parentUuid = this.parent.uuid;
      request.instruction = this.instruction.trim();

      return request;
    }

    if (this.newManufacturer) {
      request.manufacturerName = this.manufacturerName.trim();
    } else {
      request.manufacturerShortName = this.manufacturerShortName;
    }

    request.model = this.model.trim();

    if (this.source === 'manual') {
      request.manual = this.manual;
    } else if (this.source === 'link') {
      request.link = this.link.trim();
    }

    return request;
  }

  // the profile the AI made, with what the library knows about its version
  private getProfile(): FixtureProfile {
    return new FixtureProfile({ ...this.response.version, ...this.response.profile });
  }

  // the profile the AI made goes into the project (once), and the pool adds a fixture of it in the mode reviewed
  add() {
    let profile = this.fixtureService.getProfileByUuid(this.response.version.uuid);

    if (!profile) {
      profile = this.getProfile();
      this.projectService.project.fixtureProfiles.push(profile);
    }

    this.close({ profile, mode: this.reviewMode?.shortName });
  }

  // back to the inputs, e.g. to change the model looked up
  back() {
    this.view = 'input';
    this.error = undefined;
  }

  cancel() {
    this.close(undefined);
  }

  private close(result: FixtureAiResult) {
    this.onClose.next(result);
    this.bsModalRef.hide();
  }

  private showError(error: any) {
    this.error = this.userEnsureLoginService.isRefused(error)
      ? { key: this.userEnsureLoginService.refused('designer.fixture-ai.log-in') }
      : getAiFixturesError(error);
  }

  private startTimer() {
    this.elapsedSeconds = 0;
    this.timer = setInterval(() => this.elapsedSeconds++, 1000);
  }

  private stopTimer() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  // the time the AI has been at work, as minutes and seconds
  get elapsed(): string {
    return Math.floor(this.elapsedSeconds / 60) + ':' + ('0' + (this.elapsedSeconds % 60)).slice(-2);
  }
}
