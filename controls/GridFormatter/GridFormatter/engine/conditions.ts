/**
 * Evaluates a rule's `when` condition against one row (brief §5.2.2, with the
 * spike findings in `docs/decisions.md`).
 *
 * The evaluator is pure and never throws. Anything it can't make sense of is
 * `false` at the leaf where it happens, and groups then combine leaves with
 * ordinary boolean logic (so `not` of a `false` leaf is `true`):
 *
 * - a column that isn't in the view ({@link NOT_VISIBLE}); callers should skip
 *   the whole rule first, using `ruleColumns` in `resolveStyle.ts` (V2);
 * - an unknown operator, a missing or malformed operand, or a type mismatch
 *   (e.g. `contains` on a number, `gt` on text, a date on a text column).
 *
 * A cell that can't be read ({@link UNREADABLE}) is different: a leaf that reads
 * it is **unknown**, not `false`, and groups use three-valued logic, so `not`
 * of unknown stays unknown. `all` is still `false` if another item is `false`,
 * and `any` still `true` if another item is `true`. A condition that ends up
 * unknown doesn't match.
 *
 * A structurally malformed condition (not an object, an empty or non-array
 * group, or nesting deeper than {@link MAX_CONDITION_DEPTH}) makes the whole
 * condition `false`, not just that part. Validation rejects all of these first.
 *
 * Value rules:
 *
 * - An empty (`null`) cell only satisfies `isNull`. Every other operator,
 *   including `ne` and `notIn`, is `false` for it, as in Dataverse filters.
 *   Use `{ "not": { ..."eq"... } }` to include empty cells.
 * - Text equality and `contains` / `startsWith` / `endsWith` ignore case
 *   (JavaScript `toLowerCase`, no accent or locale folding).
 *   Lookups compare by GUID, ignoring case and braces.
 * - Choices compare by numeric option value. Yes/No by `true` / `false`.
 * - Dates: see {@link evaluate}.
 */

import {
	dayNumber,
	parseCalendarDate,
	parseIso,
	toLocalDate,
	type CalendarDate,
	type TimeZoneOffset,
} from "./dates";
import { MAX_CONDITION_DEPTH, type ColumnName, type Condition } from "./configSchema";
import { isRecord } from "./guards";
import { DATE_TYPES, NOT_VISIBLE, UNREADABLE, normalizeGuid, type ColumnValue, type RowValue } from "./rowValues";

/** Reads a column of the row being evaluated (see `columnReader` in `rowValues.ts`). */
export type ColumnLookup = (column: ColumnName) => ColumnValue;

/** A column's `colDefs[].dataType`, or `undefined` when it isn't in the grid (see `columnTypes` in `rowValues.ts`). */
export type ColumnTypeLookup = (column: ColumnName) => string | undefined;

/** Returned by comparisons whose two sides can't be compared. */
const MISMATCH: unique symbol = Symbol("mismatch");
type Mismatch = typeof MISMATCH;

/** The third truth value: a leaf read an {@link UNREADABLE} cell. */
const UNKNOWN: unique symbol = Symbol("unknown");
type Truth = boolean | typeof UNKNOWN;

/** Per-evaluation context. */
interface Env {
	readonly getColumn: ColumnLookup;
	readonly columnType: ColumnTypeLookup;
	readonly today: CalendarDate | null;
	readonly offset: TimeZoneOffset;
}

/** A date on one side of a comparison: a calendar date, or an instant. */
type DateSide = { kind: "date"; date: CalendarDate } | { kind: "instant"; instant: Date };

/**
 * One side of a comparison. A `dated` side (a date column, or a config value
 * compared with one) only compares as a date: `date` is `null` when it isn't one.
 */
interface Side {
	readonly value: unknown;
	readonly dated: boolean;
	readonly date: DateSide | null;
}

function isColumnOperand(value: unknown): value is { column: ColumnName } {
	return isRecord(value) && typeof value.column === "string";
}

