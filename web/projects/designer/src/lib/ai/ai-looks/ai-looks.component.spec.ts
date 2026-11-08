import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { of, Subject, throwError } from 'rxjs';

import { AiLooks, AiLooksStatus, AiRig, defaultAiSettings } from '../../models/ai-looks';
import { AiLooksService } from '../../services/ai-looks.service';
import { UserService } from '../../services/user.service';
import { AiLooksComponent } from './ai-looks.component';

// The dialog of the AI looks: what the user picks, the request to Claude (through AiLooksService), the looks it
// answers, changing them and adding them to the project, and what it tells when something goes wrong.
describe('AiLooksComponent', () => {
  let fixture: ComponentFixture<AiLooksComponent>;
  let component: AiLooksComponent;
  let service: any;
  let status: Subject<AiLooksStatus>;
  let hide: jasmine.Spy;
  let logout: jasmine.Spy;

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
    ],
  };

  function httpError(status: number, error: any): HttpErrorResponse {
    return new HttpErrorResponse({ status, error });
  }

  beforeEach(() => {
    hide = jasmine.createSpy('hide');
    logout = jasmine.createSpy('logout');
    status = new Subject<AiLooksStatus>();
    service = {
      last: undefined,
      getRig: () => rig,
      getTempo: () => 128,
      getStatus: () => status,
      getRequest: jasmine
        .createSpy('getRequest')
        .and.callFake((r, settings, prompt, current, instruction) => ({ settings, prompt, current, instruction })),
      design: jasmine.createSpy('design').and.returnValue(of({ looks, requestsLast24Hours: 3, requestsPerUserPerDay: 20 })),
      addToProject: jasmine.createSpy('addToProject').and.returnValue({ presets: [{}, {}], scenes: [{}] }),
    };

    TestBed.configureTestingModule({
      declarations: [AiLooksComponent],
      imports: [FormsModule, TranslateModule.forRoot(), ToastrModule.forRoot()],
      providers: [
        { provide: BsModalRef, useValue: { hide } },
        { provide: AiLooksService, useValue: service },
        { provide: UserService, useValue: { logout } },
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

    // the scene is marked with the colors of its presets, and names them
    expect(component.sceneColors(looks.scenes[0].presets)).toEqual(['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#123456']);
    expect(component.presetNames(['wash', 'missing', 'solid'])).toBe('Wash, Solid');
  });

  it('changes the looks as the user says, and goes back to the settings', () => {
    open();
    component.design();

    component.instruction = '   ';
    component.change();
    expect(service.design).toHaveBeenCalledTimes(1);

    component.instruction = ' Warmer ';
    component.change();
    expect(service.getRequest).toHaveBeenCalledWith(rig, component.settings, '', looks, 'Warmer');
    expect(component.instruction).toBe('');

    component.errorKey = 'designer.ai.error.ai-busy';
    component.back();
    expect(component.view).toBe('settings');
    expect(component.errorKey).toBeUndefined();
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

  it('adds the looks to the project at the tempo picked, and closes', () => {
    const success = spyOn(TestBed.inject(ToastrService), 'success');
    open();
    component.design();

    component.add();

    expect(service.addToProject).toHaveBeenCalledWith(looks, rig, 128);
    expect(success).toHaveBeenCalledWith('designer.ai.added');
    expect(service.last).toBeUndefined();
    expect(hide).toHaveBeenCalled();
  });

  it('closes without adding anything', () => {
    open();

    component.cancel();

    expect(hide).toHaveBeenCalled();
    expect(service.addToProject).not.toHaveBeenCalled();
  });
});
