import { ExternalActionTrigger, ExternalAudioFile, ExternalComposition } from './external-composition';

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

  it('reads what Rocket Show leaves out as nothing', () => {
    expect(new ExternalComposition().actionTriggers).toEqual([]);
    expect(new ExternalComposition().audioFiles).toEqual([]);
    expect(new ExternalActionTrigger().actionTypes).toEqual([]);
    expect(new ExternalAudioFile().name).toBe('');

    // actions without a wrapper or without a name, a trigger at the start
    const composition = new ExternalComposition({ actionTriggerList: [{ actionList: [null, {}, { actionMidi: null }] }] });
    expect(composition.actionTriggers[0].positionMillis).toBe(0);
    expect(composition.actionTriggers[0].actionTypes).toEqual(['actionMidi']);

    // a file without a name, an offset or a volume plays at the start, at full
    const file = new ExternalAudioFile({ outputBusUuid: 'bus' });
    expect([file.name, file.busUuid, file.offsetMillis, file.volume]).toEqual(['', 'bus', 0, 1]);
  });

  it('has no actions, if there are none', () => {
    const composition = new ExternalComposition({ name: 'Song', durationMillis: 1000 });

    expect(composition.actionTriggers).toEqual([]);
    expect(composition.lastActionMillis).toBe(0);
  });
});