/**
 * Evaluates `condition` for one row.
 *
 * @param condition A validated `when` condition. Malformed input is tolerated (it evaluates to `false`).
 * @param getColumn Returns each column's normalised value, `UNREADABLE` or `NOT_VISIBLE`.
 * @param columnType Returns each column's `colDefs[].dataType`. Only `DateOnly` and `DateAndTime`
 *   columns are compared as dates.
 * @param today The user's local date, `YYYY-MM-DD`. The caller computes it once per render pass:
 *   `toLocalDate(new Date(), offset)`. Invalid → every day-based operator is `false`.
 * @param offset The user's UTC offset in minutes, positive east of UTC (UTC+10 is `600`), or a function
 *   returning it for an instant, e.g. `(d) => context.userSettings.getTimeZoneOffsetMinutes(d)`.
 *   Used to turn date-and-time values into the user's local date, and to read config times without a
 *   zone suffix as the user's local time.
 *
 * Dates:
 * - Only date-only and date-and-time columns are dates. A date operator, or a comparison with a date,
 *   on any other column is a type mismatch (`false`); `eq` with an ISO date on a text column compares text.
 * - Cells arrive already read by their date behaviour (`DateReading` in `rowValues.ts`, V11), so they
 *   hold the date or time the user sees. Date-only cells are calendar dates and aren't shifted here.
 * - Date-and-time cells are instants. Compared with a calendar date (a date-only operand, a date-only
 *   column, or `today`), they're first converted to the user's local date. Compared with another instant
 *   (an operand with a time, or another date-and-time column), the instants are compared exactly.
 * - `beforeToday`: local date < today. `onOrAfterToday`: local date ≥ today.
 * - `olderThanDays n`: local date < today − n (more than n days ago; `0` is the same as `beforeToday`).
 * - `withinNextDays n`: today ≤ local date ≤ today + n.
 */
export function evaluate(
	condition: Condition,
	getColumn: ColumnLookup,
	columnType: ColumnTypeLookup,
	today: string,
	offset: TimeZoneOffset,
): boolean {
	try {
		return evaluateAt(condition, { getColumn, columnType, today: parseCalendarDate(today), offset }, 1) === true;
	} catch {
		// A MalformedCondition, or a throwing getColumn or columnType.
		return false;
	}
}

/** Thrown inside the evaluator for a malformed condition, so the whole condition is `false`. */
class MalformedCondition extends Error {}

function groupItems(items: unknown): unknown[] {
	if (!Array.isArray(items) || items.length === 0) throw new MalformedCondition();
	return items;
}

/** Three-valued AND: `false` wins, then unknown. Stops at the first `false`. */
function allOf(items: unknown[], env: Env, depth: number): Truth {
	let result: Truth = true;
	for (const item of items) {
		const truth = evaluateAt(item, env, depth);
		if (truth === false) return false;
		if (truth === UNKNOWN) result = UNKNOWN;
	}
	return result;
}

/** Three-valued OR: `true` wins, then unknown. Stops at the first `true`. */
function anyOf(items: unknown[], env: Env, depth: number): Truth {
	let result: Truth = false;
	for (const item of items) {
		const truth = evaluateAt(item, env, depth);
		if (truth === true) return true;
		if (truth === UNKNOWN) result = UNKNOWN;
	}
	return result;
}

function evaluateAt(condition: unknown, env: Env, depth: number): Truth {
	if (!isRecord(condition)) throw new MalformedCondition();
	if (!("all" in condition || "any" in condition || "not" in condition)) return evaluateLeaf(condition, env);
	// `when` is level 1 and each group adds a level, so the deepest level holds only leaves.
	if (depth >= MAX_CONDITION_DEPTH) throw new MalformedCondition();
	if ("all" in condition) return allOf(groupItems(condition.all), env, depth + 1);
	if ("any" in condition) return anyOf(groupItems(condition.any), env, depth + 1);
	const truth = evaluateAt(condition.not, env, depth + 1);
	return truth === UNKNOWN ? UNKNOWN : !truth;
}

