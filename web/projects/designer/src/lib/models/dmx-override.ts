// A DMX channel held at a value by a fader of the DMX channels, whatever the project puts on it: the value is sent as
// it is, after the master dimmer, until the fader is let go. Like the fixtures being identified, the faders only travel
// to the live preview (Rocket Show plays them the same way, see DmxOverride there): they are never loaded back from a
// project.
export interface DmxOverride {
  // the universe of the project the channel is in
  universeUuid: string;

  // the channel, counted from 0 like the first channel of a fixture (DMX address 1 is channel 0)
  dmxChannel: number;

  // the value sent, from 0 to 255
  value: number;
}

// the number of channels of a DMX universe
export const dmxUniverseSize = 512;
