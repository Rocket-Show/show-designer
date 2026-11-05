import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { ColorService } from '../services/color.service';
import { colorAt, GradientEditorComponent, GradientStop, gradientCss } from './gradient-editor.component';

describe('GradientEditorComponent', () => {
  let fixture: ComponentFixture<GradientEditorComponent>;
  let editor: GradientEditorComponent;
  let changes: GradientStop[][];

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [GradientEditorComponent, ColorPickerComponent],
      imports: [FormsModule, TranslateModule.forRoot()],
      providers: [{ provide: ColorService, useValue: { pickerColors: ['#ff0000', '#00ff00'] } }],
    });
    changes = [];
  });

  afterEach(() => fixture?.nativeElement.remove());

  // the editor as wide as 208 pixels (its bar 200), with the stops a parent hands back to it
  async function open(stops: GradientStop[], inputs: { [name: string]: any } = {}) {
    fixture = TestBed.createComponent(GradientEditorComponent);
    editor = fixture.componentInstance;
    fixture.nativeElement.style.width = '216px';
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('stops', stops);

    for (const name of Object.keys(inputs)) {
      fixture.componentRef.setInput(name, inputs[name]);
    }

    editor.stopsChange.subscribe((changed) => {
      changes.push(changed);
      fixture.componentRef.setInput('stops', changed);
    });
    await update();
  }

  async function update() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const element = (): HTMLElement => fixture.nativeElement;
  const handles = (): HTMLButtonElement[] => Array.from(element().querySelectorAll('.gradient-stop'));
  const track = (): HTMLElement => element().querySelector('.gradient-track');
  const bar = (): HTMLElement => element().querySelector('.gradient-bar');
  const last = (): any[][] => changes[changes.length - 1].map((stop) => [stop.position, stop.color]);

  // a pointer event at a place along the bar (0 to 1), the passed pixels below the track
  function pointer(target: HTMLElement, type: string, place: number, below = -10) {
    const bounds = track().getBoundingClientRect();

    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        clientX: bounds.left + bounds.width * place,
        clientY: bounds.bottom + below,
      })
    );
    fixture.detectChanges();
  }

  function key(target: HTMLElement, name: string, shiftKey = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  const threeColors = (): GradientStop[] => [
    { position: 0, color: '#ff0000' },
    { position: 0.5, color: '#00ff00' },
    { position: 1, color: '#0000ff' },
  ];

  it('shows the gradient and each color as a stop at its place, the first one set up below it', async () => {
    await open(threeColors());

    expect(handles().map((handle) => handle.style.left)).toEqual(['0%', '50%', '100%']);
    expect(handles()[0].classList).toContain('selected');
    expect(handles()[1].getAttribute('aria-label')).toBe('designer.gradient.stop');
    expect(bar().style.background).toContain('linear-gradient');
    expect((element().querySelector('input[name="gradientColor"]') as HTMLInputElement).value).toBe('#ff0000');
    expect((element().querySelector('input[name="gradientPosition"]') as HTMLInputElement).value).toBe('0');

    // what the bar shows can come from the outside, e.g. a gradient in steps
    fixture.componentRef.setInput('background', 'rgb(1, 2, 3)');
    fixture.detectChanges();

    expect(bar().style.background).toBe('rgb(1, 2, 3)');
  });

  it('moves a color along the bar while its stop is dragged, in hundredths, the stops in their order', async () => {
    await open(threeColors());

    pointer(handles()[1], 'pointerdown', 0.5);
    pointer(handles()[1], 'pointermove', 0.731);
    pointer(handles()[1], 'pointermove', 0.8);

    expect(last()).toEqual([
      [0, '#ff0000'],
      [0.8, '#00ff00'],
      [1, '#0000ff'],
    ]);
    expect(handles()[1].classList).toContain('selected');
    await update();
    expect((element().querySelector('input[name="gradientPosition"]') as HTMLInputElement).value).toBe('80');

    // past the other ones and beyond the end: still the second stop, at the end
    pointer(handles()[1], 'pointermove', 1.4);
    pointer(handles()[1], 'pointerup', 1.4);

    expect(last()[1]).toEqual([1, '#00ff00']);

    // the mouse moving without a stop held moves nothing
    const count = changes.length;
    pointer(track(), 'pointermove', 0.2);

    expect(changes.length).toBe(count);
  });

  it('takes a color away once its stop is dragged down off the bar and let go, but keeps two of them', async () => {
    await open(threeColors());

    pointer(handles()[2], 'pointerdown', 1);
    pointer(handles()[2], 'pointermove', 1, 40);

    expect(handles()[2].classList).toContain('leaving');

    // back on the bar, it stays
    pointer(handles()[2], 'pointermove', 1, -5);

    expect(handles()[2].classList).not.toContain('leaving');

    pointer(handles()[2], 'pointermove', 0.9, 40);
    pointer(handles()[2], 'pointerup', 0.9, 40);

    expect(last()).toEqual([
      [0, '#ff0000'],
      [0.5, '#00ff00'],
    ]);
    expect(editor.selected).toBe(1);

    // two are left, which stay
    pointer(handles()[1], 'pointerdown', 0.5);
    pointer(handles()[1], 'pointermove', 0.5, 40);
    pointer(handles()[1], 'pointercancel', 0.5, 40);

    expect(handles().length).toBe(2);
    expect(element().querySelector('.gradient-remove').classList).toContain('disabled');
  });

  it('adds a color where the bar is clicked, mixed from its neighbours, and drags it on', async () => {
    await open(threeColors());

    pointer(bar(), 'pointerdown', 0.25);

    expect(last()).toEqual([
      [0, '#ff0000'],
      [0.5, '#00ff00'],
      [1, '#0000ff'],
      [0.25, '#808000'],
    ]);
    expect(editor.selected).toBe(3);

    pointer(bar(), 'pointermove', 0.3);
    pointer(bar(), 'pointerup', 0.3);

    expect(last()[3]).toEqual([0.3, '#808000']);

    // also between the stops, but no more than the most there can be
    fixture.componentRef.setInput('maxStops', 5);
    pointer(track(), 'pointerdown', 0.9);
    pointer(track(), 'pointerup', 0.9);
    pointer(track(), 'pointerdown', 0.1);

    expect(handles().length).toBe(5);
  });

  it('moves a stop with the arrow keys, to the ends, takes it away with delete and picks its color with enter', async () => {
    await open(threeColors());
    const second = () => handles()[1];

    expect(key(second(), 'ArrowRight').defaultPrevented).toBe(true);
    expect(last()[1][0]).toBe(0.51);
    key(second(), 'ArrowLeft', true);
    expect(last()[1][0]).toBe(0.41);
    key(second(), 'ArrowUp');
    key(second(), 'ArrowDown');
    expect(last()[1][0]).toBe(0.41);
    key(second(), 'End');
    expect(last()[1][0]).toBe(1);
    key(second(), 'Home');
    expect(last()[1][0]).toBe(0);
    expect(key(second(), 'a').defaultPrevented).toBe(false);

    key(second(), 'Enter');
    await update();

    expect(editor.selected).toBe(1);
    expect(element().querySelector('lib-app-color-picker')).not.toBeNull();

    key(second(), 'Delete');
    expect(last().map((stop) => stop[1])).toEqual(['#ff0000', '#0000ff']);
    key(second(), 'Backspace');
    expect(handles().length).toBe(2);
  });

  it('sets up the color picked last: its place in percent, its color in the color picker, or takes it away', async () => {
    await open(threeColors());

    // picked with a click on its stop
    pointer(handles()[2], 'pointerdown', 1);
    pointer(handles()[2], 'pointerup', 1);
    await update();
    const position = element().querySelector('input[name="gradientPosition"]') as HTMLInputElement;

    expect(position.value).toBe('100');

    position.value = '62,5';
    position.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(last()[2][0]).toBe(0.63);

    // something which is no number is not taken, and goes once the field is left
    position.value = 'x';
    position.dispatchEvent(new Event('input'));
    position.dispatchEvent(new Event('blur'));
    await update();

    expect(position.value).toBe('63');

    // the color picker opens with the swatch and the hex value, with the quick colors of the designer
    (element().querySelector('.gradient-swatch') as HTMLElement).click();
    await update();
    const picker: ColorPickerComponent = fixture.debugElement.query(By.directive(ColorPickerComponent)).componentInstance;

    expect(picker.palette).toEqual(['#ff0000', '#00ff00']);
    expect(picker.color).toBe('#0000ff');
    expect(element().querySelector('lib-app-color-picker .form-check')).toBeNull();
    expect(element().querySelector('lib-app-color-picker input')).toBeNull();

    picker.pick('#FFAA00');
    await update();

    expect(last()[2]).toEqual([0.63, '#ffaa00']);

    // the same color again, or something else than a color, changes nothing
    const count = changes.length;
    editor.setColor('#ffaa00');
    editor.setColor('orange');

    expect(changes.length).toBe(count);

    // or typed as its hex value, once it is a complete one
    const hex = element().querySelector('input[name="gradientColor"]') as HTMLInputElement;
    await update();

    expect(hex.value).toBe('#ffaa00');

    for (const typed of ['#1', 'zzzzzz', '1a2']) {
      hex.value = typed;
      hex.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    expect(last()[2]).toEqual([0.63, '#11aa22']);

    hex.value = '#3';
    hex.dispatchEvent(new Event('input'));
    hex.dispatchEvent(new Event('blur'));
    await update();

    expect(hex.value).toBe('#11aa22');

    (element().querySelector('.gradient-swatch') as HTMLElement).click();
    await update();

    expect(element().querySelector('lib-app-color-picker')).toBeNull();

    (element().querySelector('.gradient-remove') as HTMLElement).click();
    await update();

    expect(last().length).toBe(2);
    expect(editor.selected).toBe(1);
  });

  it('keeps the selection on a stop which is still there, with colors of its own when no service offers them', async () => {
    await open(threeColors(), { swatches: ['#123456'] });
    editor.select(2);

    fixture.componentRef.setInput('stops', threeColors().slice(0, 2));
    fixture.detectChanges();

    expect(editor.selected).toBe(1);
    expect(editor.pickerSwatches).toEqual(['#123456']);

    // the one before it taken away: it stays on the same color
    fixture.componentRef.setInput('minStops', 1);
    editor.remove(0);

    expect(editor.selected).toBe(0);
    expect(editor.selectedStop.color).toBe('#00ff00');
    expect(new GradientEditorComponent().pickerSwatches).toEqual([]);
  });

  it('works out the gradient and the color at a place like the palettes do', () => {
    expect(gradientCss([])).toBe('transparent');
    expect(gradientCss([{ position: 0.3, color: '#102030' }])).toBe('#102030');
    expect(
      gradientCss([
        { position: 1, color: '#ffffff' },
        { position: 0.25, color: '#000000' },
      ])
    ).toBe('linear-gradient(90deg, #000000 25%, #ffffff 100%)');

    expect(colorAt([], 0.5)).toBe('#ffffff');
    expect(colorAt(threeColors(), -1)).toBe('#ff0000');
    expect(colorAt(threeColors(), 2)).toBe('#0000ff');
    expect(colorAt(threeColors(), 0.75)).toBe('#008080');
    expect(
      colorAt(
        [
          { position: 0.5, color: 'red' },
          { position: 0.5, color: '#00ff00' },
        ],
        0.5
      )
    ).toBe('red');
    expect(
      colorAt(
        [
          { position: 0, color: 'nonsense' },
          { position: 0.5, color: '#000000' },
          { position: 0.5, color: '#00ff00' },
        ],
        0.25
      )
    ).toBe('#808080');
  });
});
