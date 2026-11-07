// A marker on the timeline of a composition: a label naming a part of it ("label"), or a hold point ("hold"), where the
// timeline stops until GO while the effects keep running (see CompositionHold). Rocket Show holds there as well.
export class CompositionMarker {
  uuid: string;
  name: string;
  positionMillis = 0;
  type = 'label';

  constructor(data?: any) {
    if (!data) {
      return;
    }

    this.uuid = data.uuid;
    this.name = data.name;
    this.positionMillis = data.positionMillis ?? 0;
    // a marker of a type this designer doesn't know is a label
    this.type = data.type === 'hold' ? 'hold' : 'label';
  }
}
