import { Injectable } from '@angular/core';
import { ConfigService } from './config.service';

// A visit is counted as a new session, as soon as the last one is at least
// this long ago. Reloading the page a couple of times still counts as one.
const SESSION_TIMEOUT_MILLIS = 30 * 60 * 1000;

// The returning-visitor hint only shows up from this session on. The very
// first visit is for trying out the designer, not for being sold to.
const BAR_MIN_SESSIONS = 2;

const STORAGE_SESSIONS = 'hardwarePromoSessions';
const STORAGE_LAST_VISIT = 'hardwarePromoLastVisit';
const STORAGE_BAR_DISMISSED = 'hardwarePromoBarDismissed';

@Injectable({
  providedIn: 'root',
})
export class HardwarePromoService {
  private barDismissed = false;
  private sessionCount = 0;

  constructor(private configService: ConfigService) {
    this.barDismissed = localStorage.getItem(STORAGE_BAR_DISMISSED) === 'true';
    this.sessionCount = Number.parseInt(localStorage.getItem(STORAGE_SESSIONS), 10) || 0;
  }

  // Whether the designer may point the user towards the hardware at all.
  // False on a Rocket Show device, where the user already owns one.
  get enabled(): boolean {
    return this.configService.hardwarePromo;
  }

  // Called once when the designer starts up, to tell a returning visitor
  // from a first-time one.
  countSession() {
    if (!this.enabled) {
      return;
    }

    const now = Date.now();
    const lastVisit = Number.parseInt(localStorage.getItem(STORAGE_LAST_VISIT), 10) || 0;

    if (now - lastVisit > SESSION_TIMEOUT_MILLIS) {
      this.sessionCount++;
      localStorage.setItem(STORAGE_SESSIONS, this.sessionCount.toString());
    }

    localStorage.setItem(STORAGE_LAST_VISIT, now.toString());
  }

  // The hint for somebody who came back to keep working on their show.
  // Shown once, until it gets dismissed for good.
  get showBar(): boolean {
    return this.enabled && !this.barDismissed && this.sessionCount >= BAR_MIN_SESSIONS;
  }

  dismissBar() {
    this.barDismissed = true;
    localStorage.setItem(STORAGE_BAR_DISMISSED, 'true');
  }

  // The link to the hardware, tagged with the place it was clicked, so it
  // is possible to tell which of the hints actually work.
  link(placement: string): string {
    const utm = 'utm_source=designer&utm_medium=app&utm_campaign=spark';
    return 'https://rocketshow.net/spark?' + utm + '&utm_content=' + encodeURIComponent(placement);
  }
}
