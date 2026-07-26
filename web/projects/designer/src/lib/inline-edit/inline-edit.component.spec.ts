import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { PopoverModule } from 'ngx-bootstrap/popover';

import { InlineEditComponent } from './inline-edit.component';

describe('InlineEditComponent', () => {
  let component: InlineEditComponent;
  let fixture: ComponentFixture<InlineEditComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [FormsModule, TranslateModule.forRoot(), PopoverModule.forRoot()],
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

  it('should emit the new value on accept', () => {
    component.value = 'old';
    let emitted: string;
    component.valueChange.subscribe((value) => (emitted = value));

    component.startEdit();
    component.editValue = 'new';
    component.accept();

    expect(component.editing).toBeFalse();
    expect(component.value).toBe('new');
    expect(emitted).toBe('new');
  });

  it('should keep the original value on cancel', () => {
    component.value = 'old';
    let emitted: string;
    component.valueChange.subscribe((value) => (emitted = value));

    component.startEdit();
    component.editValue = 'new';
    component.cancel();

    expect(component.editing).toBeFalse();
    expect(component.value).toBe('old');
    expect(emitted).toBeUndefined();
  });
});
