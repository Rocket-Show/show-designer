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

  it('shows how far the copy has come, and lets go of the stick', () => {
    render({
      state: 'connected',
      playsProject: false,
      sending: { taken: 5, blocks: 20 },
      info: { firmware: '0.1.0', imageLength: 0, entries: 0, entry: 0, error: 1, blackout: false } as any,
    });

    expect(fixture.componentInstance.sendingPercent).toBe(25);
    expect(fixture.componentInstance.showKb).toBe(0);
    expect(text()).toContain('designer.ember.show-none');
    // no show: nothing to step
    expect(fixture.nativeElement.querySelector('.btn-group')).toBeNull();

    fixture.componentInstance.selectUniverse('side');
    expect(ember.liveUniverseUuid).toBe('side');

    fixture.nativeElement.querySelector('.card-footer a.small').click();
    expect(ember.downloadShowFile).toHaveBeenCalled();

    fixture.nativeElement.querySelector('.card-footer span a').click();
    expect(ember.disconnect).toHaveBeenCalled();

    fixture.nativeElement.querySelector('.card-footer .btn-secondary').click();
    expect(TestBed.inject(BsModalRef).hide).toHaveBeenCalled();
  });

  it('steps the stick like its button', () => {
    render({
      state: 'connected',
      playsProject: true,
      info: { firmware: '0.1.0', imageLength: 5480, entries: 5, entry: 1, error: 0, blackout: true } as any,
    });

    const buttons = fixture.nativeElement.querySelectorAll('.btn-group button');
    buttons[0].click();
    buttons[1].click();
    buttons[2].click();

    expect(ember.back).toHaveBeenCalled();
    expect(ember.next).toHaveBeenCalled();
    expect(ember.toggleBlackout).toHaveBeenCalled();
    expect(text()).toContain('designer.ember.blackout');
  });

  it('has no trouble to tell without a stick', () => {
    render({});

    expect(fixture.componentInstance.errorKey).toBeUndefined();
    expect(fixture.componentInstance.sendingPercent).toBe(0);
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
