import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NgxBootstrapSliderModule } from 'ngx-bootstrap-slider';

import { keepSliderValues } from './slider-value';

@Component({
  template: `<mv-slider [value]="value" [min]="min" [max]="max" [step]="1" (change)="slid = $event.newValue"></mv-slider>`,
  standalone: false,
})
class SliderHostComponent {
  value = 100;
  min = 0;
  max = 400;
  slid: number;
}

// A slider keeps its value when its range changes, e.g. when another capability of a channel is picked: the slider
// library fell back to a value of its own (5).
describe('keepSliderValues', () => {
  beforeEach(() => {
    keepSliderValues();
    TestBed.configureTestingModule({ declarations: [SliderHostComponent], imports: [NgxBootstrapSliderModule] });
  });

  function createSlider(value: number) {
    const fixture = TestBed.createComponent(SliderHostComponent);
    fixture.componentInstance.value = value;
    fixture.detectChanges();
    const slider = fixture.debugElement.children[0].componentInstance.slider;
    return { fixture, shown: () => fixture.debugElement.children[0].componentInstance.slider.getValue(), slider };
  }

  it('keeps the value through a new range', () => {
    const { fixture, shown } = createSlider(100);

    fixture.componentInstance.max = 600;
    fixture.detectChanges();
    expect(shown()).toBe(100);

    fixture.componentInstance.min = -100;
    fixture.detectChanges();
    expect(shown()).toBe(100);
  });

  it('moves the value into a range which no longer holds it', () => {
    const { fixture, shown } = createSlider(100);

    fixture.componentInstance.min = 129;
    fixture.componentInstance.max = 255;
    fixture.detectChanges();

    expect(shown()).toBe(129);
  });

  it('takes a value of the new range, which arrives before the range', () => {
    const { fixture, shown } = createSlider(100);

    fixture.componentInstance.value = 200;
    fixture.componentInstance.min = 129;
    fixture.componentInstance.max = 255;
    fixture.detectChanges();
    expect(shown()).toBe(200);

    fixture.componentInstance.value = 10;
    fixture.componentInstance.min = 0;
    fixture.componentInstance.max = 128;
    fixture.detectChanges();
    expect(shown()).toBe(10);
  });

  it('starts with and keeps a value of 0', () => {
    const { fixture, shown } = createSlider(0);
    expect(shown()).toBe(0);

    fixture.componentInstance.max = 600;
    fixture.detectChanges();

    expect(shown()).toBe(0);
  });

  it('keeps the value it has been slid to', () => {
    const { fixture, shown, slider } = createSlider(100);

    slider.setValue(300, false, true);
    expect(fixture.componentInstance.slid).toBe(300);

    fixture.componentInstance.max = 600;
    fixture.detectChanges();
    expect(shown()).toBe(300);

    // the change listeners have been added to the slider built anew as well
    fixture.debugElement.children[0].componentInstance.slider.setValue(350, false, true);
    expect(fixture.componentInstance.slid).toBe(350);
    fixture.componentInstance.min = 10;
    fixture.detectChanges();
    expect(shown()).toBe(350);
  });

  it('is applied only once', () => {
    keepSliderValues();
    const { fixture, shown } = createSlider(100);

    fixture.componentInstance.max = 600;
    fixture.detectChanges();

    expect(shown()).toBe(100);
  });
});
