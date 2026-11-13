import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { of, Subject, throwError } from 'rxjs';

import { FixtureReview } from '../../models/ai-fixtures';
import { FixtureProfile } from '../../models/fixture-profile';
import { AiFixturesService } from '../../services/ai-fixtures.service';
import { FixtureMaintenanceConfirmComponent } from './fixture-maintenance-confirm.component';

// Before a fixture of a profile of the AI or a user resets itself or switches its lamp on: what is sent, and for a
// profile of the AI the row of the manual it read it from.
describe('FixtureMaintenanceConfirmComponent', () => {
  let fixture: ComponentFixture<FixtureMaintenanceConfirmComponent>;
  let component: FixtureMaintenanceConfirmComponent;
  let getReview: jasmine.Spy;
  let hide: jasmine.Spy;
  let answers: boolean[];

  const review: FixtureReview = {
    channels: { Control: { page: 13, quote: 'CH5 200-219 Reset', verified: false, uncertain: null } },
    uncertain: [],
  };

  beforeEach(() => {
    hide = jasmine.createSpy('hide');
    getReview = jasmine.createSpy('getReview').and.returnValue(of(review));

    TestBed.configureTestingModule({
      declarations: [FixtureMaintenanceConfirmComponent],
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: BsModalRef, useValue: { hide } },
        { provide: AiFixturesService, useValue: { getReview } },
      ],
    });

    answers = [];
  });

  function open(origin: string, channelName = 'Control', label = 'Reset') {
    fixture = TestBed.createComponent(FixtureMaintenanceConfirmComponent);
    component = fixture.componentInstance;
    component.action = 'reset';
    component.profile = new FixtureProfile({ uuid: 'acme/head~2', origin });
    component.channelName = channelName;
    component.range = [200, 219];
    component.label = label;
    component.onClose.subscribe((confirmed) => answers.push(confirmed));
    fixture.detectChanges();
  }

  const text = (): string => fixture.nativeElement.textContent;

  it('shows the channel, the range and the row of the manual the AI read them from', () => {
    open('ai');

    expect(getReview).toHaveBeenCalledWith('acme/head~2');
    expect(text()).toContain('designer.fixture-maintenance.title-reset');
    expect(text()).toContain('designer.fixture-maintenance.intro-ai');
    expect(fixture.nativeElement.querySelector('.fixture-maintenance-range').textContent).toContain('200–219');
    expect(fixture.nativeElement.querySelector('.fixture-maintenance-range').textContent).toContain('Reset');
    expect(fixture.nativeElement.querySelector('.fixture-maintenance-quote').textContent).toContain('CH5 200-219 Reset');
    expect(text()).toContain('designer.fixture-ai.not-verified');
  });

  it('shows no row of a manual for a channel the review does not name, a profile without one, or one of a user', () => {
    open('ai', 'Lamp', undefined);
    expect(component.note).toBeUndefined();

    getReview.and.returnValue(of(null));
    open('ai');
    expect(component.note).toBeUndefined();

    getReview.and.returnValue(throwError(new Error('offline')));
    open('ai');
    expect(component.loading).toBe(false);
    expect(fixture.nativeElement.querySelector('.fixture-maintenance-quote')).toBeNull();

    getReview.calls.reset();
    open('user');
    expect(getReview).not.toHaveBeenCalled();
    expect(text()).toContain('designer.fixture-maintenance.intro-user');
  });

  it('waits for the review', () => {
    getReview.and.returnValue(new Subject());
    open('ai');

    expect(fixture.nativeElement.querySelector('.fa-spinner')).not.toBeNull();
  });

  it('answers whether the user confirmed it', () => {
    open('user');

    fixture.nativeElement.querySelector('.fixture-maintenance-ok').click();
    fixture.nativeElement.querySelector('.modal-footer a').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(answers).toEqual([true, false, true]);
    expect(hide).toHaveBeenCalledTimes(3);
  });
});
