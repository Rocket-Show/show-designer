import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { of, Subject, throwError } from 'rxjs';

import { AiLooks, AiLooksStatus, AiRig, defaultAiSettings } from '../../models/ai-looks';
import { AiCompiled } from '../../models/ai-looks-compiler';
import { Preset } from '../../models/preset';
import { Scene } from '../../models/scene';
import { AiLooksService } from '../../services/ai-looks.service';
import { AnimationService } from '../../services/animation.service';
import { ConfigService } from '../../services/config.service';
import { PreviewService } from '../../services/preview.service';
import { UserService } from '../../services/user.service';
import { AiLooksComponent } from './ai-looks.component';

// The panel of the AI looks: what the user picks, the request to the AI (through AiLooksService), the looks it
// answers, played on the stage scene by scene before anything is added, changing them, adding the scenes picked to the
// project or discarding them, and what it tells when something goes wrong.
describe('AiLooksComponent', () => {
  let fixture: ComponentFixture<AiLooksComponent>;
  let component: AiLooksComponent;
  let service: any;
  let preview: jasmine.SpyObj<PreviewService>;
  let status: Subject<AiLooksStatus>;
  let logout: jasmine.Spy;
  let compiled: AiCompiled;
  let chorus: Scene;
  let blackout: Scene;
  let wash: Preset;

  const rig: AiRig = {
    groups: [
      {
        group: { id: 'pars', name: 'Pars', category: 'Color Changer', count: 4, position: 'top-front', abilities: ['dimmer', 'color'] },
        fixtureUuids: ['par-1', 'par-2', 'par-3', 'par-4'],
      },
    ],
  };

  const looks: AiLooks = {
    name: 'Neon night',
    summary: 'Pink and cyan',
    presets: [
      { id: 'wash', name: 'Wash', groups: ['pars'], colorGradient: { colors: ['#ff0000', '#00ff00'], blend: 'smooth' } } as any,
      { id: 'pulse', name: 'Pulse', groups: ['pars'], colorSequence: { colors: ['#00ff00', '#0000ff'] } } as any,
      { id: 'solid', name: 'Solid', groups: ['pars'], color: '#ffffff' } as any,
      { id: 'pixels', name: 'Pixels', groups: ['pars'], pixel: { colors: ['#123456'] } } as any,
      { id: 'dark', name: 'Dark', groups: ['pars'] } as any,
    ],
    scenes: [
      {
        name: 'Chorus',
        section: 'chorus',
        energy: 5,
        presets: ['wash', 'pulse', 'missing', 'solid', 'pixels', 'dark'],
        fadeInBeats: 0,
        fadeOutBeats: 0,
      },
      { name: 'Blackout', section: 'blackout', energy: 1, presets: [], fadeInBeats: 0, fadeOutBeats: 0 },
    ],
  };

  function httpError(status: number, error: any): HttpErrorResponse {
    return new HttpErrorResponse({ status, error });
  }

  beforeEach(() => {
    logout = jasmine.createSpy('logout');
    status = new Subject<AiLooksStatus>();
    wash = new Preset({ uuid: 'wash', name: 'Wash' });
    chorus = new Scene({ uuid: 'chorus', name: 'Chorus', presetUuids: ['wash'] });
    blackout = new Scene({ uuid: 'blackout', name: 'Blackout', presetUuids: [] });
    compiled = { presets: [wash], scenes: [chorus, blackout], sources: looks.scenes };
    preview = jasmine.createSpyObj<PreviewService>('PreviewService', ['previewAiScene', 'endAiPreview']);
    service = {
      last: undefined,
      getRig: () => rig,
      getTempo: () => 128,
      getStatus: () => status,
      getRequest: jasmine
        .createSpy('getRequest')
        .and.callFake((r, settings, prompt, current, instruction, change) => ({ settings, prompt, current, instruction, ...change })),
      design: jasmine.createSpy('design').and.returnValue(of({ looks, requestsLast24Hours: 3, requestsPerUserPerDay: 20 })),
      compile: jasmine.createSpy('compile').and.callFake(() => compiled),
      getScenePresets: (c: AiCompiled, scene: Scene) => (scene === chorus ? [wash] : []),
      addCompiled: jasmine.createSpy('addCompiled').and.returnValue({ presets: [{}, {}], scenes: [{}] }),
      closePanel: jasmine.createSpy('closePanel'),
    };

    TestBed.configureTestingModule({
      declarations: [AiLooksComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        { provide: AiLooksService, useValue: service },
        { provide: PreviewService, useValue: preview },
        { provide: AnimationService, useValue: { timeMillis: 1000 } },
        { provide: UserService, useValue: { logout } },
        { provide: BsModalService, useValue: {} },
      ],
    });
  });

  function open(available: AiLooksStatus = { available: true, requestsLast24Hours: 2, requestsPerUserPerDay: 20 }) {
    status = new Subject<AiLooksStatus>();
    fixture = TestBed.createComponent(AiLooksComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    status.next(available);
    status.complete();
    fixture.detectChanges();
  }

  function text(): string {
    return fixture.nativeElement.textContent;
  }

  it('starts with the defaults at the tempo of the composition, and shows the groups of the fixtures', () => {
    open();

    expect(component.settings).toEqual(defaultAiSettings(128));
    expect(component.loadingStatus).toBe(false);
    expect(component.available).toBe(true);
    expect(component.requestsLeft).toBe(18);
    expect(component.canDesign).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.ai-groups li').length).toBe(1);
    expect(text()).toContain('Pars');
  });

  it('starts from what the user picked the last time', () => {
    service.last = { settings: { ...defaultAiSettings(90), colors: ['#ff0000'], mood: 'dark' }, prompt: 'Dark rock', looks };
    open();

    expect(component.settings.bpm).toBe(90);
    expect(component.settings.colors).toEqual(['#ff0000']);
    expect(component.settings.colors).not.toBe(service.last.settings.colors);
    expect(component.prompt).toBe('Dark rock');
    expect(component.looks).toBe(looks);

    // back to the looks designed then, the first scene on the stage
    expect(component.view).toBe('looks');
    expect(service.compile).toHaveBeenCalledWith(looks, rig, 90);
    expect(preview.previewAiScene).toHaveBeenCalledWith(chorus, [wash], 1000);
  });

  it("can't design without the AI looks, without fixtures or without requests left", () => {
    open({ available: false });
    expect(component.canDesign).toBe(false);
    expect(component.requestsLeft).toBeUndefined();
    expect(text()).toContain('designer.ai.unavailable');

    open({ available: true, requestsLast24Hours: 25, requestsPerUserPerDay: 20 });
    expect(component.requestsLeft).toBe(0);
    expect(component.canDesign).toBe(false);

    service.getRig = () => ({ groups: [] });
    open();
    expect(component.hasFixtures).toBe(false);
    expect(component.canDesign).toBe(false);
    expect(text()).toContain('designer.ai.no-fixtures');
  });

  it('counts no requests made when the API tells none', () => {
    open({ available: true, requestsPerUserPerDay: 20 });

    expect(component.requestsLeft).toBe(20);
  });

  it('lets an admin design as often as they like', () => {
    open({ available: true, requestsLast24Hours: 50, requestsPerUserPerDay: null });

    expect(component.requestsLeft).toBeUndefined();
    expect(component.canDesign).toBe(true);
  });

  it('tells when the status could not be loaded', () => {
    fixture = TestBed.createComponent(AiLooksComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    status.error(httpError(500, { error: 'internal' }));
    fixture.detectChanges();

    expect(component.available).toBe(false);
    expect(component.errorKey).toBe('designer.ai.error.ai-failed');
  });

  it('takes the settings the user picks, within their ranges', () => {
    open();

    component.setOutput('set');
    component.setMovement('big');
    expect([component.settings.output, component.settings.movement]).toEqual(['set', 'big']);

    // a mood or a palette picked again is picked no more
    component.setMood('party');
    expect(component.settings.mood).toBe('party');
    component.setMood('party');
    expect(component.settings.mood).toBeNull();
    component.setPalette('neon');
    expect(component.settings.palette).toBe('neon');
    component.setPalette('neon');
    expect(component.settings.palette).toBeNull();

    // up to four colors, each a #rrggbb
    for (let i = 0; i < 6; i++) {
      component.addColor();
    }
    expect(component.settings.colors.length).toBe(4);
    component.setColor(0, '#ABCDEF');
    component.setColor(1, 'red');
    expect(component.settings.colors[0]).toBe('#abcdef');
    expect(component.settings.colors[1]).toBe('#00e5ff');
    component.removeColor(0);
    expect(component.settings.colors.length).toBe(3);

    component.setNumber('energy', '4.6', 1, 5);
    component.setNumber('bpm', 300, 40, 240);
    component.setNumber('contrast', 'abc', 0, 1);
    expect([component.settings.energy, component.settings.bpm, component.settings.contrast]).toEqual([5, 240, 0.5]);

    expect(component.paletteCss('neon')).toContain('gradient');
    expect(component.paletteCss('unknown')).toBe('');
    expect(component.abilityIcon('pan-tilt')).toBe('fa-arrows');
    expect(component.abilityIcon('laser')).toBe('fa-circle');
  });

  it('designs the looks, shows them and remembers them', () => {
    open();
    component.prompt = 'Synthwave';

    component.design();
    fixture.detectChanges();

    expect(service.design).toHaveBeenCalled();
    expect(service.getRequest).toHaveBeenCalledWith(rig, component.settings, 'Synthwave', undefined, undefined);
    expect(component.view).toBe('looks');
    expect(component.status).toEqual({ available: true, requestsLast24Hours: 3, requestsPerUserPerDay: 20 });
    expect(service.last.looks).toBe(looks);
    expect(service.last.prompt).toBe('Synthwave');
    expect(text()).toContain('Neon night');

    // made into scenes, the first one on the stage
    expect(service.compile).toHaveBeenCalledWith(looks, rig, 128);
    expect(preview.previewAiScene).toHaveBeenCalledWith(chorus, [wash], 1000);
    expect(fixture.nativeElement.querySelectorAll('.ai-scene').length).toBe(2);
    expect(fixture.nativeElement.querySelector('.ai-scene-playing').textContent).toContain('Chorus');

    // the scene is marked with the colors of its presets, and names them
    expect(component.sceneColors(looks.scenes[0].presets)).toEqual(['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#123456']);
    expect(component.presetNames(['wash', 'missing', 'solid'])).toBe('Wash, Solid');
  });

  it('changes all of the looks as the user says, and goes back to the settings', () => {
    open();
    component.design();
    component.setScope('all');

    component.instruction = '   ';
    expect(component.canAsk).toBe(false);
    component.ask();
    expect(service.design).toHaveBeenCalledTimes(1);

    component.instruction = ' Warmer ';
    component.ask();
    expect(service.getRequest).toHaveBeenCalledWith(rig, component.settings, '', looks, 'Warmer');
    expect(component.instruction).toBe('');

    component.errorKey = 'designer.ai.error.ai-busy';
    component.back();
    expect(component.view).toBe('settings');
    expect(component.errorKey).toBeUndefined();
    // the stage plays the project again
    expect(preview.endAiPreview).toHaveBeenCalled();
  });

  // the looks after the AI changed the chorus (or added a scene), made into scenes anew
  function answer(scenes: Scene[]): Subject<any> {
    const answered = new Subject<any>();
    service.design.and.returnValue(answered);
    const sources = scenes.map((scene) => ({ ...looks.scenes[1], name: scene.name }));
    service.compile.and.callFake(() => ({ presets: [wash], scenes, sources }));

    return answered;
  }

  it('changes only the scene on the stage, which plays it then, keeping what the user picked', () => {
    open();
    expect(component.playingName).toBe('');
    component.design();
    component.setPicked(blackout, false);
    fixture.detectChanges();
    expect(component.scope).toBe('scene');
    expect(component.playingName).toBe('Chorus');
    expect(text()).toContain('designer.ai.ask-hint-scene');

    // a change of the scene needs an instruction
    expect(component.canAsk).toBe(false);
    component.ask();
    expect(service.design).toHaveBeenCalledTimes(1);

    const slowChorus = new Scene({ uuid: 'slow-chorus', name: 'Slow chorus', presetUuids: ['wash'] });
    const sameBlackout = new Scene({ uuid: 'same-blackout', name: 'Blackout', presetUuids: [] });
    const answered = answer([slowChorus, sameBlackout]);
    component.instruction = ' Slower ';
    component.ask();
    fixture.detectChanges();

    expect(service.getRequest).toHaveBeenCalledWith(rig, component.settings, '', looks, 'Slower', { scene: 0 });
    // the stage plays on meanwhile, nothing else can be asked or added
    expect(component.view).toBe('looks');
    expect(component.working).toBe(0);
    expect(component.canDesign).toBe(false);
    expect(fixture.nativeElement.querySelector('.ai-scene-working').textContent).toContain('designer.ai.working-scene');
    expect(fixture.nativeElement.querySelector('.ai-panel-footer .btn-primary').disabled).toBe(true);
    expect(text()).not.toContain('designer.misc.nav-back');

    const changed = { ...looks, scenes: [{ ...looks.scenes[0], name: 'Slow chorus' }, looks.scenes[1]] };
    preview.previewAiScene.calls.reset();
    answered.next({ looks: changed, requestsLast24Hours: 4, requestsPerUserPerDay: 20 });
    fixture.detectChanges();

    expect(component.working).toBeUndefined();
    expect(component.looks).toBe(changed);
    expect(service.last.looks).toBe(changed);
    expect(component.instruction).toBe('');
    expect(component.requestsLeft).toBe(16);
    expect(component.scenes).toEqual([slowChorus, sameBlackout]);
    expect(component.isPicked(slowChorus)).toBe(true);
    expect(component.isPicked(sameBlackout)).toBe(false);
    expect(component.playing).toBe(0);
    expect(preview.previewAiScene).toHaveBeenCalledWith(slowChorus, [], 1000);
  });

  it('adds one more scene, described or left to the AI, which plays then', () => {
    open();
    component.design();
    component.play(1);
    component.setScope('add');
    fixture.detectChanges();
    expect(text()).toContain('designer.ai.ask-hint-add');

    const talk = new Scene({ uuid: 'talk', name: 'Talk', presetUuids: [] });
    const answered = answer([chorus, blackout, talk]);
    expect(component.canAsk).toBe(true);
    component.ask();
    fixture.detectChanges();

    expect(service.getRequest).toHaveBeenCalledWith(rig, component.settings, '', looks, '', { add: true });
    expect(component.working).toBe('add');
    expect(fixture.nativeElement.querySelector('.ai-scene-adding').textContent).toContain('designer.ai.working-add');

    answered.next({ looks, requestsLast24Hours: 4, requestsPerUserPerDay: 20 });

    expect(component.scenes.length).toBe(3);
    expect(component.pickedScenes).toEqual([chorus, blackout, talk]);
    expect(component.playing).toBe(2);
    expect(component.playingName).toBe('Talk');
  });

  it('tells what went wrong with a change of a scene, and keeps the looks', () => {
    open();
    component.design();
    service.design.and.returnValue(throwError(httpError(503, { error: 'ai-busy' })));
    component.instruction = 'Slower';

    component.ask();

    expect(component.errorKey).toBe('designer.ai.error.ai-busy');
    expect(component.working).toBeUndefined();
    expect(component.view).toBe('looks');
    expect(component.instruction).toBe('Slower');
    expect(component.canAsk).toBe(true);
  });

  it('keeps the looks the AI answers once the panel is closed, without playing them', () => {
    open();
    let answered = answer([chorus, blackout]);
    component.design();
    fixture.destroy();
    preview.previewAiScene.calls.reset();

    answered.next({ looks, requestsLast24Hours: 3, requestsPerUserPerDay: 20 });
    expect(service.last.looks).toBe(looks);
    expect(preview.previewAiScene).not.toHaveBeenCalled();

    // the same for a change of a scene
    open();
    answered = answer([chorus, blackout]);
    component.instruction = 'Slower';
    component.ask();
    service.compile.calls.reset();
    fixture.destroy();
    preview.previewAiScene.calls.reset();

    const changed = { ...looks, name: 'Changed' };
    answered.next({ looks: changed, requestsLast24Hours: 4, requestsPerUserPerDay: 20 });
    expect(service.last.looks).toBe(changed);
    expect(service.compile).not.toHaveBeenCalled();
    expect(preview.previewAiScene).not.toHaveBeenCalled();
  });

  it("doesn't ask while it can't design", () => {
    open({ available: false });

    component.design();

    expect(service.design).not.toHaveBeenCalled();
  });

  it('tells what went wrong and stays where it was', () => {
    open();
    const cases: [any, string][] = [
      [httpError(429, { error: 'ai-user-limit-reached' }), 'designer.ai.error.ai-user-limit-reached'],
      [httpError(503, { error: 'ai-busy' }), 'designer.ai.error.ai-busy'],
      [httpError(502, { error: 'something-new' }), 'designer.ai.error.ai-failed'],
      [httpError(0, 'offline'), 'designer.ai.error.ai-failed'],
      [new Error('broken'), 'designer.ai.error.ai-failed'],
    ];

    for (const [error, key] of cases) {
      service.design.and.returnValue(throwError(error));
      component.design();
      expect(component.errorKey).toBe(key);
      expect(component.view).toBe('settings');
    }
    expect(logout).not.toHaveBeenCalled();
  });

  it('logs the user out when their session ran out', () => {
    open();
    service.design.and.returnValue(throwError(httpError(401, { error: 'unauthorized' })));

    component.design();

    expect(logout).toHaveBeenCalled();
    expect(component.errorKey).toBe('designer.ai.error.unauthorized');
  });

  it('asks to link the device where the host holds the account, instead of logging the user out', () => {
    TestBed.inject(ConfigService).aiAccount = 'host';
    open();

    for (const error of [httpError(401, { error: 'unauthorized' }), httpError(403, { error: 'device-not-linked' })]) {
      service.design.and.returnValue(throwError(error));
      component.design();

      expect(component.errorKey).toBe('designer.account.link-device');
    }

    expect(logout).not.toHaveBeenCalled();
  });

  it('plays the scene clicked on the stage, the one before and the one after', () => {
    open();
    component.design();
    fixture.detectChanges();

    (fixture.nativeElement.querySelectorAll('.ai-scene-play')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.playing).toBe(1);
    expect(preview.previewAiScene).toHaveBeenCalledWith(blackout, [], 1000);
    expect(fixture.nativeElement.querySelector('.ai-scene-playing').textContent).toContain('Blackout');

    // round and round
    component.next();
    expect(component.playing).toBe(0);
    component.previous();
    expect(component.playing).toBe(1);

    // there is none past the last one
    preview.endAiPreview.calls.reset();
    component.play(5);
    expect(preview.endAiPreview).toHaveBeenCalled();
  });

  it('plays one scene after the other, for 8 bars each at the tempo of the looks', fakeAsync(() => {
    open();
    component.design();

    component.setAutoplay(true);
    // 8 bars of 4 beats at 128 BPM
    tick(15000);
    expect(component.playing).toBe(1);
    tick(15000);
    expect(component.playing).toBe(0);

    component.setAutoplay(false);
    tick(30000);
    expect(component.playing).toBe(0);
  }));

  it('adds the scenes picked, with the presets they play, the one on the stage playing on', () => {
    const success = spyOn(TestBed.inject(ToastrService), 'success');
    open();
    component.design();
    fixture.detectChanges();

    // the blackout ticked off
    const pick = fixture.nativeElement.querySelectorAll('.ai-scene-pick')[1] as HTMLInputElement;
    pick.checked = false;
    pick.dispatchEvent(new Event('change'));
    expect(component.isPicked(blackout)).toBe(false);
    expect(component.pickedScenes).toEqual([chorus]);
    component.setPicked(blackout, true);
    component.setPicked(blackout, false);

    component.add();

    expect(service.addCompiled).toHaveBeenCalledWith(compiled, 'Neon night', [chorus], chorus);
    expect(success).toHaveBeenCalledWith('designer.ai.added');
    expect(service.last).toBeUndefined();
    expect(service.closePanel).toHaveBeenCalled();
    expect(preview.endAiPreview).toHaveBeenCalled();
  });

  it('lets go of the looks without adding anything', () => {
    open();
    component.design();

    component.discard();

    expect(service.last).toBeUndefined();
    expect(service.closePanel).toHaveBeenCalled();
    expect(service.addCompiled).not.toHaveBeenCalled();
  });

  it('closes, keeping the looks for the next time, and stops playing them', () => {
    open();
    component.design();

    component.close();

    expect(service.last.looks).toBe(looks);
    expect(service.closePanel).toHaveBeenCalled();
    expect(preview.endAiPreview).toHaveBeenCalled();

    preview.endAiPreview.calls.reset();
    fixture.destroy();
    expect(preview.endAiPreview).toHaveBeenCalled();
  });
});
