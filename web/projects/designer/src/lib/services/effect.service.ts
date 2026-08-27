import { Injectable } from '@angular/core';
import { Effect } from './../models/effect';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class EffectService {
  // The currently selected effect
  selectedEffect: Effect;

  // The effects are currently being edited
  effectsOpen: boolean = false;
  effectsOpenChanged: Subject<void> = new Subject<void>();

  // fires, when the effects of the preset changed in a way which changes the channels they
  // drive: an effect has been added, deleted, hidden, shown, or aimed at other channels
  effectsChanged: Subject<void> = new Subject<void>();

  constructor() {}
}
