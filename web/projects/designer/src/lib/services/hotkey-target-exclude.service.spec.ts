import { inject, TestBed } from '@angular/core/testing';

import { HotkeyTargetExcludeService } from './hotkey-target-exclude.service';

describe('HotkeyTargetExcludeService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HotkeyTargetExcludeService],
    });
  });

  it('should be created', inject([HotkeyTargetExcludeService], (service: HotkeyTargetExcludeService) => {
    expect(service).toBeTruthy();
  }));

  it('leaves the keyboard to the fields the user types in', inject([HotkeyTargetExcludeService], (service: HotkeyTargetExcludeService) => {
    const input = document.createElement('input');
    expect(service.excludeTyping({ target: input })).toBe(true);

    input.type = 'number';
    expect(service.excludeTyping({ target: input })).toBe(true);

    expect(service.excludeTyping({ target: document.createElement('textarea') })).toBe(true);
  }));

  it('keeps the keyboard where there is nothing to type into', inject(
    [HotkeyTargetExcludeService],
    (service: HotkeyTargetExcludeService) => {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      expect(service.excludeTyping({ target: checkbox })).toBe(false);

      const slider = document.createElement('input');
      slider.type = 'range';
      expect(service.excludeTyping({ target: slider })).toBe(false);

      expect(service.excludeTyping({ target: document.createElement('div') })).toBe(false);
      expect(service.excludeTyping({ target: undefined })).toBe(false);
    }
  ));

  it('leaves the keys of the designer to the fields handling them themselves', inject(
    [HotkeyTargetExcludeService],
    (service: HotkeyTargetExcludeService) => {
      for (const name of ['input', 'select', 'textarea']) {
        expect(service.exclude({ target: document.createElement(name) })).toBe(true);
      }

      const editable = document.createElement('div');
      editable.contentEditable = 'true';
      document.body.appendChild(editable);
      expect(service.exclude({ target: editable })).toBe(true);
      editable.remove();

      expect(service.exclude({ target: document.createElement('button') })).toBe(false);
      expect(service.exclude({ target: undefined })).toBe(false);
    }
  ));
});
