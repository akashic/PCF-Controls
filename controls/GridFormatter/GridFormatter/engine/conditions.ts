/**
 * Evaluates a rule's `when` condition against one row (brief §5.2.2, with the
 * spike findings in `docs/decisions.md`).
 *
 * The evaluator is pure and never throws. Anything it can't make sense of is
 * `false` at the leaf where it happens, and groups then combine leaves with
 * ordinary boolean logic (so `not` of a `false` leaf is `true`):
 *
 * - a column that isn't in the view ({@link NOT_VISIBLE}); callers should skip
 *   the whole rule first, using {@link referencedColumns} (V2);
 * - an unknown operator, a missing or malformed operand, or a type mismatch
 *   (e.g. `contains` on a number, `gt` on text).
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
 * - Text equality and `contains` / `startsWith` / `endsWith` ignore case.
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
import { NOT_VISIBLE, normalizeGuid, type ColumnValue, type RowValue } from "./rowValues";

/** Reads a column of the row being evaluated (see `columnReader` in `rowValues.ts`). */
export type ColumnLookup = (column: ColumnName) => ColumnValue;

/** Returned by comparisons whose two sides can't be compared. */
const MISMATCH: unique symbol = Symbol("mismatch");
type Mismatch = typeof MISMATCH;

/** Per-evaluation context. */
interface Env {
	readonly getColumn: ColumnLookup;
	readonly today: CalendarDate | null;
	readonly offset: TimeZoneOffset;
}

/** A date on one side of a comparison: a calendar date, or an instant. */
type DateSide = { kind: "date"; date: CalendarDate } | { kind: "instant"; instant: Date };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isColumnOperand(value: unknown): value is { column: ColumnName } {
	return isRecord(value) && typeof value.column === "string";
}

/**
 * Evaluates `condition` for one row.
 *
 * @param condition A validated `when` condition. Malformed input is tolerated (it evaluates to `false`).
 * @param getColumn Returns each column's normalised value, or `NOT_VISIBLE`.
 * @param today The user's local date, `YYYY-MM-DD`. The caller computes it once per render pass:
 *   `toLocalDate(new Date(), offset)`. Invalid → every day-based operator is `false`.
 * @param offset The user's UTC offset in minutes, positive east of UTC (UTC+10 is `600`), or a function
 *   returning it for an instant, e.g. `(d) => context.userSettings.getTimeZoneOffsetMinutes(d)`.
 *   Used to turn date-and-time values into the user's local date, and to read config times without a
 *   zone suffix as the user's local time.
 *
 * Dates:
 * - Date-only cells are calendar dates and are never shifted.
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
	today: string,
	offset: TimeZoneOffset,
): boolean {
	try {
		return evaluateAt(condition, { getColumn, today: parseCalendarDate(today), offset }, 1);
	} catch {
		// A MalformedCondition, or a throwing getColumn.
		return false;
	}
}

/** Thrown inside the evaluator for a malformed condition, so the whole condition is `false`. */
class MalformedCondition extends Error {}

function groupItems(items: unknown): unknown[] {
	if (!Array.isArray(items) || items.length === 0) throw new MalformedCondition();
	return items;
}

function evaluateAt(condition: unknown, env: Env, depth: number): boolean {
	if (!isRecord(condition)) throw new MalformedCondition();
	if (!("all" in condition || "any" in condition || "not" in condition)) return evaluateLeaf(condition, env);
	// `when` is level 1 and each group adds a level, so the deepest level holds only leaves.
	if (depth >= MAX_CONDITION_DEPTH) throw new MalformedCondition();
	if ("all" in condition) return groupItems(condition.all).every((c) => evaluateAt(c, env, depth + 1));
	if ("any" in condition) return groupItems(condition.any).some((c) => evaluateAt(c, env, depth + 1));
	return !evaluateAt(condition.not, env, depth + 1);
}

