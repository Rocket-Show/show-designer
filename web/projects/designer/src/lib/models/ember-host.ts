import { Observable } from 'rxjs';

// A text of the host application: a translation key with its parameters
export interface EmberNote {
  key: string;
  params?: { [name: string]: string | number };
}

// What a connected Ember stick tells about itself
export interface EmberStick {
  // the version of its firmware
  firmware: string;

  // the show it plays: its size (0 without a show), and a mark which only this very show has
  showBytes: number;
  showMark: string;

  // the entries of the show, and the one which plays (from 0)
  entries: number;
  entry: number;

  blackout: boolean;

  // what is wrong with it, if anything
  trouble?: EmberNote;
}

// The Ember stick, as the application around the designer offers it. The designer has the parts to work with a stick
// (its entry in the menu and its dialog: what the stick plays, copying the project onto it, the preview on the lights);
// the host switches them on by handing this to the designer, and does the work: the designer knows nothing about USB,
// the stick's files or its firmware. Like a Rocket Show device, which plays and previews for the designer.
export interface EmberHost {
  // can this browser talk to a stick at all (without: the show as a file to copy onto the stick's drive)
  supported: boolean;

  state: 'disconnected' | 'connecting' | 'connected';

  // the stick, while one is connected
  stick: EmberStick;

  // the stick sends what the designer previews to the lights
  live: boolean;

  // while a show is copied onto the stick: the blocks taken, of how many
  sending: { taken: number; blocks: number };

  // what went wrong last
  problem: EmberNote;

  // anything above changed
  changed: Observable<void>;

  // let the user pick the stick
  connect(): void;
  disconnect(): void;

  // The mark the show made from this project has (see EmberStick.showMark): the stick plays the project, when it has
  // the same. Undefined when no show can be made from it.
  showMark(projectJson: string): Promise<string>;

  // Copy the project onto the stick as its show. False when it didn't work: why is in problem.
  send(projectJson: string): Promise<boolean>;

  // give the show made from the project as a file
  download(projectJson: string, name: string): void;

  setLive(on: boolean): void;

  // like the stick's button
  next(): void;
  back(): void;
  toggleBlackout(): void;
}
