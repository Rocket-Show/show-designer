import { Injectable } from '@angular/core';
import { CachedFixturePixel } from '../models/cached-fixture-pixel';
import { FixtureProfile } from '../models/fixture-profile';

type Axis = 'x' | 'y' | 'z';

type GroupDef = 'all' | string[] | (Partial<Record<Axis, string[]>> & { name?: string[] });

  providedIn: 'root',
})
export class FixturePixelGroupResolveService {
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

    // If you want, you can treat a plain number as "=number"
    const asNum = Number(rule);
    if (!Number.isNaN(asNum)) return value === asNum;

    throw new Error(`Unknown numeric rule: "${ruleRaw}"`);
  }

  private matchesAllConstraints(p: CachedFixturePixel, def: Partial<Record<Axis, string[]>> & { name?: string[] }): boolean {
    // AND across present fields
    if (def.x && !def.x.every((rule) => this.matchNumberRule(p.x, rule))) return false;
    if (def.y && !def.y.every((rule) => this.matchNumberRule(p.y, rule))) return false;
    if (def.z && !def.z.every((rule) => this.matchNumberRule(p.z, rule))) return false;

    if (def.name) {
      // Interpret each entry as a regex; AND across them (change to "some" if you want OR)
      const ok = def.name.every((pattern) => {
        const re = new RegExp(pattern);
        return re.test(p.key);
      });
      if (!ok) return false;
    }

    return true;
  }

  public resolveGroupPixels(group: string, pixelGroups: Record<string, GroupDef>, allPixels: CachedFixturePixel[]): CachedFixturePixel[] {
    const def = pixelGroups[group];
    if (!def) return []; // unknown group

    // 1) "all"
    if (def === 'all') return allPixels.slice();

    // 2) explicit keys
    if (Array.isArray(def)) {
      const wanted = new Set(def);
      return allPixels.filter((p) => wanted.has(p.key));
    }

    // 3) constraints object
    return allPixels.filter((p) => this.matchesAllConstraints(p, def));
  }

  public getPixelsForKeyOrGroup(profile: FixtureProfile, allPixelKeys: CachedFixturePixel[], keyOrGroup: string): CachedFixturePixel[] {
    let result: CachedFixturePixel[] = [];

    // search for a key first
    const pixel = allPixelKeys.find((p) => p.key === keyOrGroup);
    if (pixel) return [pixel];

    // search for a group
    if (profile.matrix.pixelGroups[keyOrGroup]) {
      result.push(...this.resolveGroupPixels(keyOrGroup, profile.matrix.pixelGroups, allPixelKeys));
    }

    return result;
  }
}