function evaluateLeaf(leaf: Record<string, unknown>, env: Env): boolean {
	if (typeof leaf.column !== "string") return false;
	const value = env.getColumn(leaf.column);
	if (value === NOT_VISIBLE) return false;
	if (leaf.op === "isNull") return value === null;
	if (value === null) return false;

	const operand = leaf.value;
	switch (leaf.op) {
		case "isNotNull":
			return true;
		case "eq":
			return equalsOperand(value, operand, env) === true;
		case "ne":
			return equalsOperand(value, operand, env) === false;
		case "in":
			return Array.isArray(operand) && operand.some((item) => equals(value, item, env) === true);
		case "notIn":
			return (
				Array.isArray(operand) && operand.length > 0 && operand.every((item) => equals(value, item, env) === false)
			);
		case "gt":
			return orderTest(compareOperand(value, operand, env), (c) => c > 0);
		case "gte":
			return orderTest(compareOperand(value, operand, env), (c) => c >= 0);
		case "lt":
			return orderTest(compareOperand(value, operand, env), (c) => c < 0);
		case "lte":
			return orderTest(compareOperand(value, operand, env), (c) => c <= 0);
		case "between":
			return between(value, operand, env);
		case "contains":
			return textTest(value, operand, (text, part) => text.includes(part));
		case "startsWith":
			return textTest(value, operand, (text, part) => text.startsWith(part));
		case "endsWith":
			return textTest(value, operand, (text, part) => text.endsWith(part));
		case "beforeToday":
			return dayTest(value, env, (day, today) => day < today);
		case "onOrAfterToday":
			return dayTest(value, env, (day, today) => day >= today);
		case "olderThanDays":
			return isDayCount(operand) && dayTest(value, env, (day, today) => day < today - operand);
		case "withinNextDays":
			return isDayCount(operand) && dayTest(value, env, (day, today) => day >= today && day <= today + operand);
		case "containsAny":
			return optionSetTest(value, operand, (selected, wanted) => wanted.some((v) => selected.includes(v)));
		case "containsAll":
			return optionSetTest(value, operand, (selected, wanted) => wanted.every((v) => selected.includes(v)));
		default:
			return false;
	}
}

// Operands -----------------------------------------------------------------

/**
 * Resolves `{ "column": ... }` to the other column's value. `undefined` when
 * that column is empty or not in the view, so the comparison is `false`.
 */
function resolveOperand(operand: unknown, env: Env): unknown {
	if (!isColumnOperand(operand)) return operand;
	const other = env.getColumn(operand.column);
	return other === NOT_VISIBLE || other === null ? undefined : other;
}

function equalsOperand(value: NonNullable<RowValue>, operand: unknown, env: Env): boolean | Mismatch {
	return equals(value, resolveOperand(operand, env), env);
}

function compareOperand(value: NonNullable<RowValue>, operand: unknown, env: Env): number | Mismatch {
	return compare(value, resolveOperand(operand, env), env);
}

// Equality -----------------------------------------------------------------

/** Lower-cases text; a GUID is also stripped of braces so lookups match however the GUID was written. */
function textKey(text: string): string {
	return normalizeGuid(text) ?? text.toLowerCase();
}

function equals(value: NonNullable<RowValue>, operand: unknown, env: Env): boolean | Mismatch {
	if (typeof value === "number") return typeof operand === "number" ? value === operand : MISMATCH;
	if (typeof value === "boolean") return typeof operand === "boolean" ? value === operand : MISMATCH;
	if (Array.isArray(value)) return MISMATCH;

	const order = compareDates(value, operand, env);
	if (order !== MISMATCH) return order === 0;
	if (typeof value === "string" && typeof operand === "string") return textKey(value) === textKey(operand);
	return MISMATCH;
}

// Ordering -----------------------------------------------------------------

