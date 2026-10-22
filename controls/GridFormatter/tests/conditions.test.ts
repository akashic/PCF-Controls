import { readFileSync } from "fs";
import { join } from "path";
import { evaluate, referencedColumns, type ColumnLookup } from "../GridFormatter/engine/conditions";
import type { Condition, TableConfig } from "../GridFormatter/engine/configSchema";
import type { TimeZoneOffset } from "../GridFormatter/engine/dates";
import { NOT_VISIBLE, columnReader, type ColumnTypeInfo, type ColumnValue } from "../GridFormatter/engine/rowValues";

const TODAY = "2026-10-22";
const AEST = 600; // UTC+10, as captured in the spike

const GREEN = 948790002;
const GUID = "64a20861-7fdd-f011-8406-7ced8d70a9f0";

/** A row with these normalised values; any other column is not in the view. */
const rowOf =
	(values: Record<string, ColumnValue>): ColumnLookup =>
	(column) =>
		Object.prototype.hasOwnProperty.call(values, column) ? values[column] : NOT_VISIBLE;

const check = (
	condition: unknown,
	values: Record<string, ColumnValue>,
	today: string = TODAY,
	offset: TimeZoneOffset = AEST,
): boolean => evaluate(condition as Condition, rowOf(values), today, offset);

/** Evaluates `{ column: "c", op, value }` against `c = cell`. */
const leaf = (op: string, cell: ColumnValue, value?: unknown, today?: string, offset?: TimeZoneOffset): boolean =>
	check(value === undefined ? { column: "c", op } : { column: "c", op, value }, { c: cell }, today, offset);

const instant = (iso: string) => new Date(iso);

describe("isNull / isNotNull", () => {
	it.each([[0], [""], [false], [[1]], ["x"], [instant("2026-10-22T00:00:00Z")]])("%p is not null", (cell) => {
		expect(leaf("isNull", cell)).toBe(false);
		expect(leaf("isNotNull", cell)).toBe(true);
	});

	it("null is null", () => {
		expect(leaf("isNull", null)).toBe(true);
		expect(leaf("isNotNull", null)).toBe(false);
	});

	it("a column that isn't in the view is neither", () => {
		expect(check({ column: "missing", op: "isNull" }, {})).toBe(false);
		expect(check({ column: "missing", op: "isNotNull" }, {})).toBe(false);
	});
});

