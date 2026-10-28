import { ExternalComposition } from './external-composition';

// Rocket Show hands out its compositions like it saves them
describe('ExternalComposition', () => {
  it('reads the actions, in the order they are fired', () => {
    const composition = new ExternalComposition({
      name: 'Song',
      durationMillis: 180000,
      actionTriggerList: [
        { positionMillis: 60000, actionList: [{ actionHttp: { type: 'HTTP', url: 'http://example.com' } }] },
        {
          positionMillis: 1500,
          actionList: [{ actionMidi: { type: 'MIDI', midiSignal: {} } }, { actionLighting: { type: 'LIGHTING' } }],
        },
      ],
    });

    expect(composition.durationMillis).toBe(180000);
    expect(composition.actionTriggers.map((trigger) => trigger.positionMillis)).toEqual([1500, 60000]);
    expect(composition.actionTriggers[0].actionTypes).toEqual(['MIDI', 'LIGHTING']);
    expect(composition.actionTriggers[1].actionTypes).toEqual(['HTTP']);
    expect(composition.lastActionMillis).toBe(60000);
  });

  it('names an action by its wrapper, if it does not tell its kind', () => {
    const composition = new ExternalComposition({ actionTriggerList: [{ positionMillis: 0, actionList: [{ actionNull: {} }] }] });

    expect(composition.actionTriggers[0].actionTypes).toEqual(['actionNull']);
  });

  it('has no actions, if there are none', () => {
    const composition = new ExternalComposition({ name: 'Song', durationMillis: 1000 });

    expect(composition.actionTriggers).toEqual([]);
    expect(composition.lastActionMillis).toBe(0);
  });
});
