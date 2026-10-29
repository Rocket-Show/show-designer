import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

import { InlineEditComponent } from './inline-edit.component';

// A name shown as text, edited right where it is (the project name in the menu bar, the
// name of a track): the field stores what has been typed as soon as it is left.
describe('InlineEditComponent', () => {
  let component: InlineEditComponent;
  let fixture: ComponentFixture<InlineEditComponent>;
  let emitted: string[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormsModule, TranslateModule.forRoot()],
      declarations: [InlineEditComponent],
    });

    fixture = TestBed.createComponent(InlineEditComponent);
    component = fixture.componentInstance;
    emitted = [];
    component.valueChange.subscribe((value) => emitted.push(value));
    fixture.detectChanges();
  });

  function shown(): HTMLElement {
    return fixture.nativeElement.querySelector('.inline-edit-value');
  }

  function input(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input.inline-edit-input');
  }

  // the field, after the value has been clicked
  function edit(value: string): HTMLInputElement {
    component.value = value;
    fixture.detectChanges();
    shown().click();
    fixture.detectChanges();
    return input();
  }

  function type(field: HTMLInputElement, value: string) {
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('shows the value, or the placeholder while there is none', () => {
    component.placeholder = 'Project name';
    fixture.detectChanges();

    expect(shown().textContent).toBe('Project name');
    expect(shown().classList).toContain('inline-edit-placeholder');

    component.value = 'My show';
    fixture.detectChanges();

    expect(shown().textContent).toBe('My show');
    expect(shown().classList).not.toContain('inline-edit-placeholder');
  });

  it('starts editing on a click, with the whole value selected', fakeAsync(() => {
    const field = edit('My show');
    tick();

    expect(component.editing).toBe(true);
    expect(shown()).toBeNull();
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe('My show'.length);
  }));

  it('starts editing with the enter key', () => {
    component.value = 'My show';
    fixture.detectChanges();

    shown().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(component.editing).toBe(true);
  });

  // the name of a track is clicked to select the track and dragged to move it
  it('only starts editing on a double click, where a click means something else', () => {
    component.value = 'name';
    component.editOn = 'dblclick';
    fixture.detectChanges();

    shown().click();

    expect(component.editing).toBe(false);

    shown().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(component.editing).toBe(true);
  });

  it('keeps the field about as wide as its content', () => {
    const field = edit('A show with a long name');

    expect(field.size).toBe('A show with a long name'.length);

    type(field, 'Show');

    expect(field.size).toBe(10);

    component.placeholder = 'The name of the project';
    type(field, '');

    expect(field.size).toBe('The name of the project'.length);
  });

  it('stores the new value when the field is left', () => {
    const field = edit('old');

    type(field, 'new');
    field.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(component.editing).toBe(false);
    expect(shown().textContent).toBe('new');
    expect(emitted).toEqual(['new']);
  });

  it('stores the new value with the enter key', () => {
    const field = edit('old');

    type(field, 'new');
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(component.value).toBe('new');
    expect(emitted).toEqual(['new']);
  });

  it("doesn't report a value which didn't change", () => {
    const field = edit('old');

    field.dispatchEvent(new Event('blur'));

    expect(component.editing).toBe(false);
    expect(emitted).toEqual([]);
  });

  it('keeps the original value on escape', () => {
    const field = edit('old');

    type(field, 'new');
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    // leaving the field afterwards must not store the discarded value anymore
    component.save();
    fixture.detectChanges();

    expect(component.editing).toBe(false);
    expect(shown().textContent).toBe('old');
    expect(emitted).toEqual([]);
  });

  it('keeps what is being typed when editing is started again', () => {
    const field = edit('old');
    type(field, 'new');

    component.startEdit();

    expect(component.editValue).toBe('new');
  });
});
