/**
 * Resolves config colour values (brief §5.4) to CSS colour strings.
 *
 * All colour maths comes from `@wb-pcf/shared`. This module only decides which
 * colour and which alpha a config value means in a given place:
 *
 * - **Backgrounds are translucent** (spike V6), so the grid's hover and
 *   selection colours show through. A colour with no explicit alpha (a plain
 *   hex, a token, or `fromOption` without `alpha`) is applied at
 *   `defaults.tintAlpha`. An explicit numeric alpha is used as given.
 * - **Text** colours are solid unless the config gives an alpha.
 * - **Pills** are a deliberate cell replacement, so their fill is always solid
 *   (alpha is ignored) and their text is black or white by contrast.
 * - **Tokens** become `var(--<token>, <webLightTheme value>)`: the grid defines
 *   Fluent's CSS variables inside its cells, so the theme (including dark mode)
 *   wins and the light value is only a fallback. A translucent token uses
 *   `color-mix(in srgb, var(...) N%, transparent)`.
 */
import { BLACK, WHITE, bestTextColor, blend, normalizeHex, withAlpha, type HexColor } from "@wb-pcf/shared";
import { isFromOptionColor, type ColorValue, type ColumnName, type ConfigDefaults, type StaticColor } from "./configSchema";
import { PACKED_FLUENT_COLOR_TOKENS } from "./fluentTokens";

/** Alpha for backgrounds and `"tint"` when the config doesn't set `defaults.tintAlpha`. */
export const DEFAULT_TINT_ALPHA = 0.18;

/** One choice column's option colours: option value → colour (as read from metadata; validated here). */
export type OptionColourMap = ReadonlyMap<number, string>;

/** Option colours per choice column, keyed by the column name used in config (`fromOption`). */
export type OptionColours = ReadonlyMap<ColumnName, OptionColourMap>;

/** Returns a column's normalised value for the current row (`undefined` or `null` when empty or absent). */
export type ValueGetter = (column: ColumnName) => unknown;

/** Where a colour is used, which decides its alpha. */
export type ColourUsage = "background" | "text" | "pill";

/** `defaults` with every value filled in. */
export interface ColourDefaults {
	readonly tintAlpha: number;
	readonly fallbackColor: StaticColor | null;
}

/** A colour ready to use in CSS. */
export interface ResolvedColour {
	/** CSS colour, e.g. `#C50F1F`, `rgba(197, 15, 31, 0.18)` or `var(--colorNeutralForeground3, #616161)`. */
	readonly css: string;
	/**
	 * The opaque colour before alpha, in the light theme (a token's webLightTheme value).
	 * `null` when that isn't a hex colour (a few tokens are `transparent` or `rgba(...)`).
	 */
	readonly base: HexColor | null;
	/** The alpha applied, 0 to 1. */
	readonly alpha: number;
}

/** How to draw a `display: "pill"` cell: a solid fill with black or white text. */
export interface PillSpec {
	readonly backgroundColor: string;
	readonly color: HexColor;
}

/** Everything `fromOption` needs: the defaults, the option colours and the row's values. */
export interface ColourContext {
	readonly defaults: ColourDefaults;
	readonly optionColours: OptionColours;
	readonly getValue: ValueGetter;
}

export function resolveDefaults(defaults: ConfigDefaults | undefined): ColourDefaults {
	return {
		tintAlpha: defaults?.tintAlpha ?? DEFAULT_TINT_ALPHA,
		fallbackColor: defaults?.fallbackColor ?? null,
	};
}

// Tokens -------------------------------------------------------------------

const PACKED_HEX = /^[0-9a-f]{6}$/;

/**
 * Unpacks the token table written by `scripts/generate-token-fallbacks.mjs`
 * (format described in `fluentTokens.ts`) into token name → light-theme CSS colour.
 */
export function unpackTokens(packed: string): Map<string, string> {
	const tokens = new Map<string, string>();
	let previous = "";
	for (const entry of packed.split("|")) {
		const equals = entry.indexOf("=");
		const name = previous.slice(0, parseInt(entry[0], 36)) + entry.slice(1, equals);
		const value = entry.slice(equals + 1);
		tokens.set(`color${name}`, PACKED_HEX.test(value) ? `#${value}` : value);
		previous = name;
	}
	return tokens;
}

let tokenTable: ReadonlyMap<string, string> | undefined;

