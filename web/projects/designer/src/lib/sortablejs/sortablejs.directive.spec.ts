import { Component, NgZone } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import type { Options } from 'sortablejs';

import { SortablejsDirective } from './sortablejs.directive';

// Makes a list sortable by dragging its rows at their handle (the universes of the
// fixture pool): the rows are moved in the bound array, angular moves them on the page.
describe('SortablejsDirective', () => {
  @Component({
    template: `
      <div class="outer">
        <ul [sortablejs]="items" [sortablejsOptions]="options" [sortablejsContainer]="container" (sortablejsInit)="sortable = $event">
          @for (item of items; track item) {
          <li>{{ item }}</li>
          }
          <li class="no-sortjs">add</li>
        </ul>
      </div>
    `,
    standalone: false,
  })
  class HostComponent {
    items = ['a', 'b', 'c'];
    options: Options;
    container: string;
    sortable: any;
  }

  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SortablejsDirective, HostComponent],
    });

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  function rows(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('li')).map((row: HTMLElement) => row.textContent.trim());
  }

  function item(name: string): HTMLElement {
    return Array.from(fixture.nativeElement.querySelectorAll('li')).find(
      (row: HTMLElement) => row.textContent.trim() === name
    ) as HTMLElement;
  }

  function create() {
    fixture.detectChanges();
    tick();
  }

  // what sortable does while the row is dragged: it moves the row on the page itself
  function moveOnPage(name: string, before: string) {
    item(name).parentElement.insertBefore(item(name), item(before));
  }

  it('makes the list sortable at the handles of its rows, once it is on the page', fakeAsync(() => {
    host.options = { handle: '.other-handle', ghostClass: 'ghost', onMove: () => false };

    fixture.detectChanges();
    expect(host.sortable).toBeUndefined();

    tick();

    expect(host.sortable.el).toBe(fixture.nativeElement.querySelector('ul'));
    // the defaults of the designer win over the ones passed
    expect(host.sortable.option('handle')).toBe('.list-sort-handle');
    expect(host.sortable.option('draggable')).toBe('>*:not(.no-sortjs)');
    expect(host.sortable.option('animation')).toBe(150);
    // the others are taken, except for a check of the move, which the list does itself
    expect(host.sortable.option('ghostClass')).toBe('ghost');
    expect(host.sortable.option('onMove')).toBeUndefined();
  }));

  it('moves a dropped row in the list and leaves moving it on the page to angular', fakeAsync(() => {
    const updated: string[][] = [];
    host.options = { onUpdate: () => updated.push([...host.items]) };
    create();

    moveOnPage('a', 'add');
    host.sortable.option('onUpdate')({ item: item('a'), oldIndex: 0, newIndex: 2 });

    expect(host.items).toEqual(['b', 'c', 'a']);
    // put back where angular has it, until angular moves it
    expect(rows()).toEqual(['a', 'b', 'c', 'add']);
    // the host hears about it, once the list is in its new order
    expect(updated).toEqual([['b', 'c', 'a']]);

    fixture.detectChanges();

    expect(rows()).toEqual(['b', 'c', 'a', 'add']);

    // the last row to the top
    moveOnPage('a', 'b');
    host.sortable.option('onUpdate')({ item: item('a'), oldIndex: 2, newIndex: 0 });
    fixture.detectChanges();

    expect(host.items).toEqual(['a', 'b', 'c']);
    expect(rows()).toEqual(['a', 'b', 'c', 'add']);
  }));

  it('counts the rows which can be dragged, rather than all of them', fakeAsync(() => {
    create();

    moveOnPage('c', 'a');
    host.sortable.option('onUpdate')({ item: item('c'), oldIndex: 3, newIndex: 0, oldDraggableIndex: 2, newDraggableIndex: 0 });
    fixture.detectChanges();

    expect(host.items).toEqual(['c', 'a', 'b']);
    expect(rows()).toEqual(['c', 'a', 'b', 'add']);
  }));

  it('leaves the list alone for a move which goes nowhere or out of it', fakeAsync(() => {
    create();

    for (const move of [
      { oldIndex: 1, newIndex: 1 },
      { oldIndex: 0, newIndex: 3 },
      { oldIndex: 3, newIndex: 0 },
      { oldIndex: -1, newIndex: 0 },
      { oldIndex: 0, newIndex: -1 },
      { oldIndex: 0, newIndex: null },
      { oldIndex: undefined, newIndex: 1 },
    ]) {
      host.sortable.option('onUpdate')({ item: item('a'), ...move });
    }

    expect(host.items).toEqual(['a', 'b', 'c']);
  }));

  it('only puts the row back on the page, when there is no list to move it in', fakeAsync(() => {
    host.items = undefined;
    create();

    const row = document.createElement('li');
    row.textContent = 'x';
    fixture.nativeElement.querySelector('ul').appendChild(row);

    host.sortable.option('onUpdate')({ item: row, oldIndex: 0, newIndex: 0 });

    expect(rows()).toEqual(['x', 'add']);

    // without a row there is nothing to put back
    expect(() => host.sortable.option('onUpdate')({ oldIndex: 0, newIndex: 1 })).not.toThrow();
  }));

  it('lets the host know inside angular, when a drag ends', fakeAsync(() => {
    let insideAngular: boolean;
    host.options = { onEnd: () => (insideAngular = NgZone.isInAngularZone()) };
    create();

    TestBed.inject(NgZone).runOutsideAngular(() => host.sortable.option('onEnd')({ item: item('a'), oldIndex: 0, newIndex: 0 }));

    expect(insideAngular).toBe(true);
  }));

  it('ends a drag quietly, when the host does not listen', fakeAsync(() => {
    create();

    expect(() => host.sortable.option('onEnd')({ item: item('a'), oldIndex: 0, newIndex: 0 })).not.toThrow();
  }));

  it('makes an element inside it sortable, if asked to', fakeAsync(() => {
    TestBed.resetTestingModule();

    @Component({
      template: `<div [sortablejs]="items" sortablejsContainer=".inner" (sortablejsInit)="sortable = $event"><ul class="inner"></ul></div>`,
      standalone: false,
    })
    class ContainerHostComponent {
      items: string[] = [];
      sortable: any;
    }

    TestBed.configureTestingModule({ declarations: [SortablejsDirective, ContainerHostComponent] });

    const containerFixture = TestBed.createComponent(ContainerHostComponent);
    containerFixture.detectChanges();
    tick();

    expect(containerFixture.componentInstance.sortable.el).toBe(containerFixture.nativeElement.querySelector('.inner'));
  }));

  it('makes nothing sortable, when the element inside it is missing', fakeAsync(() => {
    host.container = '.missing';
    create();

    expect(host.sortable).toBeUndefined();
  }));

  it('cleans up after itself, also when it goes before it was set up', fakeAsync(() => {
    fixture.detectChanges();
    fixture.destroy();
    tick();

    expect(host.sortable).toBeUndefined();

    const other = TestBed.createComponent(HostComponent);
    other.detectChanges();
    tick();

    const destroy = spyOn(other.componentInstance.sortable, 'destroy').and.callThrough();
    other.destroy();

    expect(destroy).toHaveBeenCalled();
  }));
});