describe("eq / ne", () => {
	it.each([
		["choice", GREEN, GREEN, true],
		["choice", 948790001, GREEN, false],
		["number", 3.14, 3.14, true],
		["Yes/No", true, true, true],
		["Yes/No", false, true, false],
		["text, ignoring case", "Spike Row 01", "spike row 01", true],
		["text", "Spike row 01", "Spike row 02", false],
		["lookup GUID, ignoring case", GUID, GUID.toUpperCase(), true],
		["lookup GUID, ignoring braces", GUID, `{${GUID}}`, true],
		["lookup GUID", GUID, "4c2ddcfb-c2cd-f111-a05b-70a8a59b69e5", false],
		["date-only", "2026-10-18", "2026-10-18", true],
		["date-only", "2026-10-18", "2026-10-19", false],
	])("%s: %p eq %p → %p", (_, cell, value, expected) => {
		expect(leaf("eq", cell, value)).toBe(expected);
		expect(leaf("ne", cell, value)).toBe(!expected);
	});

	it.each([
		["a choice with a string", GREEN, String(GREEN)],
		["a number with a boolean", 1, true],
		["a Yes/No with a number", true, 1],
		["text with a number", "1", 1],
		["a multi-select", [GREEN], GREEN],
		["a date-and-time with text", instant("2026-10-22T00:00:00Z"), "today"],
		["a date-and-time with a number", instant("2026-10-22T00:00:00Z"), 0],
		["a lookup with an object", GUID, { id: GUID }],
	])("type mismatch, %s, is false for both", (_, cell, value) => {
		expect(leaf("eq", cell, value)).toBe(false);
		expect(leaf("ne", cell, value)).toBe(false);
	});

	it("an empty cell is false for both eq and ne", () => {
		expect(leaf("eq", null, GREEN)).toBe(false);
		expect(leaf("ne", null, GREEN)).toBe(false);
		// `not eq` includes empty cells.
		expect(check({ not: { column: "c", op: "eq", value: GREEN } }, { c: null })).toBe(true);
	});

	it("a missing operand is a mismatch", () => {
		expect(leaf("eq", GREEN)).toBe(false);
		expect(leaf("ne", GREEN)).toBe(false);
	});

	describe("dates", () => {
		it("compares a date-and-time with a date-only operand on the user's local date", () => {
			// 2026-10-21T19:48Z is 22 Oct 6:48 AM at UTC+10.
			const reviewed = instant("2026-10-21T19:48:00Z");
			expect(leaf("eq", reviewed, "2026-10-22")).toBe(true);
			expect(leaf("eq", reviewed, "2026-10-21")).toBe(false);
			expect(leaf("eq", reviewed, "2026-10-21", TODAY, 0)).toBe(true);
		});

		it("compares a date-and-time with a date-and-time operand exactly", () => {
			const reviewed = instant("2026-10-21T19:48:00Z");
			expect(leaf("eq", reviewed, "2026-10-21T19:48:00Z")).toBe(true);
			expect(leaf("eq", reviewed, "2026-10-22T05:48:00+10:00")).toBe(true);
			expect(leaf("eq", reviewed, "2026-10-21T19:48:01Z")).toBe(false);
			// No zone suffix: the user's local time.
			expect(leaf("eq", reviewed, "2026-10-22T05:48")).toBe(true);
		});

		it("compares a date-only cell with a date-and-time operand on the user's local date", () => {
			expect(leaf("eq", "2026-10-22", "2026-10-21T19:48:00Z")).toBe(true);
			expect(leaf("eq", "2026-10-22", "2026-10-21T19:48:00Z", TODAY, 0)).toBe(false);
		});
	});

	describe("column-to-column", () => {
		it("compares with another column's value", () => {
			expect(check({ column: "a", op: "eq", value: { column: "b" } }, { a: 5, b: 5 })).toBe(true);
			expect(check({ column: "a", op: "ne", value: { column: "b" } }, { a: 5, b: 6 })).toBe(true);
			expect(check({ column: "a", op: "eq", value: { column: "b" } }, { a: GUID, b: GUID.toUpperCase() })).toBe(true);
		});

		it("compares a date-only column with a date-and-time column on the local date", () => {
			const values = { due: "2026-10-22", reviewed: instant("2026-10-21T19:48:00Z") };
			expect(check({ column: "due", op: "eq", value: { column: "reviewed" } }, values)).toBe(true);
			expect(check({ column: "reviewed", op: "eq", value: { column: "due" } }, values)).toBe(true);
		});

		it.each([
			["empty", { a: 5, b: null }],
			["not in the view", { a: 5 }],
			["of another type", { a: 5, b: "5" }],
		])("is false for both eq and ne when the other column is %s", (_, values) => {
			expect(check({ column: "a", op: "eq", value: { column: "b" } }, values)).toBe(false);
			expect(check({ column: "a", op: "ne", value: { column: "b" } }, values)).toBe(false);
		});
	});
});

describe("in / notIn", () => {
	it.each([
		["choice", GREEN, [948790000, GREEN], true],
		["choice", 948790001, [948790000, GREEN], false],
		["text, ignoring case", "Amber", ["red", "AMBER"], true],
		["lookup GUID, ignoring case", GUID, [GUID.toUpperCase()], true],
		["Yes/No", true, [true], true],
		["date-only", "2026-10-18", ["2026-10-17", "2026-10-18"], true],
	])("%s: %p in %p → %p", (_, cell, value, expected) => {
		expect(leaf("in", cell, value)).toBe(expected);
		expect(leaf("notIn", cell, value)).toBe(!expected);
	});

	it("an empty cell is false for both", () => {
		expect(leaf("in", null, [GREEN])).toBe(false);
		expect(leaf("notIn", null, [GREEN])).toBe(false);
	});

	it.each([
		["not an array", GREEN],
		["empty", []],
		["of the wrong type", [String(GREEN)]],
	])("an operand that is %s is false for both", (_, value) => {
		expect(leaf("in", GREEN, value)).toBe(false);
		expect(leaf("notIn", GREEN, value)).toBe(false);
	});

	it("in matches any item of the right type; notIn needs every item comparable", () => {
		expect(leaf("in", GREEN, ["x", GREEN])).toBe(true);
		expect(leaf("notIn", 1, ["x", GREEN])).toBe(false);
	});
});

