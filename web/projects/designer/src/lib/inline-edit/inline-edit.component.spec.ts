import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

import { InlineEditComponent } from './inline-edit.component';

describe('InlineEditComponent', () => {
  let component: InlineEditComponent;
  let fixture: ComponentFixture<InlineEditComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [FormsModule, TranslateModule.forRoot()],
      declarations: [InlineEditComponent],
    }).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(InlineEditComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit the new value when the field is left', () => {
    component.value = 'old';
    let emitted: string;
    component.valueChange.subscribe((value) => (emitted = value));

    component.startEdit();
    component.editValue = 'new';
    component.save();

    expect(component.editing).toBeFalsy();
    expect(component.value).toBe('new');
    expect(emitted).toBe('new');
  });

  it('should not emit when the value did not change', () => {
    component.value = 'old';
    let emitted: string;
    component.valueChange.subscribe((value) => (emitted = value));

    component.startEdit();
    component.save();

    expect(component.editing).toBeFalsy();
    expect(component.value).toBe('old');
    expect(emitted).toBeUndefined();
  });

  it('should keep the original value on cancel', () => {
    component.value = 'old';
    let emitted: string;
    component.valueChange.subscribe((value) => (emitted = value));

    component.startEdit();
    component.editValue = 'new';
    component.cancel();

    // leaving the field afterwards must not store the discarded value anymore
    component.save();

    expect(component.editing).toBeFalsy();
    expect(component.value).toBe('old');
    expect(emitted).toBeUndefined();
  });
});