/** The colour token allow-list (the schema's enum), each with its webLightTheme value. Unpacked on first use. */
export function fluentColorTokens(): ReadonlyMap<string, string> {
	tokenTable ??= unpackTokens(PACKED_FLUENT_COLOR_TOKENS);
	return tokenTable;
}

/** True for a token name in the allow-list. */
export function isColourToken(name: unknown): name is string {
	return typeof name === "string" && fluentColorTokens().has(name);
}

// Resolution -----------------------------------------------------------------

const clampAlpha = (alpha: number): number => (Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1);

/** The alpha a colour gets in `usage`, given the alpha written in config (if any). */
function alphaFor(usage: ColourUsage, written: number | "tint" | undefined, tintAlpha: number): number {
	if (usage === "pill") return 1;
	if (written === "tint") return clampAlpha(tintAlpha);
	if (written !== undefined) return clampAlpha(written);
	return usage === "background" ? clampAlpha(tintAlpha) : 1;
}

function fromHex(hex: HexColor, alpha: number): ResolvedColour {
	return { css: alpha >= 1 ? hex : withAlpha(hex, alpha), base: hex, alpha };
}

function fromToken(token: string, alpha: number): ResolvedColour | null {
	const fallback = fluentColorTokens().get(token);
	if (fallback === undefined) return null;
	const variable = `var(--${token}, ${fallback})`;
	const percent = `${Math.round(alpha * 1000) / 10}%`;
	return {
		css: alpha >= 1 ? variable : `color-mix(in srgb, ${variable} ${percent}, transparent)`,
		base: normalizeHex(fallback),
		alpha,
	};
}

/** Resolves a hex, `{ hex, alpha }` or `{ token }` colour. Returns `null` for an invalid hex or unknown token. */
export function resolveStaticColour(colour: StaticColor, usage: ColourUsage, tintAlpha: number): ResolvedColour | null {
	if (typeof colour === "string") {
		const hex = normalizeHex(colour);
		return hex ? fromHex(hex, alphaFor(usage, undefined, tintAlpha)) : null;
	}
	if ("token" in colour) return fromToken(colour.token, alphaFor(usage, undefined, tintAlpha));
	const hex = normalizeHex(colour.hex);
	return hex ? fromHex(hex, alphaFor(usage, colour.alpha, tintAlpha)) : null;
}

/**
 * The colour of the row's selected option in `column`, or `null` when the column
 * has no option colours, the value is empty or not a single option (e.g. multi-select),
 * the option has no colour, or the colour isn't a valid hex.
 */
export function optionColour(column: ColumnName, value: unknown, optionColours: OptionColours): HexColor | null {
	const colours = optionColours.get(column);
	if (!colours) return null;
	// Normalised choice values are numbers; the grid's raw value is a numeric string (spike V1).
	const option = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
	return Number.isFinite(option) ? normalizeHex(colours.get(option)) : null;
}

/**
 * Resolves any colour value for the current row. A `fromOption` colour that
 * finds no valid option colour uses `defaults.fallbackColor` (resolved as written,
 * with its own alpha rules). Returns `null` when there's no colour, meaning the
 * rule doesn't set this property and a later rule may.
 */
export function resolveColour(colour: ColorValue, usage: ColourUsage, context: ColourContext): ResolvedColour | null {
	const { tintAlpha, fallbackColor } = context.defaults;
	if (!isFromOptionColor(colour)) return resolveStaticColour(colour, usage, tintAlpha);
	const hex = optionColour(colour.fromOption, context.getValue(colour.fromOption), context.optionColours);
	if (hex) return fromHex(hex, alphaFor(usage, colour.alpha, tintAlpha));
	return fallbackColor === null ? null : resolveStaticColour(fallbackColor, usage, tintAlpha);
}

/** A pill drawn with `fill` (resolve it with usage `"pill"`): black or white text, whichever contrasts more. */
export function pillSpec(fill: ResolvedColour): PillSpec {
	return { backgroundColor: fill.css, color: fill.base ? bestTextColor(fill.base) : BLACK };
}

/** The opaque colour seen in the light theme when `colour` is painted over `over` (white by default). */
export function lightAppearance(colour: ResolvedColour, over: HexColor = WHITE): HexColor | null {
	return colour.base ? blend(colour.base, colour.alpha, over) : null;
}

/**
 * The cell container's `background-image` value for a background colour. The grid
 * sets `background-color` with `!important`, so backgrounds are a gradient layer (V6).
 */
export function backgroundLayer(css: string): string {
	return `linear-gradient(${css}, ${css})`;
}
