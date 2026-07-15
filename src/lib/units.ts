/**
 * Unit helpers for spec display.
 *
 * Temperatures are stored in Celsius (schema columns end in `_c`). Convert
 * at the presentation boundary — do NOT re-label Celsius as Fahrenheit.
 */

export function cToF(c: number | null | undefined): number | null {
  if (c === null || c === undefined || !Number.isFinite(c)) return null;
  return (c * 9) / 5 + 32;
}

/** Format a Celsius value as °F for display. */
export function fmtTempF(c: number | null | undefined): string {
  const f = cToF(c);
  if (f === null) return "—";
  return `${Math.round(f)}°F`;
}

/**
 * Fields where a stored `0` almost certainly means "unknown / never
 * extracted" rather than a real measured zero. Render these as "—".
 */
export function fmtNonZero(n: number | null | undefined, suffix = ""): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n === 0) return "—";
  return `${n}${suffix}`;
}
