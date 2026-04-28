import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

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

  public menuHeightChanged: Subject<void> = new Subject<void>();

  constructor() {}
}
