import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { CachedFixture } from '../models/cached-fixture';
import { dmxUniverseSize } from '../models/dmx-override';
import { Fixture } from '../models/fixture';
import { UniverseConfig } from '../models/universe-config';
import { AnimationService } from '../services/animation.service';
import { ConfigService } from '../services/config.service';
import { DmxOutputChannel, DmxService } from '../services/dmx.service';
import { FixtureService } from '../services/fixture.service';
import { PreviewService } from '../services/preview.service';
import { ProjectService } from '../services/project.service';

// one DMX channel with its fader
export interface DmxStrip {
  dmxChannel: number;
  // what the fixtures patched there call it, e.g. "Pan fine"
  name: string;
  // the fixtures and their channels patched there, one per line
  title: string;
}

// the channels of one fixture, or a run of channels no fixture is patched to
export interface DmxGroup {
  label: string;
  patched: boolean;
  strips: DmxStrip[];
}

// The DMX channels of a universe, each with the value sent on it and a fader to hold it at a value of its own, over what
// the presets put on it (like the simple desk of a lighting console). Closing it lets go of all faders.
@Component({
  selector: 'lib-dmx-channels',
  templateUrl: './dmx-channels.component.html',
  styleUrls: ['./dmx-channels.component.css'],
  standalone: false,
})
export class DmxChannelsComponent implements OnInit, OnDestroy {
  // how often the values are read again: often enough to follow a chase, rarely enough to leave the preview its frames
  private static readonly refreshMillis = 100;

  public onClose: Subject<void> = new Subject();

  universes: UniverseConfig[] = [];
  selectedUniverse: UniverseConfig;
  showUnpatched = false;

  groups: DmxGroup[] = [];
  values: number[] = new Array(dmxUniverseSize).fill(0);

  private refreshTimer: any;
  private groupedCachedFixtures: CachedFixture[];

  constructor(
    public bsModalRef: BsModalRef,
    private configService: ConfigService,
    private projectService: ProjectService,
    private fixtureService: FixtureService,
    private previewService: PreviewService,
    private animationService: AnimationService,
    public dmxService: DmxService,
    private ngZone: NgZone,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.universes = this.getUniverses();
    this.selectedUniverse = this.universes[0];
    this.refresh();

    // the values are read again outside of Angular, which then only draws this page anew, not the whole designer
    this.ngZone.runOutsideAngular(() => {
      this.refreshTimer = setInterval(() => {
        this.refresh();
        this.changeDetectorRef.detectChanges();
      }, DmxChannelsComponent.refreshMillis);
    });
  }

  ngOnDestroy() {
    clearInterval(this.refreshTimer);

    // the faders only hold their channels while they can be seen
    this.dmxService.releaseOverrides();
  }

  // the universes of the configuration, and the ones fixtures are patched to which it doesn't name
  private getUniverses(): UniverseConfig[] {
    const universes: UniverseConfig[] = (this.configService.universes || []).slice();

    for (const fixture of this.projectService.project?.fixtures || []) {
      if (fixture.dmxUniverseUuid && !universes.some((universe) => universe.uuid === fixture.dmxUniverseUuid)) {
        universes.push({ uuid: fixture.dmxUniverseUuid, name: 'Universe ' + (universes.length + 1) });
      }
    }

    return universes;
  }

  selectUniverse(uuid: string) {
    this.selectedUniverse = this.universes.find((universe) => universe.uuid === uuid);
    this.groupedCachedFixtures = undefined;
    this.refresh();
  }

  setShowUnpatched(show: boolean) {
    this.showUnpatched = show;
    this.groupedCachedFixtures = undefined;
    this.refresh();
  }

  // read the values sent on the channels again, and the patch, if the fixtures changed
  refresh() {
    if (!this.selectedUniverse || !this.projectService.project) {
      this.groups = [];
      return;
    }

    if (this.groupedCachedFixtures !== this.fixtureService.cachedFixtures) {
      this.groupedCachedFixtures = this.fixtureService.cachedFixtures;
      this.groups = this.getGroups(this.dmxService.getPatch(this.selectedUniverse.uuid));
    }

    const timeMillis = this.animationService.timeMillis;
    const channelValues = this.previewService.getChannelValues(timeMillis, this.previewService.getPresets(timeMillis));
    this.values = this.dmxService.getUniverseValues(this.selectedUniverse.uuid, channelValues);
  }

  // The channels grouped by the fixture patched to them, in the order of their channels. A channel no fixture uses
  // between the channels of a fixture (an unused channel of its mode) stays with the fixture. The other channels no
  // fixture is patched to come in runs, if they are shown at all.
  private getGroups(patch: DmxOutputChannel[][]): DmxGroup[] {
    const owners = patch.map((outputs) => (outputs.length > 0 ? outputs[0].cachedFixture.fixture : undefined));
    const groups: DmxGroup[] = [];
    let group: DmxGroup;
    let groupKey: string;

    patch.forEach((outputs, dmxChannel) => {
      const owner = owners[dmxChannel] || this.getSurroundingOwner(owners, dmxChannel);

      if (!owner && !this.showUnpatched) {
        groupKey = undefined;
        return;
      }

      const key = owner ? owner.uuid : '';

      if (key !== groupKey) {
        groupKey = key;
        group = { label: owner ? owner.name : '', patched: !!owner, strips: [] };
        groups.push(group);
      }

      group.strips.push({
        dmxChannel,
        name: Array.from(new Set(outputs.map((output) => output.name))).join(' / '),
        title: outputs.map((output) => output.cachedFixture.fixture.name + ': ' + output.name).join('\n'),
      });
    });

    return groups;
  }

  // the fixture patched to the channels on both sides of a channel no fixture uses, if it is the same one
  private getSurroundingOwner(owners: Fixture[], dmxChannel: number): Fixture {
    let before: Fixture;
    let after: Fixture;

    for (let i = dmxChannel - 1; i >= 0 && !before; i--) {
      before = owners[i];
    }

    for (let i = dmxChannel + 1; i < owners.length && !after; i++) {
      after = owners[i];
    }

    return before && before === after ? before : undefined;
  }

  isHeld(dmxChannel: number): boolean {
    return !!this.dmxService.getOverride(this.selectedUniverse.uuid, dmxChannel);
  }

  hasHeld(): boolean {
    return this.dmxService.getOverrides().length > 0;
  }

  // hold the channel at the value of its fader
  setValue(dmxChannel: number, value: any) {
    this.dmxService.setOverride(this.selectedUniverse.uuid, dmxChannel, +value);
    this.values[dmxChannel] = this.dmxService.getOverride(this.selectedUniverse.uuid, dmxChannel).value;
  }

  release(dmxChannel: number) {
    this.dmxService.releaseOverride(this.selectedUniverse.uuid, dmxChannel);
    this.refresh();
  }

  releaseAll() {
    this.dmxService.releaseOverrides();
    this.refresh();
  }

  // the first and the last DMX address of a group (counted from 1, like on the fixtures)
  getAddressRange(group: DmxGroup): string {
    const first = group.strips[0].dmxChannel + 1;
    const last = group.strips[group.strips.length - 1].dmxChannel + 1;

    return first === last ? '' + first : first + '–' + last;
  }

  close() {
    this.onClose.next();
    this.bsModalRef.hide();
  }
}
