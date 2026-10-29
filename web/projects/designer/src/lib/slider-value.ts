import { SliderComponent } from 'ngx-bootstrap-slider';

let kept = false;

// The slider of ngx-bootstrap-slider builds itself anew once its range (or another of its options) changes, e.g. when
// another capability of a channel is picked. It then falls back to the default value of bootstrap-slider (5), because it
// leaves its value out of its options, and it doesn't take a value of 0 when it is created. Keep the value it has been
// given (or slid to) instead, moved into its range, if it is outside of it. The value is kept as it has been given and
// not as the slider shows it, because it arrives before the new range: a value of the new range would otherwise be cut
// to the old one first.
export function keepSliderValues() {
  if (kept) {
    return;
  }
  kept = true;

  const prototype = SliderComponent.prototype as any;
  const valueProperty = Object.getOwnPropertyDescriptor(prototype, 'value');
  const ngOnInit = prototype.ngOnInit;
  const prepareSlider = prototype.prepareSlider;
  const changeAttribute = prototype.changeAttribute;

  Object.defineProperty(prototype, 'value', {
    ...valueProperty,
    set(value: any) {
      this.keptValue = value;
      valueProperty.set.call(this, value);
    },
  });

  prototype.ngOnInit = function () {
    ngOnInit.call(this);
    this.applyKeptValue();
  };

  // the listeners are added anew whenever the slider has been built
  prototype.prepareSlider = function () {
    prepareSlider.call(this);
    this.slider.on('change', (event: any) => {
      this.keptValue = event.newValue;
    });
  };

  prototype.changeAttribute = function (name: string, value: any) {
    changeAttribute.call(this, name, value);
    this.applyKeptValue();
  };

  prototype.applyKeptValue = function () {
    if (this.slider && this.keptValue !== undefined) {
      this.slider.setValue(this.keptValue);
    }
  };
}
