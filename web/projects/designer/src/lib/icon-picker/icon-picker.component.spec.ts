import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { IconPickerComponent } from './icon-picker.component';

// The icon picker marks a scene or a preset with an icon for the trees, or leaves it with
// the default icon of its kind.
describe('IconPickerComponent', () => {
  let fixture: ComponentFixture<IconPickerComponent>;
  let picked: string[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [IconPickerComponent],
      imports: [TranslateModule.forRoot()],
    });

    fixture = TestBed.createComponent(IconPickerComponent);
    picked = [];
    fixture.componentInstance.iconChange.subscribe((icon) => picked.push(icon));
  });

  function show(icon: string, defaultIcon = 'fa-picture-o', color = '#ff0000') {
    fixture.componentRef.setInput('icon', icon);
    fixture.componentRef.setInput('defaultIcon', defaultIcon);
    fixture.componentRef.setInput('color', color);
    fixture.detectChanges();
  }

  function items(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button.icon-picker-item'));
  }

  // the icon shown on each of the items
  function icons(): string[] {
    return items().map((item) =>
      Array.from(item.querySelector('i').classList)
        .filter((name) => name.startsWith('fa-') && name !== 'fa-fw')
        .join(' ')
    );
  }

  function pickedItems(): string[] {
    return items()
      .map((item, index) => (item.classList.contains('picked') ? icons()[index] : undefined))
      .filter((icon) => icon);
  }

  it('offers the default icon first, picked as long as no other one is', () => {
    show(undefined);

    expect(icons()[0]).toBe('fa-picture-o');
    expect(items()[0].title).toBe('designer.misc.icon-default');
    expect(pickedItems()).toEqual(['fa-picture-o']);
  });

  it('offers the default icon only once', () => {
    show(undefined, 'fa-lightbulb-o');

    expect(icons()[0]).toBe('fa-lightbulb-o');
    expect(icons().filter((icon) => icon === 'fa-lightbulb-o').length).toBe(1);
    expect(new Set(icons()).size).toBe(icons().length);
  });

  it('shows the icons in the color of the item', () => {
    show(undefined, 'fa-picture-o', '#00ff00');

    expect(items().every((item) => item.querySelector('i').style.color === 'rgb(0, 255, 0)')).toBe(true);
  });

  it('marks the item with the icon picked', () => {
    show(undefined);

    items()[icons().indexOf('fa-rocket')].click();
    fixture.detectChanges();

    expect(picked).toEqual(['fa-rocket']);
    expect(pickedItems()).toEqual(['fa-rocket']);
  });

  it('puts the item back to its default icon', () => {
    show('fa-rocket');

    items()[0].click();

    expect(picked).toEqual([undefined]);
  });

  it('counts the default icon picked by hand as the default one', () => {
    show('fa-picture-o', 'fa-picture-o');

    expect(pickedItems()).toEqual(['fa-picture-o']);
  });

  it("doesn't report the icon which is picked already", () => {
    show('fa-rocket');

    items()[icons().indexOf('fa-rocket')].click();

    expect(picked).toEqual([]);
  });
});
