/**
 * Style resolution and precedence (brief §5.2.3–§5.2.5, amended by spike V6/V7).
 *
 * Two steps, so the per-row work is small (§5.9):
 *
 * 1. `prepareRules` once per config, column set and option-colour load: sorts the
 *    rules, drops rules whose columns aren't all in the view, works out each
 *    rule's target cells, removes properties a column type can't show (V7, with a
 *    warning naming the rule), and resolves colours that don't depend on the row.
 * 2. `resolveStyles` once per row (memoise with `createRowStyleCache`): applies
 *    the matching rules with "first rule to set a property for a cell wins".
 *
 * Conditions are evaluated by an injected `RuleMatcher`, so this module doesn't
 * depend on the condition evaluator (`conditions.ts`, issue #11); #13 wires them.
 */
import type { ColumnName, Condition, Rule, StyleProps, TableConfig } from "./configSchema";
import { isFromOptionColor, isLeafCondition } from "./configSchema";
import {
	pillSpec,
	resolveColour,
	resolveDefaults,
	resolveStaticColour,
	type ColourDefaults,
	type ColourUsage,
	type OptionColours,
	type PillSpec,
	type ResolvedColour,
	type ValueGetter,
} from "./colours";
import { consoleWarn, type Warn } from "./warnings";

/** A column in the current grid, from the renderer's `colDefs`. */
export interface GridColumn {
	/** Logical name, or `alias.column` for a related table's column. */
	readonly name: ColumnName;
	/** `colDefs[].dataType`, e.g. `Text`, `OptionSet`, `Lookup`, `Persona`. */
	readonly dataType: string;
	/** The table's primary name column (drawn as the "open record" link). */
	readonly isPrimary?: boolean;
}

/** True when the rule's condition holds for the current row. Only called for rules that have a `when`. */
export type RuleMatcher = (rule: Rule) => boolean;

/** CSS font weights for the config's `fontWeight` values (Fluent 400/600/700). */
export const FONT_WEIGHTS = { normal: 400, semibold: 600, bold: 700 } as const;

/** One cell's resolved style. Properties a rule didn't set are absent. */
export interface CellStyle {
	/** CSS colour for the container's background layer (see `backgroundLayer`). Always translucent. */
	readonly backgroundColor?: string;
	/** Text colour. Only present on columns the control can draw (`canDrawCell`). */
	readonly color?: string;
	/** Only present on columns the control can draw. */
	readonly fontWeight?: (typeof FONT_WEIGHTS)[keyof typeof FONT_WEIGHTS];
	readonly fontStyle?: NonNullable<StyleProps["fontStyle"]>;
	readonly textDecoration?: NonNullable<StyleProps["textDecoration"]>;
	/** Draw the cell as a pill. `color` is never set alongside it: the pill picks its own text colour. */
	readonly pill?: PillSpec;
	/**
	 * True when the control must draw the cell itself: it has a pill, or a
	 * `color` or `fontWeight` (which the grid's own cell content ignores, V7).
	 * Otherwise apply the style to the cell container and let the grid draw.
	 */
	readonly customRender: boolean;
}

/** The resolved styles for one row. */
export interface RowStyles {
	/** Styled cells by column name. Columns with no style are absent. */
	readonly cells: ReadonlyMap<ColumnName, CellStyle>;
	/** Ids of the rules that matched, in evaluation order (for the debug log, §5.8). */
	readonly matchedRuleIds: readonly string[];
}

export interface PrepareOptions {
	/** A validated config (see `validateConfig`). */
	readonly config: TableConfig;
	/** The grid's columns, from `colDefs`. Rules that read any other column are skipped. */
	readonly columns: readonly GridColumn[];
	/** Option colours for `fromOption`. Missing columns resolve to `defaults.fallbackColor`. */
	readonly optionColours?: OptionColours;
	/** Where V7 warnings go. Pass a `createWarnOnce()` sink so they're logged once until the browser tab reloads. */
	readonly warn?: Warn;
}

type StyleKey = keyof StyleProps;
type CellSlots = { -readonly [K in keyof CellStyle]?: CellStyle[K] };
type ColourSource = (getValue: ValueGetter) => ResolvedColour | null;

interface Target {
	readonly column: ColumnName;
	/** Style properties this rule may set in this cell (pill fill and pill `color` excluded). */
	readonly keys: readonly StyleKey[];
	readonly pill: boolean;
}

interface PreparedRule {
	readonly rule: Rule;
	readonly targets: readonly Target[];
	readonly background?: ColourSource;
	readonly color?: ColourSource;
	/** Pill fill: the rule's `backgroundColor`, solid. */
	readonly pillFill?: ColourSource;
}

/** Rules ready for `resolveStyles`. Opaque: build it with `prepareRules`. */
export interface PreparedRules {
	readonly rules: readonly PreparedRule[];
	/** Every column the kept rules read (conditions and `fromOption`), for memo keys. */
	readonly referencedColumns: readonly ColumnName[];
}

const STYLE_KEYS: readonly StyleKey[] = ["backgroundColor", "color", "fontWeight", "fontStyle", "textDecoration"];

