/**
 * Runtime validation of a loaded config file (brief §5.8, ADR-0004).
 *
 * A small hand-written check of what `config/grid-format.schema.json` says, so the
 * control doesn't bundle a JSON Schema library (CI validates files with ajv):
 *
 * - Not JSON, not an object, wrong `version` or no `rules` array: one warning, no config.
 * - An invalid rule: that rule is skipped with one warning naming its `id`; the rest still work.
 *   That includes a date or time that doesn't exist (`2026-02-30`, `T25:00`; the schema's
 *   pattern can't catch the first), and a pill whose fill is a theme token.
 * - An invalid `defaults` value: that value is ignored with a warning.
 * - A rule's text colour below 4.5:1 against its background: a warning; the rule is kept.
 *
 * Never throws.
 */
import { WHITE, contrastRatio, type HexColor } from "@wb-pcf/shared";
import {
	CONFIG_VERSION,
	MAX_CONDITION_DEPTH,
	isFromOptionColor,
	type ConfigDefaults,
	type Rule,
	type StaticColor,
	type TableConfig,
} from "./configSchema";
import {
	isColourToken,
	lightAppearance,
	resolveDefaults,
	resolveStaticColour,
	type ColourDefaults,
	type ColourUsage,
} from "./colours";
import { parseIso } from "./dates";
import { isRecord } from "./guards";
import { consoleWarn, type Warn } from "./warnings";

/** WCAG AA minimum contrast for normal text. */
export const MIN_CONTRAST = 4.5;

/** A description of the first thing wrong, with its JSON pointer path, or `null` when valid. */
type Problem = string | null;
type JsonObject = Record<string, unknown>;

const COLUMN = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;
const HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const RULE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const MAX_ID_LENGTH = 64;

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isAlpha = (value: unknown): boolean => isNumber(value) && value >= 0 && value <= 1;
const isScalar = (value: unknown): boolean => isNumber(value) || typeof value === "string" || typeof value === "boolean";
const isColumn = (value: unknown): value is string => typeof value === "string" && COLUMN.test(value);
const isIsoDate = (value: unknown): boolean => typeof value === "string" && ISO_DATE.test(value);
const isColumnOperand = (value: unknown): boolean => isRecord(value) && Object.keys(value).length === 1 && isColumn(value.column);
const isList = (value: unknown, item: (v: unknown) => boolean): value is unknown[] =>
	Array.isArray(value) && value.length > 0 && value.every(item);
const isDistinct = (values: unknown[]): boolean => new Set(values).size === values.length;
const quote = (value: unknown): string => JSON.stringify(value) ?? String(value);

/** The first key of `object` that isn't in `allowed`, as a problem. */
function unknownKey(object: JsonObject, allowed: readonly string[], path: string): Problem {
	const extra = Object.keys(object).find((key) => !allowed.includes(key));
	return extra === undefined ? null : `${path} has an unknown property "${extra}"`;
}

// Conditions -------------------------------------------------------------------

const equality = (v: unknown): boolean => isScalar(v) || isColumnOperand(v);
const comparison = (v: unknown): boolean => isNumber(v) || isIsoDate(v) || isColumnOperand(v);
const scalarList = (v: unknown): boolean => isList(v, isScalar);
const text = (v: unknown): boolean => typeof v === "string" && v.length > 0;
const days = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 0;
const optionList = (v: unknown): boolean => isList(v, Number.isInteger) && isDistinct(v);
const between = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && (v.every(isNumber) || v.every(isIsoDate));

/** Operand check per operator; `null` for operators that take no value. Mirrors the schema's `leafCondition`. */
const OPERATORS: ReadonlyMap<string, ((value: unknown) => boolean) | null> = new Map([
	["eq", equality],
	["ne", equality],
	["in", scalarList],
	["notIn", scalarList],
	["gt", comparison],
	["gte", comparison],
	["lt", comparison],
	["lte", comparison],
	["between", between],
	["isNull", null],
	["isNotNull", null],
	["contains", text],
	["startsWith", text],
	["endsWith", text],
	["beforeToday", null],
	["onOrAfterToday", null],
	["olderThanDays", days],
	["withinNextDays", days],
	["containsAny", optionList],
	["containsAll", optionList],
]);

/**
 * The first text in an operand (a value or a list item) shaped like an ISO date
 * that isn't a real date or time, such as `2026-02-30` or `2026-10-22T25:00`.
 * The schema's pattern only checks the shape.
 */
