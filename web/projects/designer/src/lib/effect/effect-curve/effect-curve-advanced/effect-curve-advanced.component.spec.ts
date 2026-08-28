import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { EffectCurveAdvancedComponent } from './effect-curve-advanced.component';

describe('EffectCurveAdvancedComponent', () => {
  let component: EffectCurveAdvancedComponent;
  let fixture: ComponentFixture<EffectCurveAdvancedComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [EffectCurveAdvancedComponent],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(EffectCurveAdvancedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
