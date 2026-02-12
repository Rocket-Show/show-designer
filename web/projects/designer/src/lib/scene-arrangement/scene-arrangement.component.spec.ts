import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SceneArrangementComponent } from './scene-arrangement.component';

describe('SceneArrangementComponent', () => {
  let component: SceneArrangementComponent;
  let fixture: ComponentFixture<SceneArrangementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SceneArrangementComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SceneArrangementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
