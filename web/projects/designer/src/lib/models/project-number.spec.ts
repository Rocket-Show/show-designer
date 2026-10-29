import { readProjectNumber } from './project-number';

describe('readProjectNumber', () => {
  it('should read a number as it is', () => {
    expect(readProjectNumber(12.5)).toBe(12.5);
    expect(readProjectNumber(undefined)).toBeUndefined();
  });

  it('should read a number saved as text, surrounding spaces allowed', () => {
    expect(readProjectNumber('12.5')).toBe(12.5);
    expect(readProjectNumber(' 120 ')).toBe(120);
  });

  it('should read an empty text, also one of spaces only, as no number', () => {
    expect(readProjectNumber('')).toBeUndefined();
    expect(readProjectNumber('   ')).toBeUndefined();
  });
});
