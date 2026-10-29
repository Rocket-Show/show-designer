export abstract class Effect {
  type: string;
  uuid: string;
  visible = true;

  constructor(type: string, data?: any) {
    this.type = type;

    if (!data) {
      return;
    }

    this.uuid = data.uuid;
    // an effect is shown, unless it was hidden (like in Rocket Show)
    this.visible = data.visible !== false;
  }
}
