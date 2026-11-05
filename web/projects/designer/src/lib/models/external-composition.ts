// a point in time of the composition, at which Rocket Show fires actions
export class ExternalActionTrigger {
  positionMillis = 0;

  // the kinds of the actions fired (e.g. MIDI, LIGHTING), in their order
  actionTypes: string[] = [];

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.positionMillis = data.positionMillis || 0;

    // each action comes wrapped in an object named after its kind, e.g. { actionMidi: { type: 'MIDI', ... } }
    for (const wrapper of data.actionList || []) {
      const name = wrapper ? Object.keys(wrapper)[0] : undefined;

      if (!name) {
        continue;
      }

      const action = wrapper[name];
      this.actionTypes.push(action && action.type ? action.type : name);
    }
  }
}

// an audio file Rocket Show plays with a composition, on one of its audio buses
export class ExternalAudioFile {
  name = '';
  busUuid: string;
  // how much later than the composition it starts, and how loud it plays
  offsetMillis = 0;
  volume = 1;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.name = data.name || '';
    this.busUuid = data.outputBusUuid;
    this.offsetMillis = data.offsetMillis || 0;
    this.volume = data.volume ?? 1;
  }
}

// The composition as Rocket Show plays it, with the same name as the one in the designer.
// The designer only shows it to line the scenes up with: it plays the files and fires the
// actions, the designer plays the lights along.
export class ExternalComposition {
  // how long its files and actions last
  durationMillis = 0;

  // in the order they are fired
  actionTriggers: ExternalActionTrigger[] = [];

  // the audio files it plays along the composition: the ones it analyzes for the pixel effects following its buses
  // (a file which loops or is switched off isn't)
  audioFiles: ExternalAudioFile[] = [];

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.durationMillis = data.durationMillis || 0;

    for (const actionTrigger of data.actionTriggerList || []) {
      this.actionTriggers.push(new ExternalActionTrigger(actionTrigger));
    }

    this.actionTriggers.sort((a, b) => a.positionMillis - b.positionMillis);

    // each file comes wrapped in an object named after its kind, e.g. { audioFile: { name: 'Song.wav', ... } }
    for (const wrapper of data.compositionFileList || []) {
      const audioFile = wrapper && wrapper.audioFile;

      if (audioFile && audioFile.active !== false && !audioFile.loop) {
        this.audioFiles.push(new ExternalAudioFile(audioFile));
      }
    }
  }

  // where the last action is fired (0 without actions)
  get lastActionMillis(): number {
    return this.actionTriggers.length > 0 ? this.actionTriggers[this.actionTriggers.length - 1].positionMillis : 0;
  }
}
