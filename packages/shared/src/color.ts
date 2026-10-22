/**
 * Canonical colour utilities shared by every WB control.
 *
 * Every function except `normalizeHex` takes a `HexColor`, which only
 * `normalizeHex` can produce. Callers validate untrusted input (option
 * metadata, config) once, and nothing downstream needs to handle bad
 * input or throw.
 */

/** An opaque `#RRGGBB` colour (upper case), produced only by {@link normalizeHex}. */
export type HexColor = string & { readonly __brand: "HexColor" };

export const BLACK = "#000000" as "#000000" & HexColor;
export const WHITE = "#FFFFFF" as "#FFFFFF" & HexColor;

const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const LONG_HEX = /^#?([0-9a-f]{6})$/i;

/**
 * Accepts `#RGB`, `#RRGGBB` or `RRGGBB` (any case, surrounding whitespace
 * ignored) and returns `#RRGGBB` in upper case. Anything else returns `null`.
 */
export function normalizeHex(input: unknown): HexColor | null {
  if (typeof input !== "string") return null;
  const value = input.trim();

  const short = SHORT_HEX.exec(value);
  if (short) {
    const [, r, g, b] = short;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase() as HexColor;
  }

  const long = LONG_HEX.exec(value);
  return long ? (`#${long[1]}`.toUpperCase() as HexColor) : null;
}

function channels(hex: HexColor): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * Returns the colour as a CSS `rgba(...)` string. `alpha` is clamped to
 * 0–1; a non-finite alpha is treated as 1 (opaque).
 */
export function withAlpha(hex: HexColor, alpha: number): string {
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

/**
 * WCAG 2.x relative luminance, from 0 (black) to 1 (white). Uses the sRGB
 * linearisation threshold 0.04045; WCAG's older 0.03928 differs only for
 * channel values that can't occur in 8-bit colour.
 */
export function relativeLuminance(hex: HexColor): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.x contrast ratio between two colours, from 1 to 21. Order doesn't matter. */
export function contrastRatio(a: HexColor, b: HexColor): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black or white, whichever has the higher contrast against `background` (black on a tie). */
export function bestTextColor(background: HexColor): typeof BLACK | typeof WHITE {
  return contrastRatio(background, BLACK) >= contrastRatio(background, WHITE) ? BLACK : WHITE;
}
