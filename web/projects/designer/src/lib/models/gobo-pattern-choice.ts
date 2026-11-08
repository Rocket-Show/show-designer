// The pre-generated pattern the preview shows a gobo of a fixture model with, picked by hand in its gobo wheel: the
// fixture library names the gobos of a fixture, but has no pictures of them (see preview/models/gobo). It holds for all
// fixtures of the model, and only the preview of the designer reads it.
export class GoboPatternChoice {
  profileUuid: string;
  // the wheel and the slot on it
  wheel: string;
  slotNumber: number;
  // the id of a pattern of the catalog (see goboCatalog)
  pattern: string;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.profileUuid = data.profileUuid;
    this.wheel = data.wheel;
    this.slotNumber = data.slotNumber;
    this.pattern = data.pattern;
  }
}
