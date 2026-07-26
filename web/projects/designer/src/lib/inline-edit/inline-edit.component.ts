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

  // the value being edited (only applied on accept)
  editValue: string;

  @ViewChild('editInput')
  editInput: ElementRef<HTMLInputElement>;

  startEdit() {
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

  accept() {
    if (!this.editing) {
      return;
    }

    this.value = this.editValue;
    this.editing = false;
    this.valueChange.emit(this.value);
  }

  cancel() {
    this.editing = false;
  }
}
