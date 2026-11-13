import { Component, Input } from '@angular/core';
import {
  FixtureStateBadge,
  FixtureVersion,
  getModeStateBadge,
  getStateBadgeKey,
  getVersionStateBadge,
  isGenerated,
} from '../../models/fixture-version';

// What is known about a version of a profile, in a line (see docs/fixture-library.md, section 12): where it comes from
// (the Open Fixture Library, the AI, a user), what the votes tell about it (or about the mode passed) and how many
// projects and devices use it. A generated version explains in a popover what that means.
@Component({
  selector: 'lib-fixture-version-badges',
  templateUrl: './fixture-version-badges.component.html',
  styleUrls: ['./fixture-version-badges.component.css'],
  standalone: false,
})
export class FixtureVersionBadgesComponent {
  generated = false;
  stateBadge: FixtureStateBadge;
  stateKey: string;

  private _version: FixtureVersion;
  private _mode: string;

  @Input()
  set version(value: FixtureVersion) {
    this._version = value;
    this.update();
  }

  get version(): FixtureVersion {
    return this._version;
  }

  // the short name of the mode whose state is shown instead of the one of the whole version
  @Input()
  set mode(value: string) {
    this._mode = value;
    this.update();
  }

  get mode(): string {
    return this._mode;
  }

  // the uses of the version, unless the library doesn't count them (e.g. a profile from a file)
  get usage(): number {
    return typeof this._version?.usage === 'number' ? this._version.usage : undefined;
  }

  private update() {
    this.generated = isGenerated(this._version);
    this.stateBadge = this._mode === undefined ? getVersionStateBadge(this._version) : getModeStateBadge(this._version, this._mode);
    this.stateKey = getStateBadgeKey(this.stateBadge);
  }
}
