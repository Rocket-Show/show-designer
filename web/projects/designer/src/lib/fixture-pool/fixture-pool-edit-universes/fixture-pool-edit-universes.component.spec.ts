import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';

import { UniverseConfig } from '../../models/universe-config';
import { ConfigService } from '../../services/config.service';
import { SortablejsDirective } from '../../sortablejs/sortablejs.directive';
import { FixturePoolEditUniversesComponent } from './fixture-pool-edit-universes.component';

// The universes of a designer which brings no list of its own: the user names them, puts
// them in order and removes them, and the fixture pool takes the list on OK.
describe('FixturePoolEditUniversesComponent', () => {
  let fixture: ComponentFixture<FixturePoolEditUniversesComponent>;
  let component: FixturePoolEditUniversesComponent;
  let hide: jasmine.Spy;
  let closed: UniverseConfig[][];

  function open(hardwarePromo = false) {
    hide = jasmine.createSpy('hide');

    TestBed.configureTestingModule({
      declarations: [FixturePoolEditUniversesComponent, SortablejsDirective],
      imports: [FormsModule, TranslateModule.forRoot()],
      providers: [{ provide: BsModalRef, useValue: { hide } }],
    });

    TestBed.inject(ConfigService).hardwarePromo = hardwarePromo;

    fixture = TestBed.createComponent(FixturePoolEditUniversesComponent);
    component = fixture.componentInstance;
    // what the pool hands over
    component.universes = [
      { uuid: 'one', name: 'One' },
      { uuid: 'two', name: 'Two' },
    ];

    closed = [];
    component.onClose.subscribe((universes) => closed.push(universes));

    fixture.detectChanges();
  }

  function names(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.list-group-item span')).map((name: HTMLElement) => name.textContent.trim());
  }

  function nameInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input');
  }

  function addButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.input-group-append button');
  }

  async function type(name: string) {
    nameInput().value = name;
    nameInput().dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('lists the universes', () => {
    open();

    expect(names()).toEqual(['One', 'Two']);
    expect(fixture.nativeElement.querySelector('.hardware-promo-hint')).toBeNull();
  });

  it('adds a universe with the name typed in, without the spaces around it', async () => {
    open();

    expect(addButton().disabled).toBe(true);

    await type('  Front  ');

    expect(addButton().disabled).toBe(false);

    addButton().click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(names()).toEqual(['One', 'Two', 'Front']);
    expect(component.universes[2].uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(nameInput().value).toBe('');
    expect(addButton().disabled).toBe(true);
  });

  it('adds nothing without a name', async () => {
    open();

    await type('   ');

    expect(addButton().disabled).toBe(true);

    component.addUniverse();

    expect(component.universes.length).toBe(2);
  });

  it('adds the universe on enter, which does not confirm the pool behind it', async () => {
    open();
    const confirmed = jasmine.createSpy('confirmed');
    document.addEventListener('keydown', confirmed);

    await type('Back');

    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    nameInput().dispatchEvent(enter);
    fixture.detectChanges();

    document.removeEventListener('keydown', confirmed);

    expect(names()).toEqual(['One', 'Two', 'Back']);
    expect(enter.defaultPrevented).toBe(true);
    expect(confirmed).not.toHaveBeenCalled();
  });

  it('removes a universe with its button', () => {
    open();

    fixture.nativeElement.querySelectorAll('.list-group-item button')[0].click();
    fixture.detectChanges();

    expect(names()).toEqual(['Two']);

    // one which is not in the list anymore
    component.removeUniverse({ uuid: 'gone', name: 'Gone' });

    expect(names()).toEqual(['Two']);
  });

  it('puts the universes in the order they are dragged to', fakeAsync(() => {
    open();
    tick();

    const sortable = fixture.debugElement.query(By.directive(SortablejsDirective)).injector.get(SortablejsDirective) as any;
    const rows = fixture.nativeElement.querySelectorAll('.list-group-item');

    rows[0].parentElement.appendChild(rows[0]);
    sortable.sortableInstance.option('onUpdate')({ item: rows[0], oldIndex: 0, newIndex: 1 });
    fixture.detectChanges();

    expect(names()).toEqual(['Two', 'One']);
  }));

  it('hands over the universes on OK', () => {
    open();

    fixture.nativeElement.querySelector('.modal-footer button').click();

    expect(closed).toEqual([component.universes]);
    expect(hide).toHaveBeenCalled();
  });

  it('hands over nothing when it is cancelled or closed', () => {
    open();

    fixture.nativeElement.querySelector('.modal-footer a').click();
    fixture.nativeElement.querySelector('.modal-header button.close').click();

    expect(closed).toEqual([undefined, undefined]);
    expect(hide).toHaveBeenCalledTimes(2);
  });

  it('points to the hardware which plays the universes, in the online designer', () => {
    open(true);

    const hint = fixture.nativeElement.querySelector('.hardware-promo-hint');

    expect(hint).not.toBeNull();
    expect(hint.querySelector('a').getAttribute('href')).toContain('utm_content=universes');
  });
});
