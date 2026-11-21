import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { EmberHost, EmberStick } from '../models/ember-host';
import { ConfigService } from '../services/config.service';
import { ProjectService } from '../services/project.service';
import { EmberDialogComponent } from './ember-dialog.component';

// The dialog of the Ember stick, in each state of the host's stick
describe('EmberDialogComponent', () => {
  let fixture: ComponentFixture<EmberDialogComponent>;
  let host: jasmine.SpyObj<EmberHost> & { changed: Subject<void> };
  let modal: { hide: jasmine.Spy };
  let project: any;

  const stick: EmberStick = { firmware: '0.1.0', showBytes: 5480, showMark: 'a1', entries: 5, entry: 1, blackout: false };

  async function render(state: Partial<EmberHost>, freeUniverseEdit = false) {
    host = {
      supported: true,
      state: 'disconnected',
      live: false,
      changed: new Subject<void>(),
      connect: jasmine.createSpy('connect'),
      disconnect: jasmine.createSpy('disconnect'),
      showMark: jasmine.createSpy('showMark').and.callFake(() => Promise.resolve('a1')),
      send: jasmine.createSpy('send').and.callFake(() => Promise.resolve(true)),
      download: jasmine.createSpy('download'),
      setLive: jasmine.createSpy('setLive'),
      next: jasmine.createSpy('next'),
      back: jasmine.createSpy('back'),
      toggleBlackout: jasmine.createSpy('toggleBlackout'),
      ...state,
    } as any;

    project = { name: 'Friday', presets: [], universes: [] };
    modal = { hide: jasmine.createSpy('hide') };

    TestBed.configureTestingModule({
      declarations: [EmberDialogComponent],
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: BsModalRef, useValue: modal },
        {
          provide: ProjectService,
          useValue: {
            project,
            writeCompatibilityValues: jasmine.createSpy('writeCompatibilityValues'),
            getSavedJson: (saved: any) => JSON.stringify(saved),
          },
        },
      ],
    });

    const configService = TestBed.inject(ConfigService);
    configService.ember = host;
    configService.freeUniverseEdit = freeUniverseEdit;
    configService.universes = [{ uuid: 'front', name: 'Front' } as any];

    fixture = TestBed.createComponent(EmberDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function text(): string {
    return fixture.nativeElement.textContent;
  }

  function click(selector: string) {
    fixture.nativeElement.querySelector(selector).click();
  }

  it('offers the show as a file in a browser which can not talk to a stick', async () => {
    await render({ supported: false });

    expect(text()).toContain('designer.ember.unsupported-text');
    click('.card-body .btn-primary');
    expect(host.download).toHaveBeenCalledWith(JSON.stringify(project), 'Friday');
    expect(fixture.nativeElement.querySelector('#ember-live')).toBeNull();
    expect(fixture.nativeElement.querySelector('.ember-state')).toBeNull();
  });

  it('names the file of a project without a name', async () => {
    await render({});
    project.name = '';

    click('.ember-download');
    expect(host.download).toHaveBeenCalledWith(JSON.stringify(project), 'show');
  });

  it('connects the stick', async () => {
    await render({});

    expect(text()).toContain('designer.ember.state-disconnected');
    click('.card-body .btn-primary');
    expect(host.connect).toHaveBeenCalled();

    host.state = 'connecting';
    host.changed.next();
    fixture.detectChanges();
    expect(text()).toContain('designer.ember.state-connecting');
    expect(fixture.nativeElement.querySelector('.card-body .btn-primary').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.ember-disconnect')).toBeNull();
  });

  it('shows what the stick plays, copies the project onto it and sends the preview to the lights', async () => {
    await render({ state: 'connected', stick: { ...stick } });

    expect(host.showMark).toHaveBeenCalledWith(JSON.stringify(project));
    expect(text()).toContain('designer.ember.state-connected');
    expect(text()).toContain('designer.ember.show-this-project');
    expect(text()).toContain('0.1.0');
    expect(fixture.componentInstance.showKb).toBe(6);
    expect(fixture.nativeElement.querySelector('.ember-trouble')).toBeNull();

    click('.ember-send');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.send).toHaveBeenCalledWith(JSON.stringify(project));
    expect(text()).toContain('designer.ember.sent');

    const live = fixture.nativeElement.querySelector('#ember-live');
    live.checked = true;
    live.dispatchEvent(new Event('change'));
    expect(host.setLive).toHaveBeenCalledWith(true);

    host.live = true;
    host.changed.next();
    fixture.detectChanges();
    expect(text()).toContain('designer.ember.state-live');

    click('.ember-back');
    click('.ember-next');
    click('.ember-blackout');
    expect(host.back).toHaveBeenCalled();
    expect(host.next).toHaveBeenCalled();
    expect(host.toggleBlackout).toHaveBeenCalled();

    click('.ember-disconnect');
    expect(host.disconnect).toHaveBeenCalled();

    click('.card-footer .btn-secondary');
    expect(modal.hide).toHaveBeenCalled();
  });

  it('copies a project with the universes of a host on which they are edited freely', async () => {
    await render({ state: 'connected', stick: { ...stick } }, true);

    click('.ember-send');
    await fixture.whenStable();

    expect(JSON.parse(host.send.calls.mostRecent().args[0]).universes).toEqual([{ uuid: 'front', name: 'Front' }]);
  });

  it('tells when the stick plays another show, in blackout, with a problem', async () => {
    await render({
      state: 'connected',
      stick: { ...stick, showMark: 'b2', blackout: true, trouble: { key: 'stick.error-7' } },
      problem: { key: 'stick.problem-answer' },
      send: jasmine.createSpy('send').and.callFake(() => Promise.resolve(false)),
    });

    expect(text()).toContain('designer.ember.show-other');
    expect(text()).toContain('stick.error-7');
    expect(text()).toContain('stick.problem-answer');
    expect(fixture.nativeElement.querySelector('.ember-blackout').classList).toContain('active');

    click('.ember-send');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text()).not.toContain('designer.ember.sent');
  });

  it('shows how far a show is while it is copied', async () => {
    await render({ state: 'connected', stick: { ...stick }, sending: { taken: 5, blocks: 20 } });

    expect(fixture.componentInstance.sendingPercent).toBe(25);
    expect(fixture.nativeElement.querySelector('.progress-bar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.ember-send').disabled).toBe(true);

    host.sending = { taken: 0, blocks: 0 };
    expect(fixture.componentInstance.sendingPercent).toBe(0);
  });

  it('shows a stick without a show, and does not say whose show it is while it is not known', async () => {
    await render({
      state: 'connected',
      stick: { ...stick, showBytes: 0, showMark: undefined, entries: 0 },
      showMark: jasmine.createSpy('showMark').and.callFake(() => Promise.reject(new Error('no engine'))),
    });

    expect(text()).toContain('designer.ember.show-none');
    expect(fixture.componentInstance.playsProject).toBeUndefined();
    expect(fixture.nativeElement.querySelector('.ember-next')).toBeNull();

    // a show, but no show can be made from this project
    host.stick = { ...stick };
    host.changed.next();
    fixture.detectChanges();
    expect(text()).not.toContain('designer.ember.show-this-project');
    expect(text()).not.toContain('designer.ember.show-other');
  });

  it('waits for what the stick tells about itself', async () => {
    await render({ state: 'connected' });

    expect(fixture.componentInstance.showKb).toBe(0);
    expect(fixture.componentInstance.playsProject).toBe(false);
    expect(text()).toContain('designer.ember.connect-text');
  });
});