function impossibleDate(value: unknown): string | undefined {
	return (Array.isArray(value) ? value : [value]).find(
		(item): item is string => isIsoDate(item) && parseIso(item) === null,
	);
}

function checkLeaf(leaf: JsonObject, path: string): Problem {
	const extra = unknownKey(leaf, ["column", "op", "value"], path);
	if (extra) return extra;
	if (!isColumn(leaf.column)) return `${path}/column must be a column logical name`;
	const operand = typeof leaf.op === "string" ? OPERATORS.get(leaf.op) : undefined;
	if (operand === undefined) return `${path}/op ${quote(leaf.op)} isn't a known operator`;
	if (operand === null) return "value" in leaf ? `${path}/value: "${String(leaf.op)}" takes no value` : null;
	const impossible = impossibleDate(leaf.value);
	if (impossible !== undefined) return `${path}/value ${quote(impossible)} isn't a real date or time`;
	return operand(leaf.value) ? null : `${path}/value ${quote(leaf.value)} isn't a valid operand for "${String(leaf.op)}"`;
}

/** `depth` is 1 for `when`; each group adds a level, up to `MAX_CONDITION_DEPTH`. */
function checkCondition(condition: unknown, path: string, depth: number): Problem {
	if (!isRecord(condition)) return `${path} must be a condition object`;
	if ("column" in condition || "op" in condition) return checkLeaf(condition, path);
	const keys = Object.keys(condition);
	if (keys.length !== 1) return `${path} must be a leaf { column, op, value } or exactly one of all, any or not`;
	const [key] = keys;
	if (key !== "all" && key !== "any" && key !== "not") return `${path} has an unknown property "${key}"`;
	if (depth >= MAX_CONDITION_DEPTH) return `${path}: conditions nest at most ${MAX_CONDITION_DEPTH} levels deep`;
	if (key === "not") return checkCondition(condition.not, `${path}/not`, depth + 1);
	const list = condition[key];
	if (!Array.isArray(list) || list.length === 0) return `${path}/${key} must be a non-empty array`;
	for (let i = 0; i < list.length; i++) {
		const problem = checkCondition(list[i], `${path}/${key}/${i}`, depth + 1);
		if (problem) return problem;
	}
	return null;
}

// Colours and styles ---------------------------------------------------------------

function checkColour(colour: unknown, path: string, allowFromOption: boolean): Problem {
	if (typeof colour === "string") return HEX.test(colour) ? null : `${path} ${quote(colour)} isn't a #RGB or #RRGGBB colour`;
	if (!isRecord(colour)) return `${path} must be a colour`;
	if ("token" in colour) {
		return (
			unknownKey(colour, ["token"], path) ??
			(isColourToken(colour.token) ? null : `${path}/token ${quote(colour.token)} isn't a known Fluent 9 colour token`)
		);
	}
	if ("hex" in colour) {
		const extra = unknownKey(colour, ["hex", "alpha"], path);
		if (extra) return extra;
		if (typeof colour.hex !== "string" || !HEX.test(colour.hex)) return `${path}/hex ${quote(colour.hex)} isn't a #RGB or #RRGGBB colour`;
		return isAlpha(colour.alpha) ? null : `${path}/alpha must be a number from 0 to 1`;
	}
	if (allowFromOption && "fromOption" in colour) {
		const extra = unknownKey(colour, ["fromOption", "alpha"], path);
		if (extra) return extra;
		if (!isColumn(colour.fromOption)) return `${path}/fromOption must be a column logical name`;
		const { alpha } = colour;
		return alpha === undefined || alpha === "tint" || isAlpha(alpha) ? null : `${path}/alpha must be "tint" or a number from 0 to 1`;
	}
	return `${path} must be a colour: "#RRGGBB", { hex, alpha }, { token }${allowFromOption ? " or { fromOption }" : ""}`;
}

const STYLE_ENUMS: ReadonlyMap<string, readonly string[]> = new Map([
	["fontWeight", ["normal", "semibold", "bold"]],
	["fontStyle", ["normal", "italic"]],
	["textDecoration", ["none", "line-through", "underline"]],
]);

