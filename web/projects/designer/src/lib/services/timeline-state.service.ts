import { Injectable } from '@angular/core';
import { Composition } from '../models/composition';

@Injectable({
  providedIn: 'root',
})
export class TimelineStateService {
  public playState = 'paused';
  public selectedComposition: Composition;
  public selectedCompositionIndex: number;

  constructor() {}
}
