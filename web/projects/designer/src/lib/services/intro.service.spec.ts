import { ConfigService } from './config.service';
import { IntroService } from './intro.service';

// The intro walks a new user through the panels of the designer, shown next to each of them.
describe('IntroService', () => {
  let configService: ConfigService;
  let service: IntroService;
  let stored: string;

  beforeEach(() => {
    stored = localStorage.getItem('showIntro');
    localStorage.removeItem('showIntro');
    configService = new ConfigService();
    service = new IntroService(configService);
  });

  afterEach(() => {
    if (stored === null) {
      localStorage.removeItem('showIntro');
    } else {
      localStorage.setItem('showIntro', stored);
    }
  });

  function position(): [string, number, number] {
    return [service.activeStep, service.positionTopPercentage, service.positionLeftPercentage];
  }

  it('shows the intro to a new user, where it is part of the designer', () => {
    service.refresh();
    expect(service.showIntro).toBe(false);

    configService.intro = true;
    service.refresh();
    expect(service.showIntro).toBe(true);
    expect(service.showStep('start')).toBe(true);
    expect(service.showStep('preview')).toBe(false);
  });

  it('remembers that the intro has been closed', () => {
    configService.intro = true;
    service.setShowIntro(false);

    const reloaded = new IntroService(configService);
    reloaded.refresh();

    expect(reloaded.showIntro).toBe(false);
    expect(reloaded.showStep('start')).toBe(false);
  });

  it('walks through the panels, next to each of them', () => {
    const changed = jasmine.createSpy('stepChanged');
    service.stepChanged.subscribe(changed);
    const walked: [string, number, number][] = [position()];

    for (let step = 0; step < 8; step++) {
      service.next();
      walked.push(position());
    }

    expect(walked).toEqual([
      ['start', 50, 50],
      ['preview', 60, 40],
      ['fixtures', 40, 30],
      ['presets', 30, 50],
      ['capabilities', 50, 60],
      ['scenes', 50, 40],
      ['timeline', 40, 50],
      ['finish', 50, 50],
      // it ends there
      ['finish', 50, 50],
    ]);
    expect(changed).toHaveBeenCalledTimes(8);
  });

  it('shows each step at the same place when going back to it', () => {
    const forth: [string, number, number][] = [position()];
    while (position()[0] !== 'finish') {
      service.next();
      forth.push(position());
    }

    const back: [string, number, number][] = [position()];
    while (position()[0] !== 'start') {
      service.back();
      back.unshift(position());
    }
    service.back();

    expect(back).toEqual(forth);
    expect(position()).toEqual(['start', 50, 50]);
  });

  it('starts over at the first step', () => {
    service.next();
    service.next();
    service.next();

    service.reset();

    expect(position()).toEqual(['start', 50, 50]);
    expect(service.showIntro).toBe(true);
    expect(localStorage.getItem('showIntro')).toBe('true');
  });
});
