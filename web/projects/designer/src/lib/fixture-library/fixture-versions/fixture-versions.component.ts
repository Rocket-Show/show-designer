import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FixtureStateBadge, FixtureVersion, getModeStateBadge, getStateBadgeKey } from '../../models/fixture-version';
import { FixtureLibraryService } from '../../services/fixture-library.service';

// a version in the list, with the state of each of its modes
interface VersionRow {
  version: FixtureVersion;
  modes: { name: string; badge: FixtureStateBadge; key: string }[];
}

// All versions of a fixture in the library, the best one first (see docs/fixture-library.md, section 11): where each
// comes from, the state of each of its modes and how many use it. The one the project uses is marked, any other one
// can be taken instead of it, but one an admin hid (junk, abuse), and a logged in user can have the AI improve one.

@Component({
  selector: 'lib-fixture-versions',
  templateUrl: './fixture-versions.component.html',
  styleUrls: ['./fixture-versions.component.css'],
  standalone: false,
})
export class FixtureVersionsComponent implements OnInit {
  // a version of the fixture to list (or a plain uuid of it)
  @Input() uuid: string;

  // the version the project uses, if it uses one
  @Input() currentUuid: string;

  // what taking a version does, as the key of the translation of its button, e.g. adding a fixture of it; none for a
  // list without the button
  @Input() useLabel: string;

  // whether the AI can be asked to improve a version
  @Input() canImprove = false;

  @Output() use = new EventEmitter<FixtureVersion>();
  @Output() improve = new EventEmitter<FixtureVersion>();

  rows: VersionRow[] = [];
  loading = true;
  failed = false;

  constructor(private fixtureLibraryService: FixtureLibraryService) {}

  ngOnInit() {
    this.fixtureLibraryService.getVersions(this.uuid).subscribe({
      next: (versions) => {
        this.rows = versions.map((version) => ({
          version,
          modes: (version.modeStates || []).map((mode) => {
            const badge = getModeStateBadge(version, mode.shortName);

            return { name: mode.name || mode.shortName, badge, key: getStateBadgeKey(badge) };
          }),
        }));
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.failed = true;
      },
    });
  }
}
