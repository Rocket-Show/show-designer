import { Injectable } from '@angular/core';
import { CachedFixturePixel } from '../models/cached-fixture-pixel';
import { FixtureMatrix } from '../models/fixture-matrix';
import { FixtureMatrixPixelGroup } from '../models/fixture-matrix-pixel-group';
import { FixtureMatrixPixelGroupConstraints } from '../models/fixture-matrix-pixel-group-constraints';

@Injectable({
  providedIn: 'root',
})
export class FixturePixelGroupResolveService {
  // pixel keys like the fixture library sorts them: numbers by their value (2 before 10), the
  // rest alphabetically
  static compareKeys(key1: string, key2: string): number {
    let index1 = 0;
    let index2 = 0;
    const isDigit = (character: string) => character >= '0' && character <= '9';

    while (index1 < key1.length && index2 < key2.length) {
      const char1 = key1.charAt(index1);
      const char2 = key2.charAt(index2);

      if (isDigit(char1) && isDigit(char2)) {
        const start1 = index1;
        const start2 = index2;
        while (index1 < key1.length && isDigit(key1.charAt(index1))) index1++;
        while (index2 < key2.length && isDigit(key2.charAt(index2))) index2++;

        // compare the numbers as long as they are, without their leading zeros
        const number1 = key1.substring(start1, index1).replace(/^0+/, '');
        const number2 = key2.substring(start2, index2).replace(/^0+/, '');
        if (number1.length !== number2.length) return number1.length - number2.length;
        if (number1 !== number2) return number1 < number2 ? -1 : 1;
      } else {
        const lower1 = char1.toLowerCase();
        const lower2 = char2.toLowerCase();
        if (lower1 !== lower2) return lower1 < lower2 ? -1 : 1;
        index1++;
        index2++;
      }
    }

    return key1.length - index1 - (key2.length - index2);
  }

  private static sortedByKey(pixels: CachedFixturePixel[]): CachedFixturePixel[] {
    return pixels.slice().sort((pixel1, pixel2) => FixturePixelGroupResolveService.compareKeys(pixel1.key, pixel2.key));
  }

  private matchNumberRule(value: number, ruleRaw: string): boolean {
    const rule = ruleRaw.trim().toLowerCase();

    // comparisons: <=5, >=5, =5
    const m = rule.match(/^(<=|>=|=)\s*(-?\d+)$/);
    if (m) {
      const op = m[1];
      const n = Number(m[2]);
      if (op === '<=') return value <= n;
      if (op === '>=') return value >= n;
      return value === n;
    }

    // even / odd
    if (rule === 'even') return value % 2 === 0;
    if (rule === 'odd') return Math.abs(value % 2) === 1;

    // 3n, 3n+1, 3n+2, etc.
    const mn = rule.match(/^(\d+)n(?:\+(\d+))?$/);
    if (mn) {
      const base = Number(mn[1]); // e.g. 3
      const rem = Number(mn[2] ?? '0'); // e.g. 1
      // handle negative values reasonably too
      const mod = ((value % base) + base) % base;
      return mod === ((rem % base) + base) % base;
    }

    // a plain number means "=number"
    if (/^-?\d+$/.test(rule)) return value === Number(rule);

    throw new Error(`Unknown numeric rule: "${ruleRaw}"`);
  }

  private matchesAllConstraints(p: CachedFixturePixel, constraints: FixtureMatrixPixelGroupConstraints): boolean {
    // AND across present fields
    if (constraints.x && !constraints.x.every((rule) => this.matchNumberRule(p.x, rule))) return false;
    if (constraints.y && !constraints.y.every((rule) => this.matchNumberRule(p.y, rule))) return false;
    if (constraints.z && !constraints.z.every((rule) => this.matchNumberRule(p.z, rule))) return false;

    // each entry is a regex, all of them have to match
    if (constraints.name && !constraints.name.every((pattern) => new RegExp(pattern).test(p.key))) return false;

    return true;
  }

  // the pixels of a group in the order of the fixture library: the listed keys as listed, all
  // pixels and pixels constrained by their name alphanumerically, the others by their position
  // (X changes fastest). The passed pixels come in this order already.
  public resolveGroupPixels(group: FixtureMatrixPixelGroup, allPixels: CachedFixturePixel[]): CachedFixturePixel[] {
    if (!group || !allPixels) return [];

    // 1) all
    if (group.isAll) return FixturePixelGroupResolveService.sortedByKey(allPixels);

    const constraints = group.constraints;
    if (!constraints) return [];

    // 2) explicit keys
    if (constraints.keys && constraints.keys.length > 0) {
      const result: CachedFixturePixel[] = [];
      for (const key of constraints.keys) {
        const pixel = allPixels.find((p) => p.key === key);
        if (pixel) result.push(pixel);
      }
      return result;
    }

    // 3) constraints by x/y/z/name
    const candidates = constraints.name && constraints.name.length > 0 ? FixturePixelGroupResolveService.sortedByKey(allPixels) : allPixels;
    return candidates.filter((p) => this.matchesAllConstraints(p, constraints));
  }

  public getPixelsForKeyOrGroup(matrix: FixtureMatrix, allPixels: CachedFixturePixel[], keyOrGroup: string): CachedFixturePixel[] {
    if (!matrix || !allPixels) return [];

    // search for a key first
    const pixel = allPixels.find((p) => p.key === keyOrGroup);
    if (pixel) return [pixel];

    // search for a group
    if (matrix.pixelGroups && Object.prototype.hasOwnProperty.call(matrix.pixelGroups, keyOrGroup)) {
      return this.resolveGroupPixels(matrix.pixelGroups[keyOrGroup], allPixels);
    }

    return [];
  }
}
