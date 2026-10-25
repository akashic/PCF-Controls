import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	CLEAR_CONTAINER,
	PLAIN_CELL,
	applyContainerStyle,
	cellContent,
	containerStyle,
	createCellFormatter,
	createDayTracker,
	gridColumns,
	type CellParams,
	type FormatterOptions,
} from "../GridFormatter/engine/cellFormatter";
import * as conditions from "../GridFormatter/engine/conditions";
import type { Rule, TableConfig } from "../GridFormatter/engine/configSchema";
import type { CellStyle } from "../GridFormatter/engine/resolveStyle";
import { createWarnOnce } from "../GridFormatter/engine/warnings";
import { AMBER, ragColours } from "./engineHelpers";

const AEST = 600; // UTC+10, as in the spike
/** 22 Oct 2026, 12:00 at UTC+10. */
const NOON_22_OCT = Date.parse("2026-10-22T02:00:00Z");

const colDefs = [
	{ name: "wb_name", dataType: "Text", isPrimary: true },
	{ name: "wb_ragstatus", dataType: "OptionSet", isPrimary: false },
	{ name: "wb_duedate", dataType: "DateOnly", isPrimary: false, customizerParams: { timeZoneIndependent: true } },
	{ name: "ownerid", dataType: "Persona", isPrimary: false },
];
const col = (name: string): number => colDefs.findIndex((c) => c.name === name);

const row = (values: Record<string, unknown> = {}): Record<string, unknown> => ({
	__rec_id: "row-1",
	wb_name: "Row 1",
	wb_ragstatus: String(AMBER),
	wb_duedate: "2026-10-18T00:00:00.000Z",
	ownerid: { id: { guid: "00000000-0000-0000-0000-000000000001" }, etn: "systemuser", name: "Someone" },
	...values,
});

const config = (...rules: Rule[]): TableConfig => ({ version: 1, rules });

const overdue: Rule = {
	id: "overdue",
	when: { column: "wb_duedate", op: "beforeToday" },
	style: { color: "#C50F1F", fontWeight: "bold" },
};
const ragRow: Rule = {
	id: "rag-row",
	when: { column: "wb_ragstatus", op: "isNotNull" },
	scope: "row",
	style: { backgroundColor: { fromOption: "wb_ragstatus" }, fontStyle: "italic" },
};

function formatter(options: Partial<FormatterOptions> & { rules?: Rule[] } = {}) {
	const warnings: string[] = [];
	const debug: string[] = [];
	const f = createCellFormatter({
		config: config(...(options.rules ?? [ragRow, overdue])),
		optionColours: ragColours,
		offset: AEST,
		now: () => NOON_22_OCT,
		warn: (m) => warnings.push(m),
		...options,
	});
	return { f, warnings, debug };
}

const cell = (column: string, rowData: unknown = row(), formattedValue = "text"): CellParams => ({
	colDefs,
	columnIndex: col(column),
	rowData,
	formattedValue,
});

const AMBER_LAYER = "linear-gradient(rgba(255, 185, 0, 0.18), rgba(255, 185, 0, 0.18))";

describe("containerStyle (V6/V7)", () => {
	it("clears everything for an unstyled cell", () => {
		expect(containerStyle(undefined)).toEqual({ backgroundImage: "", fontStyle: "", textDecoration: "" });
		expect(containerStyle({ customRender: true, color: "#000000" })).toEqual(CLEAR_CONTAINER);
	});

	it("puts the background in a background-image layer and keeps font style and decoration", () => {
		const style: CellStyle = { backgroundColor: "rgba(1, 2, 3, 0.5)", fontStyle: "italic", textDecoration: "line-through", customRender: false };
		expect(containerStyle(style)).toEqual({
			backgroundImage: "linear-gradient(rgba(1, 2, 3, 0.5), rgba(1, 2, 3, 0.5))",
			fontStyle: "italic",
			textDecoration: "line-through",
		});
	});
});

