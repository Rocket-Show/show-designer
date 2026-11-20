import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { EmberService } from '../services/ember.service';
import { EmberDialogComponent } from './ember-dialog.component';

// The dialog of the Ember stick, in each of its states
describe('EmberDialogComponent', () => {
  let fixture: ComponentFixture<EmberDialogComponent>;
  let ember: any;

  function render(state: Partial<EmberService>) {
    ember = {
      supported: true,
      state: 'disconnected',
      live: false,
      changed: new Subject<void>(),
      universes: () => [{ uuid: 'front', name: 'Front' }],
      defaultUniverseUuid: () => 'front',
      compareProject: jasmine.createSpy('compareProject'),
      connect: jasmine.createSpy('connect'),
      disconnect: jasmine.createSpy('disconnect'),
      sendShow: jasmine.createSpy('sendShow').and.callFake(() => Promise.resolve(true)),
      downloadShowFile: jasmine.createSpy('downloadShowFile'),
      setLive: jasmine.createSpy('setLive'),
      next: jasmine.createSpy('next'),
      back: jasmine.createSpy('back'),
      toggleBlackout: jasmine.createSpy('toggleBlackout'),
      ...state,
    };

    TestBed.configureTestingModule({
      declarations: [EmberDialogComponent],
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: BsModalRef, useValue: { hide: jasmine.createSpy('hide') } },
        { provide: EmberService, useValue: ember },
      ],
    });

    fixture = TestBed.createComponent(EmberDialogComponent);
    fixture.detectChanges();
  }

  function text(): string {
    return fixture.nativeElement.textContent;
  }

  it('offers the show as a file in a browser without Web Serial', () => {
    render({ supported: false });

    expect(text()).toContain('designer.ember.unsupported-text');
    fixture.nativeElement.querySelector('.card-body .btn-primary').click();
    expect(ember.downloadShowFile).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#ember-live')).toBeNull();
  });

  it('connects the stick', () => {
    render({});

    fixture.nativeElement.querySelector('.card-body .btn-primary').click();
    expect(ember.connect).toHaveBeenCalled();
  });

  it('shows what the stick plays, copies the project onto it and sends the preview live', async () => {
    render({
      state: 'connected',
      playsProject: true,
      info: { firmware: '0.1.0', imageLength: 5480, entries: 5, entry: 1, error: 0, blackout: false } as any,
    });

    expect(text()).toContain('designer.ember.show-this-project');
    expect(text()).toContain('0.1.0');

    fixture.nativeElement.querySelector('.ember-send').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(ember.sendShow).toHaveBeenCalled();
    expect(text()).toContain('designer.ember.sent');

    const live: HTMLInputElement = fixture.nativeElement.querySelector('#ember-live');
    live.click();
    expect(ember.setLive).toHaveBeenCalledWith(true);
  });

  it('says what is wrong on the stick', () => {
    render({
      state: 'connected',
      playsProject: false,
      info: { firmware: '0.1.0', imageLength: 5480, entries: 5, entry: 0, error: 7, blackout: false } as any,
    });

    expect(text()).toContain('designer.ember.show-other');
    expect(text()).toContain('designer.ember.error-7');
  });
});
