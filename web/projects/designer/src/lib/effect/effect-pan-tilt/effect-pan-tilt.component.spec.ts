import { TestBed } from '@angular/core/testing';

import { EffectPanTiltComponent } from './effect-pan-tilt.component';

// The editor of a pan/tilt effect. It only draws the field the movement is to be set in so
// far, the effect cannot be added yet.
describe('EffectPanTiltComponent', () => {
  it('draws the field the pan and the tilt are set in', () => {
    TestBed.configureTestingModule({
      declarations: [EffectPanTiltComponent],
    });

    const fixture = TestBed.createComponent(EffectPanTiltComponent);
    fixture.detectChanges();

    const grid: SVGElement = fixture.nativeElement.querySelector('svg.pan-tilt-grid');

    expect(grid).not.toBeNull();
    expect(fixture.componentInstance.panTiltGrid.nativeElement).toBe(grid);

    fixture.destroy();
  });
});