describe("applyContainerStyle", () => {
	it("sets and then clears exactly the managed properties", () => {
		const element = { style: { backgroundImage: "", fontStyle: "", textDecoration: "", color: "red", backgroundColor: "blue", padding: "4px" } };
		applyContainerStyle(element, { backgroundImage: "linear-gradient(red, red)", fontStyle: "italic", textDecoration: "underline" });
		expect(element.style).toEqual({
			backgroundImage: "linear-gradient(red, red)",
			fontStyle: "italic",
			textDecoration: "underline",
			color: "red",
			backgroundColor: "blue",
			padding: "4px",
		});
		applyContainerStyle(element, CLEAR_CONTAINER);
		expect(element.style).toEqual({ backgroundImage: "", fontStyle: "", textDecoration: "", color: "red", backgroundColor: "blue", padding: "4px" });
	});

	it("does nothing without a container", () => {
		expect(() => applyContainerStyle(undefined, CLEAR_CONTAINER)).not.toThrow();
		expect(() => applyContainerStyle(null, CLEAR_CONTAINER)).not.toThrow();
	});
});

describe("cellContent", () => {
	const text = { name: "wb_notes", dataType: "Text" };
	const pill = { backgroundColor: "#FFB900", color: "#000000" } as CellStyle["pill"];

	it("lets the grid draw cells that don't need drawing", () => {
		expect(cellContent(undefined, text, "x")).toEqual({ kind: "grid" });
		expect(cellContent({ customRender: false, fontStyle: "italic" }, text, "x")).toEqual({ kind: "grid" });
	});

	it("never draws the primary name or a type it can't draw", () => {
		const style: CellStyle = { customRender: true, color: "#C50F1F" };
		expect(cellContent(style, { name: "wb_name", dataType: "Text", isPrimary: true }, "x")).toEqual({ kind: "grid" });
		expect(cellContent(style, { name: "wb_parentid", dataType: "Lookup" }, "x")).toEqual({ kind: "grid" });
	});

	it("lets the grid draw an empty cell", () => {
		const style: CellStyle = { customRender: true, color: "#C50F1F" };
		expect(cellContent(style, text, "")).toEqual({ kind: "grid" });
		expect(cellContent(style, text, undefined)).toEqual({ kind: "grid" });
	});

	it("draws text with colour and weight", () => {
		expect(cellContent({ customRender: true, color: "#C50F1F", fontWeight: 700 }, text, "x")).toEqual({ kind: "text", color: "#C50F1F", fontWeight: 700 });
	});

	it("draws a pill, with the rule's weight", () => {
		expect(cellContent({ customRender: true, pill, fontWeight: 700 }, text, "x")).toEqual({ kind: "pill", pill, fontWeight: 700 });
	});
});

describe("gridColumns", () => {
	it("keeps well-formed colDefs entries", () => {
		expect(gridColumns([{ name: "a", dataType: "Text", isPrimary: true }, { name: "b", dataType: "Integer" }, null, { name: 1, dataType: "Text" }, { name: "c" }])).toEqual([
			{ name: "a", dataType: "Text", isPrimary: true },
			{ name: "b", dataType: "Integer", isPrimary: false },
		]);
		expect(gridColumns("x" as unknown as unknown[])).toEqual([]);
	});
});