function checkStyle(style: unknown, path: string): Problem {
	if (!isRecord(style) || Object.keys(style).length === 0) return `${path} must be an object with at least one property`;
	for (const [key, value] of Object.entries(style)) {
		const allowed = STYLE_ENUMS.get(key);
		let problem: Problem;
		if (key === "backgroundColor" || key === "color") problem = checkColour(value, `${path}/${key}`, true);
		else if (allowed) problem = allowed.includes(value as string) ? null : `${path}/${key} must be one of ${allowed.join(", ")}`;
		else problem = `${path}: "${key}" isn't an allowed style property (raw CSS isn't supported)`;
		if (problem) return problem;
	}
	return null;
}

function checkScope(scope: unknown, path: string): Problem {
	if (scope === "row") return null;
	if (!isRecord(scope)) return `${path} must be "row" or { "columns": [...] }`;
	const extra = unknownKey(scope, ["columns"], path);
	if (extra) return extra;
	const { columns } = scope;
	return isList(columns, isColumn) && isDistinct(columns) ? null : `${path}/columns must be a non-empty list of distinct column names`;
}

// Rules ------------------------------------------------------------------------

const RULE_KEYS = ["id", "description", "priority", "when", "scope", "display", "style", "stop"];

/** The first problem with a rule, mirroring the schema's `rule` definition. */
function checkRule(rule: unknown, path: string): Problem {
	if (!isRecord(rule)) return `${path} must be an object`;
	const checks: (() => Problem)[] = [
		() => unknownKey(rule, RULE_KEYS, path),
		() =>
			typeof rule.id === "string" && RULE_ID.test(rule.id) && rule.id.length <= MAX_ID_LENGTH
				? null
				: `${path}/id must be up to ${MAX_ID_LENGTH} letters, digits, "_", "." or "-", starting with a letter or digit`,
		() => (rule.description === undefined || typeof rule.description === "string" ? null : `${path}/description must be text`),
		() => (rule.priority === undefined || Number.isInteger(rule.priority) ? null : `${path}/priority must be a whole number`),
		() => (rule.when === undefined ? null : checkCondition(rule.when, `${path}/when`, 1)),
		() => (rule.scope === undefined ? null : checkScope(rule.scope, `${path}/scope`)),
		() => (rule.display === undefined || rule.display === "style" || rule.display === "pill" ? null : `${path}/display must be "style" or "pill"`),
		() => (rule.stop === undefined || typeof rule.stop === "boolean" ? null : `${path}/stop must be true or false`),
		() => (rule.style === undefined ? (rule.stop === true ? null : `${path}: style is required unless stop is true`) : checkStyle(rule.style, `${path}/style`)),
		() =>
			rule.scope !== undefined || (isRecord(rule.when) && "column" in rule.when)
				? null
				: `${path}: scope is required unless when is a single leaf condition`,
		() => (rule.display === "pill" && rule.scope === "row" ? `${path}/scope: a pill needs cell scope, not "row"` : null),
		() =>
			rule.display === "pill" && !(isRecord(rule.style) && rule.style.backgroundColor !== undefined)
				? `${path}/style: a pill needs a backgroundColor`
				: null,
		// The pill's black or white text is picked against the token's light-theme value, so it can be unreadable in dark mode.
		() =>
			rule.display === "pill" && isRecord(rule.style) && isRecord(rule.style.backgroundColor) && "token" in rule.style.backgroundColor
				? `${path}/style/backgroundColor: a pill's fill can't be a theme token, because its text colour can't follow dark mode; use a hex colour or fromOption`
				: null,
	];
	for (const check of checks) {
		const problem = check();
		if (problem) return problem;
	}
	return null;
}

function checkDefaults(defaults: unknown, warn: Warn): ConfigDefaults | undefined {
	if (defaults === undefined) return undefined;
	if (!isRecord(defaults)) {
		warn("config: /defaults must be an object; ignored.");
		return undefined;
	}
	const extra = unknownKey(defaults, ["tintAlpha", "fallbackColor"], "/defaults");
	if (extra) warn(`config: ${extra}; ignored.`);

	const result: ConfigDefaults = {};
	const { tintAlpha, fallbackColor } = defaults;
	if (tintAlpha !== undefined) {
		if (isNumber(tintAlpha) && tintAlpha > 0 && tintAlpha <= 1) result.tintAlpha = tintAlpha;
		else warn("config: /defaults/tintAlpha must be a number above 0 and up to 1; using the default.");
	}
	if (fallbackColor !== undefined) {
		const problem = fallbackColor === null ? null : checkColour(fallbackColor, "/defaults/fallbackColor", false);
		if (problem) warn(`config: ${problem}; no fallback colour is used.`);
		else result.fallbackColor = fallbackColor as StaticColor | null;
	}
	return result;
}