describe("gt / gte / lt / lte", () => {
	const ops = (cell: ColumnValue, value: unknown, today?: string, offset?: TimeZoneOffset) =>
		(["gt", "gte", "lt", "lte"] as const).map((op) => leaf(op, cell, value, today, offset));

	it.each([
		["number above", 10, 5, [true, true, false, false]],
		["number equal", 5, 5, [false, true, false, true]],
		["number below", -1, 5, [false, false, true, true]],
		["currency", 2250, 2000, [true, true, false, false]],
		["date-only after", "2026-10-19", "2026-10-18", [true, true, false, false]],
		["date-only equal", "2026-10-18", "2026-10-18", [false, true, false, true]],
		["date-only before", "2026-10-17", "2026-10-18", [false, false, true, true]],
		["date-only vs a date and time (local date)", "2026-10-22", "2026-10-21T19:48:00Z", [false, true, false, true]],
		["instant after instant", instant("2026-10-21T19:48:01Z"), "2026-10-21T19:48:00Z", [true, true, false, false]],
		["instant equal instant", instant("2026-10-21T19:48:00Z"), "2026-10-22T05:48:00+10:00", [false, true, false, true]],
		["instant before instant", instant("2026-10-21T19:47:59Z"), "2026-10-21T19:48:00Z", [false, false, true, true]],
		["instant vs date (same local date)", instant("2026-10-21T19:48:00Z"), "2026-10-22", [false, true, false, true]],
		["instant vs date (earlier local date)", instant("2026-10-21T13:59:59Z"), "2026-10-22", [false, false, true, true]],
	])("%s: %p vs %p", (_, cell, value, expected) => {
		expect(ops(cell, value)).toEqual(expected);
	});

	it("uses the given offset when an instant meets a calendar date", () => {
		const cell = instant("2026-10-21T19:48:00Z");
		expect(ops(cell, "2026-10-22", TODAY, AEST)).toEqual([false, true, false, true]);
		expect(ops(cell, "2026-10-22", TODAY, -300)).toEqual([false, false, true, true]);
	});

	it("compares column to column (actual cost gt budget)", () => {
		const overBudget = { column: "wb_actualcost", op: "gt", value: { column: "wb_budget" } };
		expect(check(overBudget, { wb_actualcost: 2250, wb_budget: 2000 })).toBe(true);
		expect(check(overBudget, { wb_actualcost: 750, wb_budget: 1000 })).toBe(false);
		expect(check(overBudget, { wb_actualcost: 2250, wb_budget: null })).toBe(false);
		expect(check(overBudget, { wb_actualcost: 2250 })).toBe(false);
	});

	it("compares two date-and-time columns exactly", () => {
		const values = { a: instant("2026-10-22T02:48:00Z"), b: instant("2026-10-21T19:48:00Z") };
		expect(check({ column: "a", op: "gt", value: { column: "b" } }, values)).toBe(true);
		expect(check({ column: "b", op: "gt", value: { column: "a" } }, values)).toBe(false);
	});

	it.each([
		["text", "b", "a"],
		["Yes/No", true, false],
		["a multi-select", [2], 1],
		["a number with a string", 5, "4"],
		["a number with a date", 5, "2026-10-18"],
		["a date with a number", "2026-10-18", 5],
		["a date with text", "2026-10-18", "tomorrow"],
		["an invalid Date", new Date(NaN), "2026-10-18"],
	])("type mismatch, %s, is false", (_, cell, value) => {
		expect(ops(cell, value)).toEqual([false, false, false, false]);
	});

	it("an empty cell is false", () => {
		expect(ops(null, 5)).toEqual([false, false, false, false]);
	});

	it("a broken offset makes instant-vs-date comparisons false", () => {
		expect(ops(instant("2026-10-21T19:48:00Z"), "2026-10-22", TODAY, NaN)).toEqual([false, false, false, false]);
		expect(ops("2026-10-22", "2026-10-21T19:48:00Z", TODAY, NaN)).toEqual([false, false, false, false]);
		// Two instants don't need it.
		expect(ops(instant("2026-10-21T19:48:00Z"), "2026-10-21T19:48:00Z", TODAY, NaN)).toEqual([false, true, false, true]);
	});
});

