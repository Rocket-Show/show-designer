import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { FixtureSettingsPositionComponent } from './fixture-settings-position.component';

describe('FixtureSettingsPositionComponent', () => {
  let component: FixtureSettingsPositionComponent;
  let fixture: ComponentFixture<FixtureSettingsPositionComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [FixtureSettingsPositionComponent],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(FixtureSettingsPositionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