// Contrast ----------------------------------------------------------------------

/** The opaque light-theme colour of a static colour in `usage`, painted over `over`. */
function lightHex(colour: StaticColor, usage: ColourUsage, defaults: ColourDefaults, over: HexColor): HexColor | null {
	const resolved = resolveStaticColour(colour, usage, defaults.tintAlpha);
	return resolved ? lightAppearance(resolved, over) : null;
}

/**
 * A warning when a rule's text `color` has less than 4.5:1 contrast against the
 * rule's own `backgroundColor` (or white, the grid's light background), in the
 * light theme: tokens use their webLightTheme value, and translucent colours are
 * composited as the grid would show them. Skipped for pills (they pick their own
 * text colour), for `fromOption` colours (they depend on the row) and for tokens
 * whose light value isn't a hex colour.
 */
export function contrastWarning(rule: Rule, defaults: ColourDefaults): string | null {
	const { color, backgroundColor } = rule.style ?? {};
	if (color === undefined || rule.display === "pill" || isFromOptionColor(color)) return null;
	if (backgroundColor !== undefined && isFromOptionColor(backgroundColor)) return null;

	const background = backgroundColor === undefined ? WHITE : lightHex(backgroundColor, "background", defaults, WHITE);
	if (!background) return null;
	const foreground = lightHex(color, "text", defaults, background);
	if (!foreground) return null;

	const ratio = contrastRatio(foreground, background);
	if (ratio >= MIN_CONTRAST) return null;
	return `rule "${rule.id}": text colour contrast is ${ratio.toFixed(2)}:1 against its background in the light theme, below ${MIN_CONTRAST}:1.`;
}

// Entry points --------------------------------------------------------------------

function ruleLabel(rule: unknown, index: number): string {
	return isRecord(rule) && typeof rule.id === "string" ? `"${rule.id}"` : `at /rules/${index}`;
}

/**
 * Validates a parsed config file. Returns the config with only its valid rules
 * (and valid defaults), or `null` when the file can't be used at all. Every
 * problem goes to `warn` (the console by default). Never throws.
 */
export function validateConfig(input: unknown, warn: Warn = consoleWarn): TableConfig | null {
	try {
		if (!isRecord(input)) {
			warn("config ignored: it isn't a JSON object.");
			return null;
		}
		if (input.version !== CONFIG_VERSION) {
			warn(`config ignored: version ${quote(input.version)} isn't supported (expected ${CONFIG_VERSION}).`);
			return null;
		}
		if (!Array.isArray(input.rules)) {
			warn("config ignored: rules must be an array.");
			return null;
		}
		const extra = unknownKey(input, ["$schema", "version", "defaults", "rules"], "config");
		if (extra) warn(`${extra}; ignored.`);

		const defaults = checkDefaults(input.defaults, warn);
		const colourDefaults = resolveDefaults(defaults);
		const ids = new Set<string>();
		const rules: Rule[] = [];
		input.rules.forEach((candidate: unknown, index) => {
			const path = `/rules/${index}`;
			let problem = checkRule(candidate, path);
			const rule = candidate as Rule;
			if (!problem && ids.has(rule.id)) problem = `${path}/id is a duplicate`;
			if (problem) {
				warn(`rule ${ruleLabel(candidate, index)} skipped: ${problem}.`);
				return;
			}
			ids.add(rule.id);
			rules.push(rule);
			const contrast = contrastWarning(rule, colourDefaults);
			if (contrast) warn(contrast);
		});
		return defaults ? { version: CONFIG_VERSION, defaults, rules } : { version: CONFIG_VERSION, rules };
	} catch (error) {
		warn(`config ignored: it couldn't be validated (${String(error)}).`);
		return null;
	}
}

/** Parses and validates the text of a config web resource. Invalid JSON: one warning and `null`. Never throws. */
export function parseConfig(text: string, warn: Warn = consoleWarn): TableConfig | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		warn(`config ignored: it isn't valid JSON (${String(error)}).`);
		return null;
	}
	return validateConfig(parsed, warn);
}