/** Properties the grid shows when set on the cell container, for every column type (V6, V7). */
const CONTAINER_KEYS: ReadonlySet<StyleKey> = new Set<StyleKey>(["backgroundColor", "fontStyle", "textDecoration"]);

/** Column types the control may draw itself (V7): their `formattedValue` is plain text with no link. */
const DRAWABLE_TYPES: ReadonlySet<string> = new Set([
	"Text",
	"Integer",
	"Decimal",
	"FloatingPoint",
	"Currency",
	"DateOnly",
	"DateAndTime",
	"OptionSet",
	"TwoOptions",
]);

/**
 * True when the control may draw this column's cells itself, which `color`,
 * `fontWeight` and pills need (V7). Never the primary name column (drawing it
 * removes the "open record" link), and not Lookup, Customer, Owner/Persona,
 * MultiSelectPicklist, File, Image or any other type not listed in V7.
 */
export function canDrawCell(column: GridColumn): boolean {
	return column.isPrimary !== true && DRAWABLE_TYPES.has(column.dataType);
}

function conditionColumns(condition: Condition, into: Set<ColumnName>): void {
	if (isLeafCondition(condition)) {
		into.add(condition.column);
		const value: unknown = condition.value;
		// A `{ column }` operand (eq, ne, gt, gte, lt, lte) reads a second column.
		if (typeof value === "object" && value !== null && !Array.isArray(value)) into.add((value as { column: ColumnName }).column);
	} else if ("all" in condition) condition.all.forEach((c) => conditionColumns(c, into));
	else if ("any" in condition) condition.any.forEach((c) => conditionColumns(c, into));
	else conditionColumns(condition.not, into);
}

/**
 * Every column a rule reads: its condition's columns (including `{ column }`
 * operands) and its `fromOption` colours. The rule only applies when all are in the view (V2).
 */
export function ruleColumns(rule: Rule): ColumnName[] {
	const columns = new Set<ColumnName>();
	if (rule.when) conditionColumns(rule.when, columns);
	for (const colour of [rule.style?.backgroundColor, rule.style?.color]) {
		if (colour !== undefined && isFromOptionColor(colour)) columns.add(colour.fromOption);
	}
	return [...columns];
}

/** Rules in evaluation order: ascending `priority` (default 0), ties in file order. */
export function sortRules(rules: readonly Rule[]): Rule[] {
	return rules
		.map((rule, index) => ({ rule, index }))
		.sort((a, b) => (a.rule.priority ?? 0) - (b.rule.priority ?? 0) || a.index - b.index)
		.map(({ rule }) => rule);
}

/** The visible columns a rule styles: every column for `"row"`, else its listed columns (or its leaf's column). */
function targetColumns(rule: Rule, columns: readonly GridColumn[], visible: ReadonlyMap<ColumnName, GridColumn>): GridColumn[] {
	if (rule.scope === "row") return [...columns];
	// No scope: a leaf condition's column (validation requires a scope otherwise).
	const names = rule.scope ? rule.scope.columns : rule.when && isLeafCondition(rule.when) ? [rule.when.column] : [];
	return names.flatMap((name) => visible.get(name) ?? []);
}

function colourSource(
	colour: StyleProps["backgroundColor"],
	usage: ColourUsage,
	defaults: ColourDefaults,
	optionColours: OptionColours,
): ColourSource | undefined {
	if (colour === undefined) return undefined;
	if (!isFromOptionColor(colour)) {
		// Doesn't depend on the row, so resolve it once.
		const resolved = resolveStaticColour(colour, usage, defaults.tintAlpha);
		return () => resolved;
	}
	return (getValue) => resolveColour(colour, usage, { defaults, optionColours, getValue });
}

function describeColumn(column: GridColumn): string {
	return `"${column.name}" (${column.dataType}${column.isPrimary === true ? ", primary name" : ""})`;
}

/**
 * Prepares a validated config for one grid. Call it again when the grid's columns
 * or the option colours change. Never throws for a validated config.
 */
export function prepareRules({ config, columns, optionColours = new Map(), warn = consoleWarn }: PrepareOptions): PreparedRules {
	const visible = new Map(columns.map((column) => [column.name, column]));
	const defaults = resolveDefaults(config.defaults);
	const referenced = new Set<ColumnName>();
	const rules: PreparedRule[] = [];

	for (const rule of sortRules(config.rules)) {
		const reads = ruleColumns(rule);
		if (!reads.every((name) => visible.has(name))) continue; // Not in this view: skip silently (V2).
		reads.forEach((name) => referenced.add(name));

		const style = rule.style ?? {};
		const pill = rule.display === "pill";
		// A pill's backgroundColor is its fill, and it ignores color.
		const keys = STYLE_KEYS.filter((key) => style[key] !== undefined && !(pill && (key === "backgroundColor" || key === "color")));

		const targets = targetColumns(rule, columns, visible).map((column): Target => {
			if (canDrawCell(column)) return { column: column.name, keys, pill };
			const unsupported = [...keys.filter((key) => !CONTAINER_KEYS.has(key)), ...(pill ? ["display: pill"] : [])];
			if (unsupported.length > 0) {
				warn(`rule "${rule.id}": ${unsupported.join(", ")} can't be shown on column ${describeColumn(column)}; ignored there.`);
			}
			return { column: column.name, keys: keys.filter((key) => CONTAINER_KEYS.has(key)), pill: false };
		});

		rules.push({
			rule,
			targets,
			background: pill ? undefined : colourSource(style.backgroundColor, "background", defaults, optionColours),
			color: pill ? undefined : colourSource(style.color, "text", defaults, optionColours),
			pillFill: pill ? colourSource(style.backgroundColor, "pill", defaults, optionColours) : undefined,
		});
	}
	return { rules, referencedColumns: [...referenced] };
}