describe("between", () => {
	it.each([
		[5, [1, 10], true],
		[1, [1, 10], true],
		[10, [1, 10], true],
		[0, [1, 10], false],
		[11, [1, 10], false],
		[5, [10, 1], false],
		["2026-10-18", ["2026-10-01", "2026-10-31"], true],
		["2026-10-31", ["2026-10-01", "2026-10-31"], true],
		["2026-11-01", ["2026-10-01", "2026-10-31"], false],
		[instant("2026-10-31T13:59:59Z"), ["2026-10-01", "2026-10-31"], true],
		[instant("2026-10-31T14:00:00Z"), ["2026-10-01", "2026-10-31"], false],
	])("%p between %p → %p", (cell, value, expected) => {
		expect(leaf("between", cell, value)).toBe(expected);
	});

	it.each([
		["not an array", 5, 5],
		["one item", 5, [1]],
		["three items", 5, [1, 5, 10]],
		["mixed types", 5, [1, "2026-10-31"]],
		["text cell", "b", ["a", "c"]],
		["empty cell", null, [1, 10]],
	])("%s → false", (_, cell, value) => {
		expect(leaf("between", cell, value)).toBe(false);
	});
});

describe("contains / startsWith / endsWith", () => {
	it.each([
		["contains", "Spike row 01", "ROW", true],
		["contains", "Spike row 01", "row 02", false],
		["startsWith", "Spike row 01", "spike", true],
		["startsWith", "Spike row 01", "row", false],
		["endsWith", "Spike row 01", "W 01", true],
		["endsWith", "Spike row 01", "Spike", false],
	])("%s: %p, %p → %p", (op, cell, value, expected) => {
		expect(leaf(op, cell, value)).toBe(expected);
	});

	it.each(["contains", "startsWith", "endsWith"])("%s is false for non-text, empty cells and bad operands", (op) => {
		expect(leaf(op, 101, "1")).toBe(false);
		expect(leaf(op, [1], "1")).toBe(false);
		expect(leaf(op, true, "t")).toBe(false);
		expect(leaf(op, instant("2026-10-22T00:00:00Z"), "2026")).toBe(false);
		expect(leaf(op, null, "a")).toBe(false);
		expect(leaf(op, "abc", "")).toBe(false);
		expect(leaf(op, "abc", 1)).toBe(false);
		expect(leaf(op, "abc")).toBe(false);
	});
});

describe("beforeToday / onOrAfterToday", () => {
	const both = (cell: ColumnValue, today?: string, offset?: TimeZoneOffset) => [
		leaf("beforeToday", cell, undefined, today, offset),
		leaf("onOrAfterToday", cell, undefined, today, offset),
	];

	it.each([
		["2026-10-21", [true, false]],
		["2026-10-22", [false, true]],
		["2026-10-23", [false, true]],
		["2025-12-31", [true, false]],
	])("date-only %p, today %s", (cell, expected) => {
		expect(both(cell)).toEqual(expected);
	});

	it("date-only cells are never shifted, whatever the offset", () => {
		expect(both("2026-10-21", TODAY, -720)).toEqual([true, false]);
		expect(both("2026-10-21", TODAY, 840)).toEqual([true, false]);
	});

	describe("date-and-time cells use the user's local date (around midnight)", () => {
		it.each([
			// UTC+10: local midnight 22 Oct is 2026-10-21T14:00Z.
			["2026-10-21T13:59:59.999Z", AEST, [true, false]],
			["2026-10-21T14:00:00.000Z", AEST, [false, true]],
			// UTC−5: local midnight 22 Oct is 2026-10-22T05:00Z.
			["2026-10-22T04:59:59Z", -300, [true, false]],
			["2026-10-22T05:00:00Z", -300, [false, true]],
			// UTC.
			["2026-10-21T23:59:59Z", 0, [true, false]],
			["2026-10-22T00:00:00Z", 0, [false, true]],
		])("%s at offset %p", (iso, offset, expected) => {
			expect(both(instant(iso), TODAY, offset)).toEqual(expected);
		});

		it("the same instant can be before today in one time zone and not in another", () => {
			const cell = instant("2026-10-21T20:00:00Z");
			expect(both(cell, TODAY, AEST)).toEqual([false, true]); // 22 Oct 6 AM
			expect(both(cell, TODAY, -300)).toEqual([true, false]); // 21 Oct 3 PM
		});

		it("asks an offset function for the offset at each instant", () => {
			const offset = jest.fn(() => 660);
			const cell = instant("2026-10-21T13:30:00Z");
			expect(both(cell, TODAY, offset)).toEqual([false, true]); // 22 Oct 0:30 at UTC+11
			expect(offset).toHaveBeenCalledWith(cell);
		});
	});

	it("is false for non-dates, empty cells, an invalid today, or a broken offset", () => {
		expect(both(5)).toEqual([false, false]);
		expect(both("hello")).toEqual([false, false]);
		expect(both(true)).toEqual([false, false]);
		expect(both(null)).toEqual([false, false]);
		expect(both("2026-10-21", "22/10/2026")).toEqual([false, false]);
		expect(both("2026-10-21", "")).toEqual([false, false]);
		expect(both(instant("2026-10-21T19:48:00Z"), TODAY, NaN)).toEqual([false, false]);
	});
});