function evaluateLeaf(leaf: Record<string, unknown>, env: Env): Truth {
	if (typeof leaf.column !== "string") return false;
	const value = env.getColumn(leaf.column);
	if (value === NOT_VISIBLE) return false;
	if (value === UNREADABLE) return UNKNOWN;
	if (leaf.op === "isNull") return value === null;
	if (value === null) return false;

	const left = cellSide(value, env.columnType(leaf.column));
	const operand = leaf.value;
	const single = resolveOperand(operand, left, env);
	if (single === UNKNOWN) return UNKNOWN;
	switch (leaf.op) {
		case "isNotNull":
			return true;
		case "eq":
			return single !== null && equals(left, single, env) === true;
		case "ne":
			return single !== null && equals(left, single, env) === false;
		case "in":
			return Array.isArray(operand) && operand.some((item) => equals(left, literalSide(item, left, env), env) === true);
		case "notIn":
			return (
				Array.isArray(operand) &&
				operand.length > 0 &&
				operand.every((item) => equals(left, literalSide(item, left, env), env) === false)
			);
		case "gt":
			return single !== null && orderTest(compare(left, single, env), (c) => c > 0);
		case "gte":
			return single !== null && orderTest(compare(left, single, env), (c) => c >= 0);
		case "lt":
			return single !== null && orderTest(compare(left, single, env), (c) => c < 0);
		case "lte":
			return single !== null && orderTest(compare(left, single, env), (c) => c <= 0);
		case "between":
			return between(left, operand, env);
		case "contains":
			return textTest(left, operand, (text, part) => text.includes(part));
		case "startsWith":
			return textTest(left, operand, (text, part) => text.startsWith(part));
		case "endsWith":
			return textTest(left, operand, (text, part) => text.endsWith(part));
		case "beforeToday":
			return dayTest(left, env, (day, today) => day < today);
		case "onOrAfterToday":
			return dayTest(left, env, (day, today) => day >= today);
		case "olderThanDays":
			return isDayCount(operand) && dayTest(left, env, (day, today) => day < today - operand);
		case "withinNextDays":
			return isDayCount(operand) && dayTest(left, env, (day, today) => day >= today && day <= today + operand);
		case "containsAny":
			return optionSetTest(left, operand, (selected, wanted) => wanted.some((v) => selected.includes(v)));
		case "containsAll":
			return optionSetTest(left, operand, (selected, wanted) => wanted.every((v) => selected.includes(v)));
		default:
			return false;
	}
}

// Sides ----------------------------------------------------------------------

function isDateType(dataType: string | undefined): boolean {
	return dataType !== undefined && DATE_TYPES.has(dataType);
}

/** A date cell's value as a date: `Date` is an instant; a `YYYY-MM-DD` string (date-only cell) is a calendar date. */
function cellDate(value: unknown): DateSide | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : { kind: "instant", instant: value };
	const date = parseCalendarDate(value);
	return date ? { kind: "date", date } : null;
}

/** A cell as a comparison side: only date columns are dated. */
function cellSide(value: NonNullable<RowValue>, dataType: string | undefined): Side {
	const dated = isDateType(dataType);
	return { value, dated, date: dated ? cellDate(value) : null };
}

/** A value from config. It's read as a date (times without a zone are user-local) only against a date column. */
function literalSide(literal: unknown, left: Side, env: Env): Side {
	return { value: literal, dated: left.dated, date: left.dated ? parseIso(literal, env.offset) : null };
}

/**
 * The operand as a side. `{ "column": ... }` reads the other column: `null`
 * when it's empty or not in the view (the comparison is `false`), and unknown
 * when it can't be read.
 */
