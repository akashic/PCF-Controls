/**
 * TypeScript types for one table's GridFormatter config file (the web resource
 * `wb_/GridFormatter/<table logical name>.json`).
 *
 * These mirror `config/grid-format.schema.json`, which is the source of truth.
 * Change both together. CI validates config files against the schema; the
 * runtime re-validates what it loads, so these types describe a config that has
 * already passed validation.
 */

/** Conditions nest at most this deep: `when` is level 1 and each group adds a level. */
export const MAX_CONDITION_DEPTH = 5;

/** The config format version this control understands. */
export const CONFIG_VERSION = 1;

/** Column logical name as it appears in the view, e.g. `wb_duedate`. */
export type ColumnName = string;

/** One table's formatting rules. The file name says which table. */
export interface TableConfig {
	/** Path to the schema, for editor autocomplete. Ignored by the control. */
	$schema?: string;
	version: typeof CONFIG_VERSION;
	defaults?: ConfigDefaults;
	/** Evaluated in ascending `priority` (ties keep array order). */
	rules: Rule[];
}

export interface ConfigDefaults {
	/** Alpha for `fromOption` colours with `alpha: "tint"`. Defaults to 0.18. */
	tintAlpha?: number;
	/** Used when `fromOption` finds no colour. `null` (default) means the rule doesn't set the property. */
	fallbackColor?: StaticColor | null;
}

export interface Rule {
	/** Unique within the file. */
	id: string;
	description?: string;
	/** Lower is evaluated first. Defaults to 0. */
	priority?: number;
	/** Omitted means the rule applies to every row. */
	when?: Condition;
	/** Required unless `when` is a leaf, in which case it defaults to that leaf's column. */
	scope?: Scope;
	/** Defaults to `"style"`. `"pill"` needs cell scope and `style.backgroundColor`. */
	display?: Display;
	/** Required unless `stop` is true. */
	style?: StyleProps;
	/** Stop evaluating further rules for the row when this rule matches. Defaults to false. */
	stop?: boolean;
}

export type Display = "style" | "pill";

export type Scope = "row" | CellScope;

export interface CellScope {
	columns: ColumnName[];
}

// Conditions ---------------------------------------------------------------

export type Condition = LeafCondition | AllCondition | AnyCondition | NotCondition;

export interface AllCondition {
	all: Condition[];
}

export interface AnyCondition {
	any: Condition[];
}

export interface NotCondition {
	not: Condition;
}

/** A number (also choice/status option values), text, lookup GUID, ISO date, or Yes/No. */
export type Scalar = number | string | boolean;

/** ISO 8601 date (`"2026-12-31"`) or date and time. */
export type IsoDate = string;

/** Compare with another column of the same row. Both must be in the view. */
export interface ColumnOperand {
	column: ColumnName;
}

interface LeafBase<Op extends string> {
	column: ColumnName;
	op: Op;
}

export type EqualityLeaf = LeafBase<"eq" | "ne"> & { value: Scalar | ColumnOperand };
export type SetLeaf = LeafBase<"in" | "notIn"> & { value: Scalar[] };
export type ComparisonLeaf = LeafBase<"gt" | "gte" | "lt" | "lte"> & { value: number | IsoDate | ColumnOperand };
export type BetweenLeaf = LeafBase<"between"> & { value: [number, number] | [IsoDate, IsoDate] };
export type TextLeaf = LeafBase<"contains" | "startsWith" | "endsWith"> & { value: string };
export type DaysLeaf = LeafBase<"olderThanDays" | "withinNextDays"> & { value: number };
export type MultiSelectLeaf = LeafBase<"containsAny" | "containsAll"> & { value: number[] };
export type NoOperandLeaf = LeafBase<"isNull" | "isNotNull" | "beforeToday" | "onOrAfterToday"> & { value?: never };

export type LeafCondition =
	| EqualityLeaf
	| SetLeaf
	| ComparisonLeaf
	| BetweenLeaf
	| TextLeaf
	| DaysLeaf
	| MultiSelectLeaf
	| NoOperandLeaf;

export type Operator = LeafCondition["op"];

// Styles and colours -------------------------------------------------------

export interface StyleProps {
	backgroundColor?: ColorValue;
	color?: ColorValue;
	fontWeight?: "normal" | "semibold" | "bold";
	fontStyle?: "normal" | "italic";
	textDecoration?: "none" | "line-through" | "underline";
}

/** `#RGB` or `#RRGGBB`. */
export type HexString = string;

export interface HexAlphaColor {
	hex: HexString;
	/** 0 (transparent) to 1 (solid). */
	alpha: number;
}

export interface TokenColor {
	/** A Fluent 9 colour token name from the schema's allow-list, e.g. `colorNeutralBackground3`. */
	token: string;
}

export interface FromOptionColor {
	/** Choice column whose selected option's colour is used. */
	fromOption: ColumnName;
	/** `"tint"` uses `defaults.tintAlpha`; omit for a solid colour. */
	alpha?: "tint" | number;
}

export type StaticColor = HexString | HexAlphaColor | TokenColor;

export type ColorValue = StaticColor | FromOptionColor;

// Type guards ----------------------------------------------------------------

export function isLeafCondition(condition: Condition): condition is LeafCondition {
	return "column" in condition;
}

export function isFromOptionColor(color: ColorValue): color is FromOptionColor {
	return typeof color === "object" && "fromOption" in color;
}

export function isCellScope(scope: Scope): scope is CellScope {
	return typeof scope === "object";
}