describe("olderThanDays", () => {
	it.each([
		["2026-10-18", 3, true], // 4 days ago
		["2026-10-19", 3, false], // exactly 3 days ago
		["2026-10-21", 0, true], // 0 is the same as beforeToday
		["2026-10-22", 0, false],
		["2026-09-22", 29, true],
		["2026-12-01", 0, false],
	])("%p older than %p days → %p", (cell, days, expected) => {
		expect(leaf("olderThanDays", cell, days)).toBe(expected);
	});

	it("counts date-and-time cells in the user's local days", () => {
		// 2026-10-18T14:00Z is 19 Oct at UTC+10 (3 days ago) but 18 Oct at UTC (4 days ago).
		expect(leaf("olderThanDays", instant("2026-10-18T14:00:00Z"), 3, TODAY, AEST)).toBe(false);
		expect(leaf("olderThanDays", instant("2026-10-18T14:00:00Z"), 3, TODAY, 0)).toBe(true);
	});

	it("counts across month and year ends", () => {
		expect(leaf("olderThanDays", "2026-12-30", 2, "2027-01-02")).toBe(true);
		expect(leaf("olderThanDays", "2026-12-31", 2, "2027-01-02")).toBe(false);
	});

	it.each([[-1], [1.5], ["3"], [undefined], [NaN]])("a bad day count %p → false", (days) => {
		expect(leaf("olderThanDays", "2020-01-01", days)).toBe(false);
	});
});

describe("withinNextDays", () => {
	it.each([
		["2026-10-22", 0, true], // today
		["2026-10-23", 0, false],
		["2026-10-22", 7, true],
		["2026-10-29", 7, true],
		["2026-10-30", 7, false],
		["2026-10-21", 7, false], // yesterday
	])("%p within the next %p days → %p", (cell, days, expected) => {
		expect(leaf("withinNextDays", cell, days)).toBe(expected);
	});

	it("counts date-and-time cells in the user's local days", () => {
		// 2026-10-29T14:00Z is 30 Oct at UTC+10 (8 days away) but 29 Oct at UTC (7 days away).
		expect(leaf("withinNextDays", instant("2026-10-29T14:00:00Z"), 7, TODAY, AEST)).toBe(false);
		expect(leaf("withinNextDays", instant("2026-10-29T14:00:00Z"), 7, TODAY, 0)).toBe(true);
	});

	it.each([[-1], [0.5], [null]])("a bad day count %p → false", (days) => {
		expect(leaf("withinNextDays", "2026-10-22", days)).toBe(false);
	});

	it("is false for non-dates and empty cells", () => {
		expect(leaf("withinNextDays", 5, 7)).toBe(false);
		expect(leaf("withinNextDays", null, 7)).toBe(false);
	});
});

describe("containsAny / containsAll", () => {
	const tags = [948790000, 948790001];

	it.each([
		["containsAny", [948790001], true],
		["containsAny", [948790001, 948790009], true],
		["containsAny", [948790009], false],
		["containsAll", [948790000, 948790001], true],
		["containsAll", [948790001], true],
		["containsAll", [948790001, 948790009], false],
	])("%s %p → %p", (op, value, expected) => {
		expect(leaf(op, tags, value)).toBe(expected);
	});

	it.each(["containsAny", "containsAll"])("%s is false for non-multi-select cells and bad operands", (op) => {
		expect(leaf(op, null, [1])).toBe(false);
		expect(leaf(op, 948790000, [948790000])).toBe(false);
		expect(leaf(op, "948790000", [948790000])).toBe(false);
		expect(leaf(op, tags, [])).toBe(false);
		expect(leaf(op, tags, 948790000)).toBe(false);
		expect(leaf(op, tags, ["948790000"])).toBe(false);
	});
});

