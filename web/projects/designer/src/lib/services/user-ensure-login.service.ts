import { Injectable } from '@angular/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { Observable, of, Subject } from 'rxjs';
import { UserRegisterComponent } from '../user/user-register/user-register.component';
import { ConfigService } from './config.service';
import { UserService } from './user.service';

@Injectable({
  providedIn: 'root',
})
export class UserEnsureLoginService {
  constructor(private userService: UserService, private modalService: BsModalService, private configService: ConfigService) {}

  // show the login form and log a user in, if required
  login(): Observable<void> {
    if (this.userService.isLoggedIn()) {
      return of(null);
    }

    if (!this.configService.loginAvailable) {
      return of(null);
    }

    const subject = new Subject<void>();
    this.modalService.show(UserRegisterComponent, { keyboard: true, ignoreBackdropClick: false, initialState: { subject } });
    return subject;
  }

  // Whether the API refused a request for want of an account: the session of the user ran out, or the host the designer
  // runs on (a Rocket Show device) isn't linked with an account
  isRefused(error: any): boolean {
    const code = error?.error?.error;

    return error?.status === 401 || code === 'unauthorized' || code === 'device-not-linked';
  }

  // What to tell the user about a request refused for want of an account, as the key of the translation: to link the
  // device in its settings where the host holds the account, else the passed one, after letting the session which ran
  // out go (the next request asks the user to log in)
  refused(loginMessage: string): string {
    if (this.configService.aiAccount === 'host') {
      return 'designer.account.link-device';
    }

    this.userService.logout();

    return loginMessage;
  }
}