function resolveOperand(operand: unknown, left: Side, env: Env): Side | null | typeof UNKNOWN {
	if (!isColumnOperand(operand)) return literalSide(operand, left, env);
	const other = env.getColumn(operand.column);
	if (other === UNREADABLE) return UNKNOWN;
	if (other === NOT_VISIBLE || other === null) return null;
	return cellSide(other, env.columnType(operand.column));
}

// Equality -----------------------------------------------------------------

/** Lower-cases text; a GUID is also stripped of braces so lookups match however the GUID was written. */
function textKey(text: string): string {
	return normalizeGuid(text) ?? text.toLowerCase();
}

function equals(left: Side, right: Side, env: Env): boolean | Mismatch {
	if (left.dated || right.dated) {
		const order = compareDates(left, right, env);
		return order === MISMATCH ? MISMATCH : order === 0;
	}
	const { value } = left;
	const operand = right.value;
	if (typeof value === "number") return typeof operand === "number" ? value === operand : MISMATCH;
	if (typeof value === "boolean") return typeof operand === "boolean" ? value === operand : MISMATCH;
	if (typeof value === "string" && typeof operand === "string") return textKey(value) === textKey(operand);
	return MISMATCH;
}

// Ordering -----------------------------------------------------------------

function sign(n: number): number {
	return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/** Numbers with numbers, dates with dates; anything else is a mismatch. */
function compare(left: Side, right: Side, env: Env): number | Mismatch {
	if (left.dated || right.dated) return compareDates(left, right, env);
	return typeof left.value === "number" && typeof right.value === "number" ? sign(left.value - right.value) : MISMATCH;
}

function orderTest(order: number | Mismatch, test: (order: number) => boolean): boolean {
	return order !== MISMATCH && test(order);
}

function between(left: Side, operand: unknown, env: Env): boolean {
	if (!Array.isArray(operand) || operand.length !== 2) return false;
	const [min, max] = operand as [unknown, unknown];
	return (
		orderTest(compare(left, literalSide(min, left, env), env), (c) => c >= 0) &&
		orderTest(compare(left, literalSide(max, left, env), env), (c) => c <= 0)
	);
}

// Dates --------------------------------------------------------------------

function localDate(side: DateSide, env: Env): CalendarDate | null {
	return side.kind === "date" ? side.date : toLocalDate(side.instant, env.offset);
}

/** Orders two dated sides: instants exactly; otherwise as the user's local calendar dates. */
function compareDates(left: Side, right: Side, env: Env): number | Mismatch {
	const a = left.date;
	const b = right.date;
	if (!left.dated || !right.dated || !a || !b) return MISMATCH;
	if (a.kind === "instant" && b.kind === "instant") return sign(a.instant.getTime() - b.instant.getTime());
	const x = localDate(a, env);
	const y = localDate(b, env);
	if (x === null || y === null) return MISMATCH;
	return x < y ? -1 : x > y ? 1 : 0;
}

function isDayCount(operand: unknown): operand is number {
	return typeof operand === "number" && Number.isInteger(operand) && operand >= 0;
}

/** Runs `test` on the cell's local date and today, both as day numbers. */
function dayTest(left: Side, env: Env, test: (day: number, today: number) => boolean): boolean {
	const date = left.date && localDate(left.date, env);
	return date !== null && env.today !== null && test(dayNumber(date), dayNumber(env.today));
}

// Text and multi-select ----------------------------------------------------

function textTest(left: Side, operand: unknown, test: (text: string, part: string) => boolean): boolean {
	const { value } = left;
	if (left.dated || typeof value !== "string" || typeof operand !== "string" || operand === "") return false;
	return test(value.toLowerCase(), operand.toLowerCase());
}

function optionSetTest(left: Side, operand: unknown, test: (selected: number[], wanted: number[]) => boolean): boolean {
	const { value } = left;
	if (!Array.isArray(value) || !Array.isArray(operand) || operand.length === 0) return false;
	if (!operand.every((v): v is number => typeof v === "number")) return false;
	return test(value as number[], operand);
}