describe("groups", () => {
	const yes = { column: "n", op: "eq", value: 1 };
	const no = { column: "n", op: "eq", value: 2 };
	const hidden = { column: "missing", op: "isNull" };
	const row = { n: 1 };

	it("all is true only when every item is", () => {
		expect(check({ all: [yes, yes] }, row)).toBe(true);
		expect(check({ all: [yes, no] }, row)).toBe(false);
		expect(check({ all: [yes] }, row)).toBe(true);
	});

	it("any is true when at least one item is", () => {
		expect(check({ any: [no, yes] }, row)).toBe(true);
		expect(check({ any: [no, no] }, row)).toBe(false);
	});

	it("not inverts", () => {
		expect(check({ not: yes }, row)).toBe(false);
		expect(check({ not: no }, row)).toBe(true);
		expect(check({ not: { not: yes } }, row)).toBe(true);
	});

	it("a column that isn't in the view is a false leaf in ordinary boolean logic", () => {
		expect(check(hidden, row)).toBe(false);
		expect(check({ any: [hidden, yes] }, row)).toBe(true);
		expect(check({ all: [hidden, yes] }, row)).toBe(false);
		expect(check({ not: hidden }, row)).toBe(true);
	});

	it("an unknown operator is a false leaf", () => {
		const unknown = { column: "n", op: "like", value: 1 };
		expect(check(unknown, row)).toBe(false);
		expect(check({ any: [unknown, yes] }, row)).toBe(true);
		expect(check({ not: unknown }, row)).toBe(true);
	});

	it("nests to the depth the schema allows (5 levels)", () => {
		const five = { all: [{ any: [no, { not: { all: [yes] } }] }] };
		expect(check(five, row)).toBe(false);
		const fiveTrue = { all: [{ any: [no, { not: { all: [no] } }] }] };
		expect(check(fiveTrue, row)).toBe(true);
	});

	it.each([
		["nested deeper than 5 levels", { all: [{ any: [{ not: { all: [{ not: no }] } }] }] }],
		["an empty all", { all: [] }],
		["an empty any", { any: [] }],
		["a group that isn't an array", { all: yes }],
		["a non-object item", { any: [null, yes] }],
		["not of a malformed group", { not: { all: [] } }],
		["not of nothing", { not: undefined }],
		["a non-object condition", "always"],
		["null", null],
	])("%s makes the whole condition false", (_, condition) => {
		expect(check(condition, row)).toBe(false);
	});

	it("a leaf without a string column is false", () => {
		expect(check({ op: "isNull" }, row)).toBe(false);
		expect(check({ column: 1, op: "isNull" }, row)).toBe(false);
	});
});

describe("evaluate never throws", () => {
	it("returns false when getColumn throws", () => {
		const getColumn = () => {
			throw new Error("boom");
		};
		expect(evaluate({ column: "a", op: "isNull" }, getColumn, TODAY, AEST)).toBe(false);
	});

	it("returns false when the offset function throws", () => {
		const offset = () => {
			throw new Error("boom");
		};
		expect(leaf("beforeToday", instant("2026-10-21T00:00:00Z"), undefined, TODAY, offset)).toBe(false);
	});
});

