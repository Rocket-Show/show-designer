import { Component, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { UserEnsureLoginService } from '../../services/user-ensure-login.service';
import { UserDevice, UserService } from '../../services/user.service';
import { WarningDialogService } from '../../services/warning-dialog.service';

// "My devices" of the online designer (see docs/fixture-library.md, section 8): the devices linked with the account of
// the user, which use its AI and vote with it, when they were last online, and unlinking one, e.g. one which was sold.
@Component({
  selector: 'lib-user-devices',
  templateUrl: './user-devices.component.html',
  standalone: false,
})
export class UserDevicesComponent implements OnInit {
  devices: UserDevice[] = [];
  loading = true;

  // what went wrong, as the key of the translation
  errorKey: string;

  constructor(
    public bsModalRef: BsModalRef,
    private userService: UserService,
    private userEnsureLoginService: UserEnsureLoginService,
    private warningDialogService: WarningDialogService
  ) {}

  ngOnInit() {
    this.userService.getDevices().subscribe({
      next: (devices) => {
        this.devices = devices || [];
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.showError(error);
      },
    });
  }

  unlink(device: UserDevice) {
    this.warningDialogService.show('designer.devices.unlink-warning').subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }

      this.errorKey = undefined;

      this.userService.unlinkDevice(device.id).subscribe({
        next: () => (this.devices = this.devices.filter((candidate) => candidate !== device)),
        error: (error) => this.showError(error),
      });
    });
  }

  private showError(error: any) {
    this.errorKey = this.userEnsureLoginService.isRefused(error)
      ? this.userEnsureLoginService.refused('designer.devices.log-in')
      : 'designer.devices.failed';
  }

  close() {
    this.bsModalRef.hide();
  }
}
