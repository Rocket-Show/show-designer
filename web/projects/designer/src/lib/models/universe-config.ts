/**
 * Lightweight configuration entry describing a universe that can
 * be selected by the user inside the fixture pool. The actual
 * runtime universe (with channel values, etc.) is represented by
 * the `Universe` model.
 */
export interface UniverseConfig {
  uuid: string;
  name: string;
}
