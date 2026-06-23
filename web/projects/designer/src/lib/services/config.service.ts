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

  public menuHeightChanged: Subject<void> = new Subject<void>();

  constructor() {}
}
