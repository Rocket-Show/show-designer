import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

import { ColorPickerComponent } from './color-picker.component';

// The color picker marks a scene or a preset with a color: one picked on the wheel, from the
// palette or typed in, or the one the item derives itself while it's left automatic.
describe('ColorPickerComponent', () => {
  let fixture: ComponentFixture<ColorPickerComponent>;
  let component: ColorPickerComponent;
  let colors: string[];
  let autos: boolean[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ColorPickerComponent],
      imports: [FormsModule, TranslateModule.forRoot()],
    });

    fixture = TestBed.createComponent(ColorPickerComponent);
    component = fixture.componentInstance;
    colors = [];
    autos = [];
    component.colorChange.subscribe((color) => colors.push(color));
    component.autoChange.subscribe((auto) => autos.push(auto));
  });

  function show(inputs: { color?: string; auto?: boolean; autoColor?: string; palette?: string[] }) {
    fixture.componentRef.setInput('autoLabel', 'designer.scene.settings-color-auto');
    for (const name of Object.keys(inputs)) {
      fixture.componentRef.setInput(name, (inputs as any)[name]);
    }
    fixture.detectChanges();
  }

  function hexInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input.sd-value-input-hex');
  }

  function autoCheckbox(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input[type=checkbox]');
  }

  function swatches(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button.color-picker-swatch'));
  }

  // the color the wheel is turned to
  function wheel(): string {
    return (component as any).picker.color.hexString;
  }

  async function render() {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function type(value: string) {
    hexInput().value = value;
    hexInput().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  // the user turns the wheel by clicking into it, away from its middle
  function turnWheel() {
    const svg: SVGElement = (component as any).picker.svg.el;
    const rect = svg.getBoundingClientRect();
    svg.dispatchEvent(new MouseEvent('mousedown', { clientX: rect.left + 100, clientY: rect.top + 60, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    fixture.detectChanges();
  }

  it('shows the color the item derives while it is automatic', async () => {
    show({ color: '#123456', auto: true, autoColor: '#ff0000' });
    await render();

    expect(hexInput().value).toBe('#ff0000');
    expect(wheel()).toBe('#ff0000');
    expect(autoCheckbox().checked).toBe(true);
    expect(fixture.nativeElement.querySelector('label').textContent).toBe('designer.scene.settings-color-auto');
  });

  it('shows the color picked by hand otherwise', async () => {
    show({ color: '#123456', auto: false, autoColor: '#ff0000' });
    await render();

    expect(hexInput().value).toBe('#123456');
    expect(wheel()).toBe('#123456');
    expect(autoCheckbox().checked).toBe(false);
  });

  it('shows the picked color, where the item derives none', async () => {
    show({ color: '#123456', auto: true });
    await render();

    expect(hexInput().value).toBe('#123456');
  });

  it('shows white on the wheel, while there is no color at all', async () => {
    show({ auto: true });
    await render();

    expect(wheel()).toBe('#ffffff');
    expect(hexInput().value).toBe('');
  });

  it('follows the color handed in later', async () => {
    show({ color: '#123456', auto: false });
    await render();

    show({ color: '#abcdef' });
    await render();

    expect(hexInput().value).toBe('#abcdef');
    expect(wheel()).toBe('#abcdef');
    // the wheel is told the new color, which isn't one the user picked
    expect(colors).toEqual([]);
  });

  it('picks a color of the palette, which takes the automatic away', async () => {
    show({ auto: true, autoColor: '#ff0000', palette: ['#ff0000', '#00ff00', '#0000ff'] });
    await render();

    expect(swatches().map((swatch) => swatch.classList.contains('picked'))).toEqual([true, false, false]);
    expect(swatches()[1].style.backgroundColor).toBe('rgb(0, 255, 0)');

    swatches()[1].click();
    await render();

    expect(colors).toEqual(['#00ff00']);
    expect(autos).toEqual([false]);
    expect(swatches().map((swatch) => swatch.classList.contains('picked'))).toEqual([false, true, false]);
    expect(wheel()).toBe('#00ff00');
    expect(autoCheckbox().checked).toBe(false);
  });

  it('picks a hex value once it is complete, with or without its hash', async () => {
    show({ color: '#123456', auto: false });
    await render();

    type('#ab');
    type('#abc');
    type('ABCDEF');
    type('#00FF00');

    expect(colors).toEqual(['#aabbcc', '#abcdef', '#00ff00']);
    expect(wheel()).toBe('#00ff00');
  });

  it('discards an incomplete hex value when the field is left', async () => {
    show({ color: '#123456', auto: false });
    await render();

    type('#12');
    hexInput().dispatchEvent(new Event('blur'));
    await render();

    expect(hexInput().value).toBe('#123456');
    expect(colors).toEqual([]);
  });

  it('starts from the derived color when the automatic is switched off', async () => {
    show({ auto: true, autoColor: '#ff0000' });
    await render();

    autoCheckbox().click();
    await render();

    expect(colors).toEqual(['#ff0000']);
    expect(autos).toEqual([false]);
    expect(hexInput().value).toBe('#ff0000');
  });

  it('starts from white when the automatic is switched off without any color', async () => {
    show({ auto: true });
    await render();

    autoCheckbox().click();
    await render();

    expect(colors).toEqual(['#ffffff']);
    expect(hexInput().value).toBe('#ffffff');
  });

  it('keeps the color picked before when the automatic is switched off', async () => {
    show({ color: '#123456', auto: true, autoColor: '#ff0000' });
    await render();

    autoCheckbox().click();
    await render();

    expect(colors).toEqual([]);
    expect(autos).toEqual([false]);
    expect(hexInput().value).toBe('#123456');
  });

  it('shows the derived color again when the automatic is switched on', async () => {
    show({ color: '#123456', auto: false, autoColor: '#ff0000' });
    await render();

    autoCheckbox().click();
    await render();

    expect(autos).toEqual([true]);
    expect(hexInput().value).toBe('#ff0000');
    expect(wheel()).toBe('#ff0000');

    component.setAuto(true);

    expect(autos).toEqual([true]);
  });

  it('picks the color the user turns the wheel to', async () => {
    show({ color: '#123456', auto: true, autoColor: '#ff0000' });
    await render();

    turnWheel();
    await render();

    expect(colors.length).toBe(1);
    expect(colors[0]).toBe(wheel());
    expect(colors[0]).not.toBe('#ff0000');
    expect(autos).toEqual([false]);
    expect(hexInput().value).toBe(wheel());
  });

  it('takes nothing from the wheel before the user turned it', async () => {
    show({ color: '#123456', auto: false });
    await render();

    (component as any).picker.color.hexString = '#654321';

    expect(colors).toEqual([]);
  });

  it('takes its stylesheet away with it', async () => {
    show({ auto: true });
    await render();
    const style: HTMLStyleElement = (component as any).picker.stylesheet.style;

    expect(document.head.contains(style)).toBe(true);

    fixture.destroy();

    expect(document.head.contains(style)).toBe(false);
  });

  it('ties each automatic switch to its own label', () => {
    show({ auto: true });
    const other = TestBed.createComponent(ColorPickerComponent);
    other.detectChanges();

    const label: HTMLLabelElement = fixture.nativeElement.querySelector('label');
    expect(label.htmlFor).toBe(autoCheckbox().id);
    expect(other.nativeElement.querySelector('input[type=checkbox]').id).not.toBe(autoCheckbox().id);
  });
});
