import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Picks the icon an item (a scene, a preset) is shown with in the trees, from a small
 * set of font awesome glyphs which say something about lighting: what a look is, what
 * it does and where in the show it belongs.
 *
 * The icon can also be left alone, which is what the first entry is for: the item then
 * keeps the default icon of its kind.
 */
@Component({
  selector: 'lib-app-icon-picker',
  templateUrl: './icon-picker.component.html',
  styleUrls: ['./icon-picker.component.css'],
  standalone: false,
})
export class IconPickerComponent {
  // the picked icon (undefined = the default one of the item's kind)
  @Input() icon: string;

  @Output() iconChange = new EventEmitter<string>();

  // what the item falls back to while no icon is picked
  @Input() defaultIcon: string;

  // the color the item is marked with, so the icons are shown the way the tree shows them
  @Input() color: string;

  // font awesome classes, grouped the way they are offered: the looks first, then what
  // a preset does to the fixtures, then where in the show it belongs
  readonly icons: string[] = [
    'fa-lightbulb-o',
    'fa-sun-o',
    'fa-moon-o',
    'fa-star',
    'fa-bolt',
    'fa-fire',
    'fa-snowflake-o',
    'fa-tint',

    'fa-paint-brush',
    'fa-magic',
    'fa-adjust',
    'fa-circle',
    'fa-circle-o',
    'fa-square',
    'fa-diamond',
    'fa-bullseye',

    'fa-crosshairs',
    'fa-arrows',
    'fa-arrows-alt',
    'fa-refresh',
    'fa-random',
    'fa-repeat',
    'fa-long-arrow-right',
    'fa-location-arrow',

    'fa-music',
    'fa-microphone',
    'fa-headphones',
    'fa-play',
    'fa-pause',
    'fa-stop',
    'fa-film',
    'fa-video-camera',

    'fa-picture-o',
    'fa-flag',
    'fa-heart',
    'fa-bell',
    'fa-users',
    'fa-rocket',
    'fa-clock-o',
    'fa-eye',
  ];

  pick(icon: string) {
    if (icon === this.icon) {
      return;
    }

    this.icon = icon;
    this.iconChange.emit(icon);
  }
}
