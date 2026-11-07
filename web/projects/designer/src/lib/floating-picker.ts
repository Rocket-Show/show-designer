import { NgZone } from '@angular/core';

// how tall a picker is at least (two rows of tiles), how far it keeps from the button opening it and from the edges of
// the window, in CSS pixels
const PICKER_MIN_HEIGHT = 180;
const PICKER_GAP = 4;
const PICKER_MARGIN = 8;

// A picker opens over the panels (position: fixed), below the button opening it and as far down as the window shows
// it, scrolling inside. Where less than two rows are left below the button, but more above it, it opens above it.
export function placeFloatingPicker(picker: HTMLElement, toggle: HTMLElement) {
  if (!picker || !toggle) {
    return;
  }

  const anchor = toggle.getBoundingClientRect();
  const width = Math.min(picker.offsetWidth, window.innerWidth - 2 * PICKER_MARGIN);
  const below = Math.floor(window.innerHeight - anchor.bottom - PICKER_GAP - PICKER_MARGIN);
  const above = Math.floor(anchor.top - PICKER_GAP - PICKER_MARGIN);
  const upwards = below < PICKER_MIN_HEIGHT && above > below;

  picker.style.left = Math.max(PICKER_MARGIN, Math.min(anchor.left, window.innerWidth - width - PICKER_MARGIN)) + 'px';

  if (upwards) {
    picker.style.top = '';
    picker.style.bottom = window.innerHeight - anchor.top + PICKER_GAP + 'px';
  } else {
    picker.style.top = anchor.bottom + PICKER_GAP + 'px';
    picker.style.bottom = '';
  }

  picker.style.maxHeight = Math.max(upwards ? above : below, 0) + 'px';
}

// Places the picker again when a panel scrolls or the window changes its size, and closes it with a click anywhere but
// on the picker and on the button opening it (which closes it itself), and with Escape. Gives back what stops all that.
export function followFloatingPicker(
  ngZone: NgZone,
  getPicker: () => HTMLElement,
  getToggle: () => HTMLElement,
  place: () => void,
  close: () => void
): () => void {
  let remove: () => void = () => {};

  ngZone.runOutsideAngular(() => {
    const pointerDown = (event: Event) => {
      const target = event.target as Node;

      if (!getPicker()?.contains(target) && !getToggle()?.contains(target)) {
        ngZone.run(() => close());
      }
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        ngZone.run(() => close());
      }
    };

    // the scroll of any panel, which does not bubble up
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('keydown', keyDown);

    remove = () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('pointerdown', pointerDown, true);
      document.removeEventListener('keydown', keyDown);
    };
  });

  return remove;
}
