// a number like the fixture library writes it, e.g. "12.5", "-3", ".5" or "1e3"
const profileNumber = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

// A number written in a fixture profile (surrounding spaces allowed), or undefined if the text
// is none. Rocket Show reads them the very same way, which Number() alone wouldn't ("0x10",
// "Infinity") and Java's Double.parseDouble() neither ("1d", "NaN").
export function parseProfileNumber(text: string): number {
  const trimmed = text.trim();
  return profileNumber.test(trimmed) ? Number(trimmed) : undefined;
}
