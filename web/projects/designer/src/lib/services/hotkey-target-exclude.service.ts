import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class HotkeyTargetExcludeService {
  // the kinds of input the user types text into. The others (a checkbox of the fixture
  // list, a slider, a color field) only take clicks and keep the focus afterwards.
  private static readonly textInputTypes = [
    'text',
    'search',
    'url',
    'tel',
    'email',
    'password',
    'number',
    'date',
    'datetime-local',
    'month',
    'week',
    'time',
  ];

  constructor() {}

  exclude(event: any): boolean {
    // don't react on certain targets (e.g. the user is inside an input field)
    if (!event.target) {
      return false;
    }

    if (event.target.nodeName === 'INPUT') {
      return true;
    }

    return false;
  }

  // is the user typing into a field? Those bring their own way of reacting to the
  // keyboard, e.g. the undo of the browser, and keep it to themselves.
  excludeTyping(event: any): boolean {
    const target = event.target;

    if (!target) {
      return false;
    }

    if (target.isContentEditable || target.nodeName === 'TEXTAREA') {
      return true;
    }

    return target.nodeName === 'INPUT' && HotkeyTargetExcludeService.textInputTypes.indexOf((target.type || 'text').toLowerCase()) >= 0;
  }
}
