import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { of, throwError } from 'rxjs';

import { UserDevice, UserService } from '../../services/user.service';
import { WarningDialogService } from '../../services/warning-dialog.service';
import { UserDevicesComponent } from './user-devices.component';

// "My devices": the devices linked with the account of the user, and unlinking one of them.
describe('UserDevicesComponent', () => {
  let fixture: ComponentFixture<UserDevicesComponent>;
  let component: UserDevicesComponent;
  let user: { getDevices: jasmine.Spy; unlinkDevice: jasmine.Spy; logout: jasmine.Spy; isLoggedIn: () => boolean };
  let confirm: jasmine.Spy;
  let hide: jasmine.Spy;

  const spark: UserDevice = {
    id: 5,
    kind: 'rocketshow',
    name: 'Spark of the band',
    version: '3.2.0',
    edition: 'spark',
    lastSeen: '2026-11-12T20:30:00Z',
    compositions: 12,
    sets: 2,
    projects: 3,
    firmwareVersion: null,
  };
  const stick: UserDevice = { ...spark, id: 6, kind: 'ember', name: null, version: null, edition: null, firmwareVersion: '0.4.0' };

  beforeEach(() => {
    hide = jasmine.createSpy('hide');
    confirm = jasmine.createSpy('show').and.returnValue(of(true));
    user = {
      getDevices: jasmine.createSpy('getDevices').and.returnValue(of([spark, stick])),
      unlinkDevice: jasmine.createSpy('unlinkDevice').and.returnValue(of({})),
      logout: jasmine.createSpy('logout'),
      isLoggedIn: () => true,
    };

    TestBed.configureTestingModule({
      declarations: [UserDevicesComponent],
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: BsModalRef, useValue: { hide } },
        { provide: BsModalService, useValue: {} },
        { provide: UserService, useValue: user },
        { provide: WarningDialogService, useValue: { show: confirm } },
      ],
    });
  });

  function open() {
    fixture = TestBed.createComponent(UserDevicesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // the cells of each row of the list
  const rows = (): string[][] =>
    Array.from(fixture.nativeElement.querySelectorAll('tbody tr')).map((row: HTMLElement) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent.replace(/\s+/g, ' ').trim())
    );

  it('lists the devices of the account, with their versions and when they were last online', () => {
    open();

    expect(rows()[0].slice(0, 2)).toEqual(['Spark of the band spark', '3.2.0']);
    expect(rows()[0][2]).toMatch(/^2026-11-1[23] \d\d:\d\d$/);
    expect(rows()[0][3]).toBe('12');
    expect(rows()[1].slice(0, 2)).toEqual(['designer.devices.kind-ember', '0.4.0']);
  });

  it('unlinks a device once the user confirmed it', () => {
    open();

    fixture.nativeElement.querySelector('.user-devices-unlink').click();
    fixture.detectChanges();

    expect(confirm).toHaveBeenCalledWith('designer.devices.unlink-warning');
    expect(user.unlinkDevice).toHaveBeenCalledWith(5);
    expect(component.devices).toEqual([stick]);

    confirm.and.returnValue(of(false));
    component.unlink(stick);
    expect(user.unlinkDevice).toHaveBeenCalledTimes(1);
  });

  it('says when the account has no devices', () => {
    user.getDevices.and.returnValue(of(null));
    open();

    expect(fixture.nativeElement.querySelector('.user-devices-none')).not.toBeNull();
  });

  it('tells what went wrong, and asks to log in again when the session ran out', () => {
    user.getDevices.and.returnValue(throwError(new HttpErrorResponse({ status: 500, error: 'oops' })));
    open();

    expect(component.loading).toBe(false);
    expect(component.errorKey).toBe('designer.devices.failed');
    expect(fixture.nativeElement.querySelector('.user-devices-none')).toBeNull();

    user.getDevices.and.returnValue(of([spark]));
    user.unlinkDevice.and.returnValue(throwError(new HttpErrorResponse({ status: 401, error: { error: 'unauthorized' } })));
    open();
    component.unlink(spark);

    expect(component.errorKey).toBe('designer.devices.log-in');
    expect(user.logout).toHaveBeenCalled();
    expect(component.devices).toEqual([spark]);
  });

  it('closes', () => {
    open();

    fixture.nativeElement.querySelector('.modal-footer button').click();

    expect(hide).toHaveBeenCalled();
  });
});