describe("createDayTracker", () => {
	it("is the user's local date", () => {
		expect(createDayTracker(AEST, () => Date.parse("2026-10-22T13:59:59Z")).today()).toBe("2026-10-22");
		expect(createDayTracker(AEST, () => Date.parse("2026-10-22T14:00:00Z")).today()).toBe("2026-10-23");
		expect(createDayTracker(-300, () => Date.parse("2026-10-22T02:00:00Z")).today()).toBe("2026-10-21");
	});

	it("only works the date out again at local midnight (or after an hour)", () => {
		let now = Date.parse("2026-10-22T13:30:00Z"); // 23:30 at UTC+10
		const offset = jest.fn((_instant: Date) => AEST);
		const tracker = createDayTracker(offset, () => now);
		expect(tracker.today()).toBe("2026-10-22");
		const calls = offset.mock.calls.length;
		now = Date.parse("2026-10-22T13:59:59.999Z");
		expect(tracker.today()).toBe("2026-10-22");
		expect(offset.mock.calls.length).toBe(calls);
		now = Date.parse("2026-10-22T14:00:00Z");
		expect(tracker.today()).toBe("2026-10-23");
	});

	it("checks at least hourly, so a daylight-saving change is picked up", () => {
		let now = Date.parse("2026-10-22T02:00:00Z");
		const offset = jest.fn((_instant: Date) => AEST);
		const tracker = createDayTracker(offset, () => now);
		tracker.today();
		const calls = offset.mock.calls.length;
		now += 60 * 60_000;
		tracker.today();
		expect(offset.mock.calls.length).toBeGreaterThan(calls);
	});

	it("is empty when the offset can't be read, and tries again a minute later", () => {
		let now = NOON_22_OCT;
		let broken = true;
		const tracker = createDayTracker(
			() => {
				if (broken) throw new Error("no settings");
				return AEST;
			},
			() => now,
		);
		expect(tracker.today()).toBe("");
		broken = false;
		now += 59_000;
		expect(tracker.today()).toBe("");
		now += 1_000;
		expect(tracker.today()).toBe("2026-10-22");
	});

	it("looks again in a minute when midnight can't be estimated or has already passed", () => {
		let now = NOON_22_OCT;
		const results: number[] = [AEST, Number.NaN];
		const unreadable = createDayTracker(() => results.shift() ?? AEST, () => now);
		expect(unreadable.today()).toBe("2026-10-22");
		now += 60_000;
		expect(unreadable.today()).toBe("2026-10-22");
		expect(results).toEqual([]);

		// An estimate before now (a huge offset at midnight, read twice): still checks a minute later, not on every call.
		now = NOON_22_OCT;
		const offsets = [AEST, 2000, 2000];
		const offset = jest.fn(() => offsets.shift() ?? AEST);
		const past = createDayTracker(offset, () => now);
		past.today();
		past.today();
		expect(offset).toHaveBeenCalledTimes(3);
	});

	it("finds midnight exactly on the night daylight saving starts", () => {
		// Sydney: AEST (UTC+10) until 02:00 on 4 Oct 2026 (16:00 UTC on 3 Oct), then AEDT (UTC+11).
		const change = Date.parse("2026-10-03T16:00:00Z");
		const offset = jest.fn((instant: Date) => (instant.getTime() < change ? 600 : 660));
		let now = Date.parse("2026-10-03T13:30:00Z"); // 23:30 AEST on 3 Oct
		const tracker = createDayTracker(offset, () => now);
		expect(tracker.today()).toBe("2026-10-03");
		const calls = offset.mock.calls.length;
		// Midnight is still AEST, so 14:00 UTC. A one-pass estimate (the offset at 00:00 UTC on 4 Oct, AEDT) said 13:00.
		now = Date.parse("2026-10-03T13:59:59.999Z");
		expect(tracker.today()).toBe("2026-10-03");
		expect(offset.mock.calls.length).toBe(calls);
		now = Date.parse("2026-10-03T14:00:00Z");
		expect(tracker.today()).toBe("2026-10-04");
	});

	it.each([
		["throws", (): number => {
			throw new Error("no settings");
		}],
		["isn't a number", (): number => "600" as unknown as number],
	])("looks again in a minute when the offset at midnight %s", (_label, atMidnight) => {
		let now = NOON_22_OCT;
		let calls = 0;
		const tracker = createDayTracker(() => (++calls === 1 ? AEST : atMidnight()), () => now);
		expect(tracker.today()).toBe("2026-10-22");
		now += 59_000;
		tracker.today();
		expect(calls).toBe(2);
		now += 1_000;
		tracker.today(); // recomputed (the offset now fails every time, so today is unknown)
		expect(calls).toBe(3);
	});

	it("uses the real clock by default", () => {
		expect(createDayTracker(0).today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe("createCellFormatter", () => {
	it("draws the plain grid with no config or no rules", () => {
		expect(createCellFormatter({ config: null, offset: AEST }).format(cell("wb_ragstatus"))).toBe(PLAIN_CELL);
		expect(createCellFormatter({ config: config(), offset: AEST }).format(cell("wb_ragstatus"))).toBe(PLAIN_CELL);
	});

	it("styles the container and draws only the cells that need it", () => {
		const { f, warnings } = formatter();
		expect(f.format(cell("wb_name"))).toEqual({ container: { backgroundImage: AMBER_LAYER, fontStyle: "italic", textDecoration: "" }, content: { kind: "grid" } });
		expect(f.format(cell("wb_duedate"))).toEqual({
			container: { backgroundImage: AMBER_LAYER, fontStyle: "italic", textDecoration: "" },
			content: { kind: "text", color: "#C50F1F", fontWeight: 700 },
		});
		expect(f.format(cell("ownerid")).content).toEqual({ kind: "grid" });
		expect(warnings).toEqual([]);
	});

	it("clears the container for a row no rule matches", () => {
		const { f } = formatter();
		expect(f.format(cell("wb_duedate", row({ wb_ragstatus: null, wb_duedate: null })))).toEqual(PLAIN_CELL);
	});

	it.each([
		["a loading row with no rowData", { colDefs, columnIndex: 1 }],
		["rowData that isn't an object", { colDefs, columnIndex: 1, rowData: "x" }],
		["a column index outside colDefs", { colDefs, columnIndex: 99, rowData: row() }],
		["colDefs that isn't an array", { colDefs: "x" as unknown as unknown[], columnIndex: 0, rowData: row() }],
		["a malformed column", { colDefs: [{ dataType: "Text" }], columnIndex: 0, rowData: row() }],
	])("draws the plain grid for %s", (_label, params) => {
		const { f } = formatter();
		expect(f.format(params)).toBe(PLAIN_CELL);
	});

	it("draws the plain grid when no rule applies to this view (V2)", () => {
		const { f } = formatter();
		const nameOnly = [colDefs[0]];
		expect(f.format({ colDefs: nameOnly, columnIndex: 0, rowData: { __rec_id: "r", wb_name: "x" } })).toBe(PLAIN_CELL);
	});

	it("prepares rules once per column set, even when the grid passes a new colDefs array", () => {
		// A row-scoped colour warns once per column it can't draw (V7), each time rules are prepared.
		const { f, warnings } = formatter({ rules: [{ id: "grey", scope: "row", style: { color: "#616161" } }] });
		f.format(cell("wb_name"));
		f.format(cell("wb_ragstatus"));
		f.format({ ...cell("wb_name"), colDefs: colDefs.map((c) => ({ ...c })) });
		expect(warnings).toHaveLength(2); // wb_name (primary) and ownerid (Persona)
		f.format({ ...cell("wb_name"), colDefs: [...colDefs].reverse(), columnIndex: 3 });
		expect(warnings).toHaveLength(4);
	});

	it("keeps a bounded number of column sets", () => {
		const { f, warnings } = formatter({ rules: [{ id: "grey", scope: "row", style: { color: "#616161" } }] });
		const sets = Array.from({ length: 10 }, (_, i) => [{ name: `c${i}`, dataType: "Lookup", isPrimary: false }]);
		for (const set of sets) f.format({ colDefs: set, columnIndex: 0, rowData: { __rec_id: "r" } });
		expect(warnings).toHaveLength(10);
		f.format({ colDefs: sets[0].map((c) => ({ ...c })), columnIndex: 0, rowData: { __rec_id: "r" } });
		expect(warnings).toHaveLength(11); // evicted, so prepared again
	});

	it("re-evaluates date rules after the user's local midnight", () => {
		let now = Date.parse("2026-10-22T13:59:00Z"); // 23:59 on 22 Oct at UTC+10
		const { f } = formatter({ now: () => now, rules: [overdue] });
		const dueToday = cell("wb_duedate", row({ wb_duedate: "2026-10-22T00:00:00.000Z" }));
		expect(f.format(dueToday).content).toEqual({ kind: "grid" });
		now = Date.parse("2026-10-22T14:00:00Z"); // 00:00 on 23 Oct
		expect(f.format(dueToday).content).toEqual({ kind: "text", color: "#C50F1F", fontWeight: 700 });
	});

	it("memoises per row and its referenced values", () => {
		const evaluate = jest.spyOn(conditions, "evaluate");
		const { f } = formatter();
		f.format(cell("wb_duedate"));
		const afterFirst = evaluate.mock.calls.length;
		expect(afterFirst).toBe(2);
		f.format(cell("wb_duedate"));
		f.format(cell("wb_ragstatus"));
		expect(evaluate).toHaveBeenCalledTimes(afterFirst);
		f.format(cell("wb_ragstatus", row({ wb_duedate: "2026-10-30T00:00:00.000Z" })));
		expect(evaluate).toHaveBeenCalledTimes(afterFirst + 2);
		evaluate.mockRestore();
	});

	it("treats a column in colDefs but missing from rowData as not visible (V2)", () => {
		const { f } = formatter();
		const { wb_ragstatus: _ignored, ...noRag } = row();
		expect(f.format(cell("wb_duedate", noRag))).toEqual({ container: CLEAR_CONTAINER, content: { kind: "text", color: "#C50F1F", fontWeight: 700 } });
	});

	it("matches no condition on a value it can't read, and warns once for that column", () => {
		const warnings: string[] = [];
		const { f } = formatter({
			warn: createWarnOnce((m) => warnings.push(m)),
			rules: [
				{ id: "no-rag", when: { column: "wb_ragstatus", op: "isNull" }, scope: "row", style: { fontStyle: "italic" } },
				{ id: "not-amber", when: { not: { column: "wb_ragstatus", op: "eq", value: AMBER } }, scope: "row", style: { textDecoration: "underline" } },
			],
		});
		const garbled = row({ wb_ragstatus: "Amber" }); // a label, not an option value
		expect(f.format(cell("wb_name", garbled))).toEqual(PLAIN_CELL);
		expect(f.format(cell("wb_duedate", row({ __rec_id: "row-2", wb_ragstatus: "Red" })))).toEqual(PLAIN_CELL);
		expect(warnings).toEqual([
			'column "wb_ragstatus" (OptionSet) has a value the control can\'t read; conditions on it don\'t match, not even isNull or inside "not".',
		]);
		// An empty cell is different, and the row cache doesn't mix the two up.
		expect(f.format(cell("wb_name", row({ wb_ragstatus: null }))).container).toEqual({ backgroundImage: "", fontStyle: "italic", textDecoration: "underline" });
		expect(f.format(cell("wb_name", garbled))).toEqual(PLAIN_CELL);
	});

	it("works without a __rec_id", () => {
		const { f } = formatter();
		const { __rec_id: _ignored, ...noId } = row();
		expect(f.format(cell("wb_duedate", noId)).content.kind).toBe("text");
	});

	it("logs matched rules once per row when debugging", () => {
		const debug: string[] = [];
		const { f } = formatter({ debug: (m) => debug.push(m) });
		f.format(cell("wb_name"));
		f.format(cell("wb_duedate"));
		f.format(cell("wb_name", row({ __rec_id: "row-2", wb_ragstatus: null, wb_duedate: null })));
		f.format(cell("wb_name", row({ wb_duedate: null })));
		expect(debug).toEqual(["row row-1: matched rag-row, overdue", "row row-2: no rules matched", "row row-1: matched rag-row"]);
	});

	it("keeps the debug log's memory bounded", () => {
		const debug: string[] = [];
		const { f } = formatter({ debug: (m) => debug.push(m) });
		for (let i = 0; i <= 5000; i++) f.format(cell("wb_name", row({ __rec_id: `r${i}` })));
		f.format(cell("wb_name", row({ __rec_id: "r0" })));
		expect(debug).toHaveLength(5002);
	});

	it("never throws: a failure draws the plain grid cell with a warning", () => {
		const { f, warnings } = formatter();
		const rowData = {
			get __rec_id(): string {
				throw new Error("boom");
			},
			wb_ragstatus: "1",
		};
		expect(f.format(cell("wb_ragstatus", rowData))).toBe(PLAIN_CELL);
		expect(warnings).toEqual(["a cell couldn't be formatted, so it's drawn as normal (Error: boom)."]);
	});

	describe("date behaviours (V11)", () => {
		const behaviours = JSON.parse(readFileSync(join(__dirname, "fixtures", "rowdata.date-behaviours.json"), "utf8")) as {
			colDefs: { name: string; dataType: string; isPrimary: boolean; customizerParams?: unknown }[];
			rows: Record<string, unknown>[];
			user: { timeZoneOffsetMinutes: number };
		};
		const AEDT = behaviours.user.timeZoneOffsetMinutes; // 660
		const NOON_22_OCT_AEDT = Date.parse("2026-10-22T01:00:00Z");
		const rows = behaviours.rows.map((r, i) => ({ __rec_id: `row-0${i + 1}`, ...r }));
		const italicIf = (id: string, when: Rule["when"]): Rule => ({ id, when, scope: "row", style: { fontStyle: "italic" } });
		const fontStyle = (f: ReturnType<typeof createCellFormatter>, rowData: unknown, defs: readonly unknown[] = behaviours.colDefs): string =>
			f.format({ colDefs: defs, columnIndex: 0, rowData, formattedValue: "x" }).container.fontStyle;
		const at = (rules: Rule[], warn: (m: string) => void = () => undefined) =>
			createCellFormatter({ config: config(...rules), offset: AEDT, now: () => NOON_22_OCT_AEDT, warn });
		/** The captured colDefs without customizerParams, as if the platform stopped sending it. */
		const withoutBehaviours = behaviours.colDefs.map(({ customizerParams: _ignored, ...def }) => def);

		it.each([
			// [rule, row 01, row 02, row 03], as the user sees the rows: start 21/22/23 Oct, meeting 21/22/23 Oct 9:00 PM.
			["User Local date-only eq today", { column: "wb_startdate", op: "eq", value: "2026-10-22" }, ["", "italic", ""]],
			["User Local date-only beforeToday", { column: "wb_startdate", op: "beforeToday" }, ["italic", "", ""]],
			["Time Zone Independent beforeToday", { column: "wb_meetingat", op: "beforeToday" }, ["italic", "", ""]],
			["Time Zone Independent eq a date", { column: "wb_meetingat", op: "eq", value: "2026-10-23" }, ["", "", "italic"]],
			["Time Zone Independent eq a zone-less time", { column: "wb_meetingat", op: "eq", value: "2026-10-22T21:00" }, ["", "italic", ""]],
			["Time Zone Independent withinNextDays 0", { column: "wb_meetingat", op: "withinNextDays", value: 0 }, ["", "italic", ""]],
			["Time Zone Independent against User Local date-only", { column: "wb_meetingat", op: "eq", value: { column: "wb_startdate" } }, ["italic", "italic", "italic"]],
		] as [string, Rule["when"], string[]][])("%s matches the rows the user would expect", (_label, when, expected) => {
			const warnings: string[] = [];
			const f = at([italicIf("r", when)], (m) => warnings.push(m));
			expect(rows.map((r) => fontStyle(f, r))).toEqual(expected);
			expect(warnings).toEqual([]);
		});

		it("reads Date Only and User Local date-and-time columns as before", () => {
			const f = at([
				italicIf("due", { column: "wb_duedate", op: "eq", value: "2026-10-18" }),
				{ id: "reviewed", when: { column: "wb_reviewedon", op: "eq", value: "2026-10-22" }, scope: "row", style: { textDecoration: "underline" } },
			]);
			expect(f.format({ colDefs: behaviours.colDefs, columnIndex: 0, rowData: rows[0], formattedValue: "x" }).container).toEqual({
				backgroundImage: "",
				fontStyle: "italic",
				textDecoration: "underline",
			});
		});

		it("without customizerParams, reads dates as before and warns once per date column it reads", () => {
			const warnings: string[] = [];
			const f = at(
				[italicIf("start", { column: "wb_startdate", op: "eq", value: "2026-10-21" }), italicIf("meeting", { column: "wb_meetingat", op: "isNull" })],
				createWarnOnce((m) => warnings.push(m)),
			);
			// Read the old way: row 02's start (22 Oct for the user) as 21 Oct.
			expect(rows.map((r) => fontStyle(f, r, withoutBehaviours))).toEqual(["", "italic", ""]);
			expect(warnings).toEqual([
				'column "wb_startdate" (DateOnly): the grid didn\'t say its date behaviour, so it\'s read as Date Only; if it\'s User Local, date rules on it can be a day out.',
				'column "wb_meetingat" (DateAndTime): the grid didn\'t say its date behaviour, so it\'s read as User Local; if it\'s Time Zone Independent, date rules on it can be out by the user\'s time-zone offset.',
			]);
		});

		it("keeps column sets that differ only in a date behaviour apart", () => {
			const f = at([italicIf("start", { column: "wb_startdate", op: "eq", value: "2026-10-22" })]);
			expect(fontStyle(f, rows[1])).toBe("italic");
			expect(fontStyle(f, rows[1], withoutBehaviours)).toBe("");
			const flipped = behaviours.colDefs.map((d) => (d.name === "wb_startdate" ? { ...d, customizerParams: { timeZoneIndependent: true } } : d));
			expect(fontStyle(f, rows[1], flipped)).toBe("");
			expect(fontStyle(f, rows[1])).toBe("italic");
		});
	});

	it("warns to the console by default", () => {
		const spy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
		const f = createCellFormatter({ config: config({ id: "c", scope: "row", style: { color: "#000000" } }), offset: AEST });
		f.format(cell("wb_name"));
		expect(spy).toHaveBeenCalledWith(expect.stringMatching(/^\[GridFormatter\] rule "c": color can't be shown on column "wb_name"/));
		spy.mockRestore();
	});
});
