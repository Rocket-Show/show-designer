import { Effect } from '../models/effect';
import { EffectCurve } from '../models/effect-curve';
import { EffectPanTilt } from '../models/effect-pan-tilt';
import { Preset } from '../models/preset';
import { EffectService } from './effect.service';

// Copying an effect: the copy runs alongside the original, let through by the steps the same way.
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
});
