import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TreeComponent, TreeNode } from './tree.component';

describe('TreeComponent', () => {
  let fixture: ComponentFixture<TreeComponent>;
  let element: HTMLElement;

  // the same two rows, as new objects: this is what a host hands over after it has
  // built its nodes again
  const nodes = (): TreeNode[] => [
    { id: 'first', name: 'First' },
    { id: 'second', name: 'Second' },
  ];

  const rows = (): HTMLElement[] => Array.from(element.querySelectorAll('.tree-node'));

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TreeComponent],
    });

    fixture = TestBed.createComponent(TreeComponent);
    element = fixture.nativeElement;

    fixture.componentRef.setInput('nodes', nodes());
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(fixture.componentInstance).toBeTruthy();
    expect(rows().length).toBe(2);
  });

  it('keeps the rows it has, when the nodes are built again', () => {
    const before = rows();

    fixture.componentRef.setInput('nodes', nodes());
    fixture.detectChanges();

    const after = rows();

    expect(after.length).toBe(2);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });

  it('keeps the selection on the rows, when the nodes are built again', () => {
    const selected = fixture.componentInstance.nodes[1];

    fixture.componentRef.setInput('selectedNodes', [selected]);
    fixture.detectChanges();

    expect(rows()[1].classList).toContain('selected');

    fixture.componentRef.setInput('nodes', nodes());
    fixture.detectChanges();

    expect(rows()[1].classList).toContain('selected');
  });

  it('replaces the rows of nodes which are gone', () => {
    fixture.componentRef.setInput('nodes', [{ id: 'third', name: 'Third' }]);
    fixture.detectChanges();

    expect(rows().length).toBe(1);
    expect(rows()[0].textContent.trim()).toBe('Third');
  });
});
