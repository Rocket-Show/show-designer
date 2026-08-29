// How much of one effect of the preset a step lets through. Effects stay on the preset
// so they keep their phase across the steps: a step only opens or closes them.
export class PresetStepEffectAmount {
  effectUuid: string;

  // 1 = the effect runs as it is set up, 0 = the step silences it
  amount = 1;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.effectUuid = data.effectUuid;
    this.amount = data.amount === undefined ? 1 : data.amount;
  }
}