function finish(slots: CellSlots): CellStyle {
	if (slots.pill) delete slots.color;
	return { ...slots, customRender: slots.pill !== undefined || slots.color !== undefined || slots.fontWeight !== undefined };
}

/**
 * Resolves one row's cell styles (§5.2.5):
 *
 * 1. Rules run in ascending priority (default 0), ties in file order.
 * 2. The first matching rule to set a property for a cell wins, whatever its
 *    scope; later rules can still set properties that aren't set yet.
 * 3. A colour that resolves to nothing (`fromOption` with no colour and no
 *    fallback) doesn't set the property, so a later rule may.
 * 4. The first matching pill rule for a cell sets its pill.
 * 5. A matching rule with `stop: true` ends evaluation for the row.
 *
 * Pure: the same inputs give the same result.
 */
export function resolveStyles(prepared: PreparedRules, getValue: ValueGetter, matches: RuleMatcher): RowStyles {
	const slots = new Map<ColumnName, CellSlots>();
	const matchedRuleIds: string[] = [];

	for (const { rule, targets, background, color, pillFill } of prepared.rules) {
		if (rule.when !== undefined && !matches(rule)) continue;
		matchedRuleIds.push(rule.id);

		const style = rule.style ?? {};
		const values: CellSlots = {
			backgroundColor: background?.(getValue)?.css,
			color: color?.(getValue)?.css,
			fontWeight: style.fontWeight && FONT_WEIGHTS[style.fontWeight],
			fontStyle: style.fontStyle,
			textDecoration: style.textDecoration,
		};
		const fill = pillFill?.(getValue);

		for (const target of targets) {
			let cell = slots.get(target.column);
			if (!cell) slots.set(target.column, (cell = {}));
			if (target.pill && cell.pill === undefined && fill) cell.pill = pillSpec(fill);
			for (const key of target.keys) {
				if (cell[key] === undefined) Object.assign(cell, { [key]: values[key] });
			}
		}
		if (rule.stop === true) break;
	}

	const cells = new Map<ColumnName, CellStyle>();
	for (const [column, cell] of slots) {
		// Drop properties no rule managed to set (e.g. fromOption with no colour).
		const set = Object.fromEntries(Object.entries(cell).filter(([, value]) => value !== undefined)) as CellSlots;
		if (Object.keys(set).length > 0) cells.set(column, finish(set));
	}
	return { cells, matchedRuleIds };
}

// Memoisation (§5.9) ------------------------------------------------------------

/**
 * Memo key for a row: its `__rec_id` plus the values of every column the rules
 * read. The same key always resolves to the same styles for the same prepared
 * rules, as long as "today" hasn't changed (date operators).
 */
export function rowStyleKey(prepared: PreparedRules, recordId: string, getValue: ValueGetter): string {
	return `${recordId}\u0000${JSON.stringify(prepared.referencedColumns.map((column) => keyValue(getValue(column))))}`;
}

/** A value for the memo key. JSON would write a symbol (an unreadable cell) as `null`, the same as an empty one. */
function keyValue(value: unknown): unknown {
	return typeof value === "symbol" ? { symbol: value.description } : (value ?? null);
}

export interface RowStyleCache {
	/** The row's styles, resolved on first request and reused while its referenced values are unchanged. */
	get(recordId: string, getValue: ValueGetter, matches: RuleMatcher): RowStyles;
	readonly size: number;
	clear(): void;
}

/**
 * Per-row memo for `resolveStyles`, keyed by `rowStyleKey`. Create a new cache
 * whenever you call `prepareRules` again, and at the user's local midnight
 * (or key it by date) because date operators depend on "today". When it holds
 * `maxEntries` rows it starts again, which keeps memory bounded on long scrolls.
 */
export function createRowStyleCache(prepared: PreparedRules, maxEntries = 2000): RowStyleCache {
	const entries = new Map<string, RowStyles>();
	return {
		get(recordId, getValue, matches) {
			const key = rowStyleKey(prepared, recordId, getValue);
			let styles = entries.get(key);
			if (!styles) {
				if (entries.size >= maxEntries) entries.clear();
				styles = resolveStyles(prepared, getValue, matches);
				entries.set(key, styles);
			}
			return styles;
		},
		get size() {
			return entries.size;
		},
		clear() {
			entries.clear();
		},
	};
}
