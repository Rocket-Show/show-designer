// a value of a fan at its place along it, from 0 (the first fixture) to 1 (the last one) (see fan)
export class FanStop {
  position = 0;
  valuePercentage = 0;

  constructor(data?: any) {
    if (!data) {
      return;
    }

    // a value missing or null keeps the default, like in Rocket Show
    this.position = data.position ?? 0;
    this.valuePercentage = data.valuePercentage ?? 0;
  }
}