describe("against the captured rowData and the example config", () => {
	interface Fixture {
		colDefs: ColumnTypeInfo[];
		rows: Record<string, unknown>[];
	}
	const read = <T>(...path: string[]) => JSON.parse(readFileSync(join(__dirname, "..", ...path), "utf8")) as T;
	const fixture = read<Fixture>("tests", "fixtures", "rowdata.wb_gridspike.json");
	const combined = read<TableConfig>("config", "examples", "combined.json");
	const rule = (id: string): Condition => {
		const when = combined.rules.find((r) => r.id === id)?.when;
		if (!when) throw new Error(`combined.json has no rule ${id} with a condition`);
		return when;
	};
	const [row1, row2] = fixture.rows.map((row) => columnReader(row, fixture.colDefs));

	it("inactive-grey: both rows are active", () => {
		expect(evaluate(rule("inactive-grey"), row1, TODAY, AEST)).toBe(false);
		expect(evaluate(rule("inactive-grey"), row2, TODAY, AEST)).toBe(false);
	});

	it("rag-row: both rows have a RAG status", () => {
		expect(evaluate(rule("rag-row"), row1, TODAY, AEST)).toBe(true);
	});

	it("overdue: row 1 is Amber and past due; row 2 is Green", () => {
		expect(evaluate(rule("overdue"), row1, TODAY, AEST)).toBe(true);
		expect(evaluate(rule("overdue"), row2, TODAY, AEST)).toBe(false);
		// On 18 Oct row 1 isn't overdue yet.
		expect(evaluate(rule("overdue"), row1, "2026-10-18", AEST)).toBe(false);
	});

	it("over budget: row 2 spent more than its budget", () => {
		const overBudget: Condition = { column: "wb_actualcost", op: "gt", value: { column: "wb_budget" } };
		expect(evaluate(overBudget, row1, TODAY, AEST)).toBe(false);
		expect(evaluate(overBudget, row2, TODAY, AEST)).toBe(true);
	});

	it("reviewed on (date and time) is 22 Oct for row 1 at UTC+10, 21 Oct at UTC", () => {
		const reviewedToday: Condition = { column: "wb_reviewedon", op: "eq", value: TODAY };
		expect(evaluate(reviewedToday, row1, TODAY, AEST)).toBe(true);
		expect(evaluate(reviewedToday, row1, TODAY, 0)).toBe(false);
	});

	it("owner by GUID, tags and choice values", () => {
		const mine: Condition = {
			all: [
				{ column: "ownerid", op: "eq", value: "64A20861-7FDD-F011-8406-7CED8D70A9F0" },
				{ column: "wb_tags", op: "containsAny", value: [948790001] },
				{ column: "statuscode", op: "in", value: [1, 2] },
				{ column: "wb_flagged", op: "eq", value: false },
				{ column: "wb_parentid", op: "isNull" },
				{ column: "wb_name", op: "startsWith", value: "SPIKE" },
			],
		};
		expect(evaluate(mine, row1, TODAY, AEST)).toBe(true);
		expect(evaluate(mine, row2, TODAY, AEST)).toBe(false);
	});

	it("a column that isn't in the view never matches", () => {
		expect(evaluate({ column: "wb_hidden", op: "isNull" }, row1, TODAY, AEST)).toBe(false);
	});
});

describe("referencedColumns", () => {
	it("lists a leaf's column", () => {
		expect(referencedColumns({ column: "statecode", op: "eq", value: 1 })).toEqual(["statecode"]);
	});

	it("lists every column in nested groups and column operands, once each, in order", () => {
		const condition: Condition = {
			all: [
				{ column: "wb_duedate", op: "beforeToday" },
				{ not: { column: "wb_ragstatus", op: "eq", value: GREEN } },
				{
					any: [
						{ column: "wb_actualcost", op: "gt", value: { column: "wb_budget" } },
						{ column: "wb_ragstatus", op: "isNull" },
						{ column: "a_1.wb_name", op: "contains", value: "x" },
					],
				},
			],
		};
		expect(referencedColumns(condition)).toEqual([
			"wb_duedate",
			"wb_ragstatus",
			"wb_actualcost",
			"wb_budget",
			"a_1.wb_name",
		]);
	});

	it("returns nothing for an omitted condition", () => {
		expect(referencedColumns(undefined)).toEqual([]);
	});

	it("ignores malformed parts", () => {
		const malformed = {
			all: [null, { column: 1, op: "eq" }, { any: "x" }, { column: "ok", op: "eq", value: { column: 2 } }],
		};
		expect(referencedColumns(malformed as unknown as Condition)).toEqual(["ok"]);
	});

	it("stops below the deepest level the schema allows", () => {
		const level5 = [{ column: "five", op: "isNull" }, { all: [{ column: "six", op: "isNull" }] }];
		const deep = { all: [{ all: [{ all: [{ all: level5 }] }] }] };
		expect(referencedColumns(deep as unknown as Condition)).toEqual(["five"]);
	});
});
