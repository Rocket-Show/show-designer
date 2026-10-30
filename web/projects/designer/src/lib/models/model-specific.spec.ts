import { countModelSpecificValues } from './model-specific';
import { Preset } from './preset';

describe('countModelSpecificValues', () => {
  it('counts the values of channels, the slots of wheels and the channels of effects set for one model', () => {
    const preset = new Preset({
      steps: [
        {
          fixtureChannelValues: [
            { profileUuid: 'par', channelName: 'Strobe', value: 20 },
            { profileUuid: 'par', channelName: 'Macro', value: 30 },
          ],
          fixtureCapabilityValues: [
            { type: 'WheelSlot', wheel: 'Gobo Wheel', slotNumber: 2, profileUuid: 'spot' },
            // what plays on every model doesn't count
            { type: 'Intensity', valuePercentage: 1 },
            { type: 'Zoom', valuePercentage: 0.5 },
          ],
        },
        { fixtureChannelValues: [{ profileUuid: 'par', channelName: 'Strobe', value: 40 }] },
      ],
      effects: [{ type: 'curve', channels: [{ profileUuid: 'spot', channels: ['Focus', 'Iris'] }], capabilities: [{ type: 'Pan' }] }],
    });

    expect(Array.from(countModelSpecificValues(preset).entries())).toEqual([
      ['par', 3],
      ['spot', 3],
    ]);
  });

  it('counts the values a preset of an older project keeps itself', () => {
    const preset = new Preset({ fixtureChannelValues: [{ profileUuid: 'par', channelName: 'Strobe', value: 20 }] });

    expect(countModelSpecificValues(preset).get('par')).toBe(1);
  });

  it('counts nothing for a preset playing on every model', () => {
    const preset = new Preset({ steps: [{ fixtureCapabilityValues: [{ type: 'ColorIntensity', color: 'Red', valuePercentage: 1 }] }] });

    expect(countModelSpecificValues(preset).size).toBe(0);
  });
});