function sign(n: number): number {
	return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/** Numbers with numbers, dates with dates; anything else is a mismatch. */
function compare(value: NonNullable<RowValue>, operand: unknown, env: Env): number | Mismatch {
	if (typeof value === "number") return typeof operand === "number" ? sign(value - operand) : MISMATCH;
	return compareDates(value, operand, env);
}

function orderTest(order: number | Mismatch, test: (order: number) => boolean): boolean {
	return order !== MISMATCH && test(order);
}

function between(value: NonNullable<RowValue>, operand: unknown, env: Env): boolean {
	if (!Array.isArray(operand) || operand.length !== 2) return false;
	const [min, max] = operand as [unknown, unknown];
	return orderTest(compare(value, min, env), (c) => c >= 0) && orderTest(compare(value, max, env), (c) => c <= 0);
}

// Dates --------------------------------------------------------------------

/** A cell value as a date: `Date` is an instant; a `YYYY-MM-DD` string (date-only cell) is a calendar date. */
function cellDate(value: unknown): DateSide | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : { kind: "instant", instant: value };
	const date = parseCalendarDate(value);
	return date ? { kind: "date", date } : null;
}

/** An operand as a date: an ISO string from config (times without a zone are user-local) or another date cell. */
function operandDate(operand: unknown, env: Env): DateSide | null {
	return operand instanceof Date ? cellDate(operand) : parseIso(operand, env.offset);
}

function localDate(side: DateSide, env: Env): CalendarDate | null {
	return side.kind === "date" ? side.date : toLocalDate(side.instant, env.offset);
}

/** Orders two dates: instants exactly; otherwise as the user's local calendar dates. */
function compareDates(value: unknown, operand: unknown, env: Env): number | Mismatch {
	const left = cellDate(value);
	const right = left && operandDate(operand, env);
	if (!left || !right) return MISMATCH;
	if (left.kind === "instant" && right.kind === "instant") {
		return sign(left.instant.getTime() - right.instant.getTime());
	}
	const a = localDate(left, env);
	const b = localDate(right, env);
	if (a === null || b === null) return MISMATCH;
	return a < b ? -1 : a > b ? 1 : 0;
}

function isDayCount(operand: unknown): operand is number {
	return typeof operand === "number" && Number.isInteger(operand) && operand >= 0;
}

/** Runs `test` on the cell's local date and today, both as day numbers. */
function dayTest(value: NonNullable<RowValue>, env: Env, test: (day: number, today: number) => boolean): boolean {
	const side = cellDate(value);
	const date = side && localDate(side, env);
	return date !== null && env.today !== null && test(dayNumber(date), dayNumber(env.today));
}

// Text and multi-select ----------------------------------------------------

function textTest(value: NonNullable<RowValue>, operand: unknown, test: (text: string, part: string) => boolean): boolean {
	if (typeof value !== "string" || typeof operand !== "string" || operand === "") return false;
	return test(value.toLowerCase(), operand.toLowerCase());
}

function optionSetTest(
	value: NonNullable<RowValue>,
	operand: unknown,
	test: (selected: number[], wanted: number[]) => boolean,
): boolean {
	if (!Array.isArray(value) || !Array.isArray(operand) || operand.length === 0) return false;
	if (!operand.every((v): v is number => typeof v === "number")) return false;
	return test(value, operand);
}

// Referenced columns -------------------------------------------------------

/**
 * Every column `condition` reads (leaf columns and `{ "column": ... }`
 * operands), each once, in the order first seen. A rule whose columns aren't
 * all in the view should be skipped (V2). Malformed parts are ignored.
 */
export function referencedColumns(condition: Condition | undefined): ColumnName[] {
	const columns = new Set<ColumnName>();
	const visit = (node: unknown, depth: number): void => {
		if (!isRecord(node) || depth > MAX_CONDITION_DEPTH) return;
		for (const key of ["all", "any"] as const) {
			const items = node[key];
			if (Array.isArray(items)) items.forEach((c) => visit(c, depth + 1));
		}
		if ("not" in node) visit(node.not, depth + 1);
		if (typeof node.column === "string") columns.add(node.column);
		if (isColumnOperand(node.value)) columns.add(node.value.column);
	};
	visit(condition, 1);
	return [...columns];
}
