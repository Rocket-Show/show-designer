import { Component, HostListener, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { Fixture } from '../models/fixture';
import { FixtureProfile } from '../models/fixture-profile';
import { ConfigService } from '../services/config.service';
import { FixtureService } from '../services/fixture.service';
import { PresetService } from '../services/preset.service';
import { PreviewService } from '../services/preview.service';
import { ProjectService } from '../services/project.service';
import { UuidService } from '../services/uuid.service';
import { FixturePoolCreateFromFileComponent } from './fixture-pool-create-from-file/fixture-pool-create-from-file.component';
import { PresetFixture } from '../models/preset-fixture';

@Component({
  selector: 'lib-app-fixture-pool',
  templateUrl: './fixture-pool.component.html',
  styleUrls: ['./fixture-pool.component.css'],
  standalone: false,
})
export class FixturePoolComponent implements OnInit {
  private profiles: FixtureProfile[];
  public filteredProfiles: FixtureProfile[];
  public loadingProfiles = false;

  public fixturePool: Fixture[];

  public dmxChannels: number[] = [];
  public selectedFixture: Fixture;
  public selectedFixtureProfile: FixtureProfile;
  public showChannelNumbers = false;
  public channelDragFixture: Fixture;
  public channelDragOffset: number;

  public onClose: Subject<number> = new Subject();

  public searchExpression: string;

  public updatingProfiles: boolean;

  constructor(
    public bsModalRef: BsModalRef,
    public fixtureService: FixtureService,
    private uuidService: UuidService,
    public projectService: ProjectService,
    private previewService: PreviewService,
    private translateService: TranslateService,
    private toastrService: ToastrService,
    private presetService: PresetService,
    public configService: ConfigService,
    private modalService: BsModalService
  ) {
    this.fixturePool = [...this.projectService.project.fixtures];

    if (this.fixturePool.length > 0) {
      this.selectFixture(this.fixturePool[0]);
    }
  }

  ngOnInit() {
    for (let i = 0; i < 512; i++) {
      this.dmxChannels.push(0);
    }

    this.loadProfiles();
  }

  private loadProfiles() {
    this.loadingProfiles = true;

    this.fixtureService.getSearchProfiles().subscribe((profiles) => {
      this.profiles = profiles;
      this.filterProfiles();
      this.loadingProfiles = false;
    });
  }

  selectFixture(fixture: Fixture) {
    this.selectedFixtureProfile = undefined;
    if (fixture) {
      this.selectedFixtureProfile = this.fixtureService.getProfileByUuid(fixture.profileUuid);
    }
    this.selectedFixture = fixture;
  }

  filterProfiles() {
    if (!this.searchExpression || !this.profiles) {
      this.filteredProfiles = this.profiles;
      return;
    }

    this.filteredProfiles = [];

    const keywords = this.searchExpression.split(' ');

    for (const profile of this.profiles) {
      let foundKeywords = 0;

      for (const keyword of keywords) {
        if (
          profile.uuid.toLowerCase().indexOf(keyword.toLowerCase()) !== -1 ||
          profile.name.toLowerCase().indexOf(keyword.toLowerCase()) !== -1 ||
          profile.manufacturerName.toLowerCase().indexOf(keyword.toLowerCase()) !== -1
        ) {
          foundKeywords++;
        }
      }

      if (foundKeywords === keywords.length) {
        this.filteredProfiles.push(profile);
      }
    }
  }

  addFixture(searchProfile: FixtureProfile) {
    // Load the profile details, if not already done. There is only a
    // minimal profile passed from the search.
    this.fixtureService.loadProfileByUuid(searchProfile.uuid).subscribe(() => {
      const profile = this.fixtureService.getProfileByUuid(searchProfile.uuid);
      const newFixture = this.fixtureService.addFixture(profile, this.fixturePool);
      if (newFixture) {
        this.selectFixture(newFixture);
      }
    });
  }

  addCopy(originalFixture: Fixture) {
    const fixture = new Fixture();

    fixture.uuid = this.uuidService.getUuid();
    fixture.profileUuid = originalFixture.profileUuid;
    fixture.name = originalFixture.name;
    fixture.modeShortName = originalFixture.modeShortName;
    fixture.dmxFirstChannel = originalFixture.dmxFirstChannel;
    fixture.dmxUniverseUuid = originalFixture.dmxUniverseUuid;

    this.fixturePool.push(fixture);
    this.selectFixture(fixture);
  }

  removeFixture(fixture: Fixture) {
    for (let i = 0; i < this.fixturePool.length; i++) {
      if (this.fixturePool[i].uuid === fixture.uuid) {
        if (this.selectedFixture === this.fixturePool[i]) {
          this.selectFixture(undefined);
        }
        this.fixturePool.splice(i, 1);
        break;
      }
    }

    if (!this.selectedFixture && this.fixturePool && this.fixturePool.length > 0) {
      this.selectFixture((this.selectedFixture = this.fixturePool[0]));
    }

    // remove unused profiles
    for (let i = 0; i < this.projectService.project.fixtureProfiles.length; i++) {
      let profileUsed = false;

      for (const fixtureInPool of this.fixturePool) {
        if (fixtureInPool.profileUuid === this.projectService.project.fixtureProfiles[i].uuid) {
          profileUsed = true;
          break;
        }
      }

      if (!profileUsed) {
        this.projectService.project.fixtureProfiles.splice(i, 1);
      }
    }
  }

  channelOccupied(index: number): boolean {
    for (const fixture of this.fixturePool) {
      const profile = this.fixtureService.getProfileByUuid(fixture.profileUuid);
      const mode = this.fixtureService.getModeByFixture(profile, fixture);
      const channelCount = this.fixtureService.getModeChannelCount(profile, mode);

      if (index >= fixture.dmxFirstChannel && index < fixture.dmxFirstChannel + channelCount) {
        return true;
      }
    }

    return false;
  }

  channelOccupiedStart(index: number): boolean {
    for (const fixture of this.fixturePool) {
      if (index === fixture.dmxFirstChannel) {
        return true;
      }
    }

    return false;
  }

  channelOccupiedEnd(index: number): boolean {
    for (const fixture of this.fixturePool) {
      const profile = this.fixtureService.getProfileByUuid(fixture.profileUuid);
      const mode = this.fixtureService.getModeByFixture(profile, fixture);
      const channelCount = this.fixtureService.getModeChannelCount(profile, mode);

      if (index === fixture.dmxFirstChannel + channelCount - 1) {
        return true;
      }
    }

    return false;
  }

  channelOverlapped(index: number): boolean {
    let occupiedFixture: Fixture;

    for (const fixture of this.fixturePool) {
      const profile = this.fixtureService.getProfileByUuid(fixture.profileUuid);
      const mode = this.fixtureService.getModeByFixture(profile, fixture);
      const channelCount = this.fixtureService.getModeChannelCount(profile, mode);

      if (index >= fixture.dmxFirstChannel && index < fixture.dmxFirstChannel + channelCount) {
        if (occupiedFixture) {
          if (occupiedFixture.dmxFirstChannel !== fixture.dmxFirstChannel || occupiedFixture.modeShortName !== fixture.modeShortName) {
            // fixtures are allowed to overlap, if they start at the same channel and
            // use the same mode. otherwise it's not allowed.
            return true;
          }
        } else {
          occupiedFixture = fixture;
        }
      }
    }

    return false;
  }

  channelMouseDown(event: any) {
    // start dragging
    const selectedIndex = event.target.dataset.index;
    let newSelectedFixture: Fixture;

    // find a dragging fixture and select it, but don't change the selection, if the
    // currently selected fixture might also be selected (on overlapped fixtures)
    for (const fixture of this.fixturePool) {
      const profile = this.fixtureService.getProfileByUuid(fixture.profileUuid);
      const mode = this.fixtureService.getModeByFixture(profile, fixture);
      const channelCount = this.fixtureService.getModeChannelCount(profile, mode);

      if (selectedIndex >= fixture.dmxFirstChannel && selectedIndex <= fixture.dmxFirstChannel + channelCount - 1) {
        if (this.selectedFixture === fixture) {
          newSelectedFixture = fixture;
          break;
        }

        if (!newSelectedFixture) {
          newSelectedFixture = fixture;
        }
      }
    }

    if (newSelectedFixture) {
      if (newSelectedFixture !== this.selectedFixture) {
        this.selectFixture(newSelectedFixture);
      }

      this.channelDragFixture = newSelectedFixture;
      this.channelDragOffset = selectedIndex - newSelectedFixture.dmxFirstChannel;
    }
  }

  channelSelected(index: number): boolean {
    if (!this.selectedFixture) {
      return false;
    }

    if (index >= this.selectedFixture.dmxFirstChannel) {
      const profile = this.fixtureService.getProfileByUuid(this.selectedFixture.profileUuid);
      const mode = this.fixtureService.getModeByFixture(profile, this.selectedFixture);
      const channelCount = this.fixtureService.getModeChannelCount(profile, mode);

      if (index < this.selectedFixture.dmxFirstChannel + channelCount) {
        return true;
      }
    }

    return false;
  }

  // register mouse up globally (e.g. also outside the DMX mapping)
  @HostListener('window:mouseup', ['$event'])
  mouseUp(event: any) {
    // finish dragging
    this.channelDragFixture = undefined;
    this.channelDragOffset = undefined;
  }

  channelMouseOver(event: any) {
    if (!this.channelDragFixture) {
      return;
    }

    // perform dragging
    const selectedIndex = event.target.dataset.index;
    const profile = this.fixtureService.getProfileByUuid(this.channelDragFixture.profileUuid);
    const mode = this.fixtureService.getModeByFixture(profile, this.selectedFixture);
    const channelCount = this.fixtureService.getModeChannelCount(profile, mode);

    if (selectedIndex - this.channelDragOffset >= 0 && selectedIndex - this.channelDragOffset + channelCount - 1 <= 511) {
      this.channelDragFixture.dmxFirstChannel = selectedIndex - this.channelDragOffset;
    }
  }

  ok() {
    // don't allow OK if overlapping fixtures exist
    for (let i = 0; i < this.dmxChannels.length; i++) {
      if (this.channelOverlapped(i)) {
        const msg = 'designer.fixture-pool.channel-occupied';
        const title = 'designer.fixture-pool.channel-occupied-title';

        this.translateService.get([msg, title]).subscribe((result) => {
          this.toastrService.error(result[msg], result[title]);
        });

        return;
      }
    }

    this.projectService.project.fixtures = this.fixturePool;

    // remove deleted fixtures from preset fixtures
    for (let i = this.projectService.project.presetFixtures.length - 1; i >= 0; i--) {
      let found = false;
      const presetFixture = this.projectService.project.presetFixtures[i];
      for (let fixture of this.projectService.project.fixtures) {
        if (presetFixture.fixtureUuid === fixture.uuid) {
          found = true;
          break;
        }
      }
      if (!found) {
        this.projectService.project.presetFixtures.splice(i, 1);
      }
    }

    // add the new fixtures to the preset fixtures
    for (let fixture of this.projectService.project.fixtures) {
      let found = false;
      for (let presetFixture of this.projectService.project.presetFixtures) {
        if (presetFixture.fixtureUuid === fixture.uuid) {
          found = true;
          break;
        }
      }
      if (!found) {
        if (this.fixtureService.fixtureHasGeneralChannel(fixture)) {
          const presetFixture = new PresetFixture();
          presetFixture.fixtureUuid = fixture.uuid;
          this.projectService.project.presetFixtures.push(presetFixture);
        }

        const pixelKeys = this.fixtureService.fixtureGetUniquePixelKeys(fixture);

        for (let pixelKey of pixelKeys) {
          const presetFixture = new PresetFixture();
          presetFixture.fixtureUuid = fixture.uuid;
          presetFixture.pixelKey = pixelKey;
          this.projectService.project.presetFixtures.push(presetFixture);
        }
      }
    }

    this.fixtureService.updateCachedFixtures();
    this.presetService.removeDeletedFixtures();
    this.previewService.updateFixtureSetup();
    this.presetService.updateFixtureSelection();
    this.presetService.fixtureSelectionChanged.next();
    this.presetService.previewLive();

    this.onClose.next(1);
    this.bsModalRef.hide();
  }

  cancel() {
    this.onClose.next(2);
    this.bsModalRef.hide();
  }

  updateProfiles() {
    this.updatingProfiles = true;

    // TODO
    this.fixtureService
      .updateProfiles()
      .pipe(
        finalize(() => {
          this.updatingProfiles = false;
        }),
        catchError(() => {
          const msg = 'designer.fixture-pool.profiles-update-error';
          const title = 'designer.fixture-pool.profiles-update-error-title';

          this.translateService.get([msg, title]).subscribe((result) => {
            this.toastrService.error(result[msg], result[title]);
          });

          return undefined;
        })
      )
      .subscribe(() => {
        this.loadProfiles();

        const msg = 'designer.fixture-pool.profiles-updated';
        const title = 'designer.fixture-pool.profiles-updated-title';

        this.translateService.get([msg, title]).subscribe((result) => {
          this.toastrService.success(result[msg], result[title]);
        });
      });
  }

  createFixtureFromProfileFile() {
    const bsModalRef = this.modalService.show(FixturePoolCreateFromFileComponent, { keyboard: true, ignoreBackdropClick: false });
    (bsModalRef.content as FixturePoolCreateFromFileComponent).onClose.subscribe((profile: FixtureProfile) => {
      const newFixture = this.fixtureService.addFixture(profile, this.fixturePool);
      this.selectFixture(newFixture);
    });
  }

  @HostListener('document:keydown.enter', ['$event'])
  handleKeyboardEvent(event: any) {
    this.ok();
  }
}
