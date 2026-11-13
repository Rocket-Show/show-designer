import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { UniverseConfig } from '../models/universe-config';

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  public restUrl: string;
  public enableMediaLibrary = false;
  public loginAvailable = false;
  public shareAvailable = false;
  public menuHeightPx = 0;
  public languageSwitch = false;
  public livePreview = false;
  public localProfiles = false;
  public intro = false;
  public uniqueProjectNames = false;
  public dropzoneChunking = true;

  // List of universes (with name and uuid) the user can choose from
  // in the fixture pool. Typically supplied by the host application
  // (e.g. fetched from a backend).
  public universes: UniverseConfig[] = [];

  // When true, the user can freely add their own universes (only
  // names) in the fixture pool, without depending on a list provided
  // by the host application.
  public freeUniverseEdit = false;

  // When true, the designer points the user towards the Rocket Show
  // hardware. Only meant for the free online designer: somebody running
  // this on a device already owns one.
  public hardwarePromo = false;

  // When true, the designer offers the AI looks: the AI designs presets and scenes for the fixtures of a logged in
  // user, through the API of the online designer (ai-looks). A Rocket Show device has no such API.
  public aiLooks = false;

  // When true, the designer offers fixture profiles the AI makes from a manual, through the API it talks to: the one of
  // the online designer, or the backend of a Rocket Show device, which forwards them (see AiFixturesService).
  public aiFixtures = false;

  // Whose account the AI and the votes on the profiles go by: 'designer' logs the user in with the login of the
  // designer (online), 'host' leaves it to the application around it, e.g. a Rocket Show device linked with an account
  // in its settings, which the designer can't log in.
  public aiAccount: 'designer' | 'host' = 'designer';

  public menuHeightChanged: Subject<void> = new Subject<void>();

  constructor() {}

  // Can the user have an account to vote on the profiles and to offer one to the library with: online with the login of
  // the designer, or on a host which links itself with one
  hasAccount(): boolean {
    return this.loginAvailable || this.aiAccount === 'host';
  }
}
