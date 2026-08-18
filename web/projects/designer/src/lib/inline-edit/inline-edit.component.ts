import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'lib-app-inline-edit',
  templateUrl: './inline-edit.component.html',
  styleUrls: ['./inline-edit.component.scss'],
  standalone: false,
})
export class InlineEditComponent {
  // the current value to display and edit
  @Input()
  value: string;

  @Output()
  valueChange = new EventEmitter<string>();

  // placeholder shown while editing and when no value is set
  @Input()
  placeholder = '';

  // whether we are currently in edit mode
  editing = false;

  // the value being edited (only applied when the field is left)
  editValue: string;

  @ViewChild('editInput')
  editInput: ElementRef<HTMLInputElement>;

  // keep the input about as wide as its content, so entering the edit mode does not move things around
  get inputSize(): number {
    return Math.max((this.editValue || this.placeholder).length, 10);
  }

  startEdit() {
    if (this.editing) {
      return;
    }

    this.editValue = this.value;
    this.editing = true;

    // focus and select the input once it is rendered
    setTimeout(() => {
      if (this.editInput) {
        this.editInput.nativeElement.focus();
        this.editInput.nativeElement.select();
      }
    });
  }

  // store the value as soon as the field is left
  save() {
    if (!this.editing) {
      return;
    }

    this.editing = false;

    if (this.editValue === this.value) {
      return;
    }

    this.value = this.editValue;
    this.valueChange.emit(this.value);
  }

  // discard the changes, e.g. when escape has been pressed
  cancel() {
    this.editing = false;
  }
}
