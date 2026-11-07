// A hold the timeline of a composition played through: it stopped at a hold point at the passed position and held
// there for the passed time, until GO (see CompositionMarker). The current hold counts with the time held so far.
export interface CompositionHold {
  positionMillis: number;
  heldMillis: number;
}

// The time the timeline held between the passed positions, the ends included: the effects and the steps of a clip
// spanning a hold keep running while the position stands still, so this is added to the time they have run for.
// Rocket Show adds it up the same way (Holds.getHeldMillis).
export function getHeldMillis(holds: CompositionHold[], fromMillis: number, toMillis: number): number {
  let heldMillis = 0;

  for (const hold of holds || []) {
    if (hold.positionMillis >= fromMillis && hold.positionMillis <= toMillis) {
      heldMillis += hold.heldMillis;
    }
  }

  return heldMillis;
}
