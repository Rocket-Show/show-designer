import { Injectable, NgZone } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { AppInstall } from 'projects/designer/src/public_api';
import { filter } from 'rxjs/operators';

// The online designer as a progressive web app: the browser's offer to install it, kept for the designer's menu, and a
// note when a new version has been loaded in the background, which a reload starts
@Injectable({
  providedIn: 'root',
})
export class PwaService implements AppInstall {
  // the browser's install prompt (Chrome, Edge), while it offers one
  private installPrompt: any;

  constructor(swUpdate: SwUpdate, toastrService: ToastrService, translateService: TranslateService, zone: NgZone) {
    window.addEventListener('beforeinstallprompt', (event: Event) => {
      // shown from the designer's menu instead
      event.preventDefault();
      zone.run(() => (this.installPrompt = event));
    });

    window.addEventListener('appinstalled', () => zone.run(() => (this.installPrompt = undefined)));

    if (swUpdate.isEnabled) {
      swUpdate.versionUpdates.pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY')).subscribe(() => {
        toastrService
          .info(translateService.instant('designer.navigation.app-update'), undefined, { disableTimeOut: true, tapToDismiss: true })
          .onTap.subscribe(() => document.location.reload());
      });
    }
  }

  available(): boolean {
    return !!this.installPrompt;
  }

  async install(): Promise<void> {
    const prompt = this.installPrompt;

    if (!prompt) {
      return;
    }

    this.installPrompt = undefined;
    await prompt.prompt();
  }
}
