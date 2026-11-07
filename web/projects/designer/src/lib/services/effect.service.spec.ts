import { Effect } from '../models/effect';
import { EffectCurve } from '../models/effect-curve';
import { EffectPanTilt } from '../models/effect-pan-tilt';
import { Preset } from '../models/preset';
import { EffectService } from './effect.service';

// Adding, copying and deleting effects, and which steps of their preset they run in: a copy runs alongside the
// original, let through by the steps the same way, and a new effect runs in the step being edited only.
describe('EffectService', () => {
  let service: EffectService;
  let uuids: number;

  beforeEach(() => {
    uuids = 0;
    service = new EffectService({ getUuid: () => 'copy-' + ++uuids } as any);
  });

  function presetWith(...effects: Effect[]): Preset {
    const preset = new Preset({
      steps: [
        { uuid: 'quiet', effectAmounts: [{ effectUuid: 'sweep', amount: 0.25 }] },
        { uuid: 'full', effectAmounts: [] },
      ],
    });
    preset.effects = effects;
    return preset;
  }

  it('copies a curve right below it and selects the copy', () => {
    const sweep = new EffectCurve({ uuid: 'sweep', curveType: 'triangle', lengthMillis: 1234 });
    const other = new EffectCurve({ uuid: 'other' });
    const preset = presetWith(sweep, other);
    const changed = jasmine.createSpy('effectsChanged');
    service.effectsChanged.subscribe(changed);

    const copy = service.duplicateEffect(preset, sweep) as EffectCurve;

    expect(copy instanceof EffectCurve).toBe(true);
    expect(copy.uuid).toBe('copy-1');
    expect([copy.curveType, copy.lengthMillis]).toEqual(['triangle', 1234]);
    expect(preset.effects).toEqual([sweep, copy, other]);
    expect(service.selectedEffect).toBe(copy);
    expect(changed).toHaveBeenCalled();
  });

  it('lets the copy through the steps like the original', () => {
    const sweep = new EffectCurve({ uuid: 'sweep' });
    const preset = presetWith(sweep);

    const copy = service.duplicateEffect(preset, sweep);

    expect(preset.steps[0].effectAmounts.map((amount) => [amount.effectUuid, amount.amount])).toEqual([
      ['sweep', 0.25],
      [copy.uuid, 0.25],
    ]);
    // a step which says nothing about the original lets the copy run fully as well
    expect(preset.steps[1].effectAmounts).toEqual([]);
  });

  it('copies a pan and tilt effect', () => {
    const panTilt = new EffectPanTilt({ uuid: 'circle' });

    expect(service.duplicateEffect(presetWith(panTilt), panTilt) instanceof EffectPanTilt).toBe(true);
  });

  it('copies nothing it does not know', () => {
    const sweep = new EffectCurve({ uuid: 'sweep' });

    expect(service.duplicateEffect(presetWith(), sweep)).toBeUndefined();

    const unknown = new EffectCurve({ uuid: 'unknown' });
    unknown.type = 'from-a-newer-designer';
    expect(service.duplicateEffect(presetWith(unknown), unknown)).toBeUndefined();
    expect(service.selectedEffect).toBeUndefined();
  });

  it('adds an effect to a preset running through a single step, selected to be edited', () => {
    const preset = new Preset({ steps: [{ uuid: 'only' }] });
    const sweep = new EffectCurve({ uuid: 'sweep' });
    const changed = jasmine.createSpy('effectsChanged');
    service.effectsChanged.subscribe(changed);

    service.addEffect(preset, sweep, preset.steps[0]);

    expect(preset.effects).toEqual([sweep]);
    expect(preset.steps[0].effectAmounts).toEqual([]);
    expect(service.selectedEffect).toBe(sweep);
    expect(changed).toHaveBeenCalled();
  });

  it('runs a new effect in the step being edited only, once the preset runs through more than one', () => {
    const preset = presetWith(new EffectCurve({ uuid: 'sweep' }));
    const added = new EffectCurve({ uuid: 'added' });

    service.addEffect(preset, added, preset.steps[1]);

    expect(preset.steps[0].getEffectAmount('added')).toBe(0);
    expect(preset.steps[1].getEffectAmount('added')).toBe(1);
    // the step running it says nothing about it
    expect(preset.steps[1].effectAmounts).toEqual([]);
    // what the other step says about the effects it had stays
    expect(preset.steps[0].getEffectAmount('sweep')).toBe(0.25);
  });

  it('runs a new effect in every step, without a step of the preset being edited', () => {
    const preset = presetWith();

    service.addEffect(preset, new EffectCurve({ uuid: 'other' }), new Preset({ steps: [{ uuid: 'elsewhere' }] }).steps[0]);

    expect(preset.steps.map((step) => step.getEffectAmount('other'))).toEqual([1, 1]);
  });

  it('selects a new effect, even without a preset to add it to', () => {
    const sweep = new EffectCurve({ uuid: 'sweep' });

    service.addEffect(undefined, sweep);

    expect(service.selectedEffect).toBe(sweep);
  });

  it('deletes an effect, and what the steps say about it', () => {
    const sweep = new EffectCurve({ uuid: 'sweep' });
    const other = new EffectCurve({ uuid: 'other' });
    const preset = presetWith(sweep, other);
    const changed = jasmine.createSpy('effectsChanged');
    service.effectsChanged.subscribe(changed);

    service.deleteEffect(preset, sweep);

    expect(preset.effects).toEqual([other]);
    expect(preset.steps[0].effectAmounts).toEqual([]);
    expect(changed).toHaveBeenCalled();
  });

  it('deletes nothing which is not an effect of the preset', () => {
    const preset = presetWith(new EffectCurve({ uuid: 'other' }));
    const changed = jasmine.createSpy('effectsChanged');
    service.effectsChanged.subscribe(changed);

    service.deleteEffect(preset, new EffectCurve({ uuid: 'sweep' }));

    expect(preset.effects.length).toBe(1);
    expect(preset.steps[0].effectAmounts.length).toBe(1);
    expect(changed).not.toHaveBeenCalled();
  });

  it('tells whether an effect runs in a step, however much of it the step lets through', () => {
    const sweep = new EffectCurve({ uuid: 'sweep' });
    const preset = presetWith(sweep);

    expect(service.runsInStep(preset.steps[0], sweep)).toBe(true);
    expect(service.runsInStep(preset.steps[1], sweep)).toBe(true);
    expect(service.runsInStep(undefined, sweep)).toBe(true);

    preset.steps[0].effectAmounts[0].amount = 0;
    expect(service.runsInStep(preset.steps[0], sweep)).toBe(false);
  });

  it('lets an effect run fully in a step, or silences it there', () => {
    const sweep = new EffectCurve({ uuid: 'sweep' });
    const preset = presetWith(sweep);
    const changed = jasmine.createSpy('effectsChanged');
    service.effectsChanged.subscribe(changed);

    service.setRunsInStep(preset.steps[1], sweep, false);

    expect(preset.steps[1].effectAmounts.map((amount) => [amount.effectUuid, amount.amount])).toEqual([['sweep', 0]]);
    expect(changed).toHaveBeenCalled();

    // running fully is what a step says nothing about
    service.setRunsInStep(preset.steps[0], sweep, true);

    expect(preset.steps[0].effectAmounts).toEqual([]);
    expect(preset.steps[0].getEffectAmount('sweep')).toBe(1);
  });
});
