import { readFileSync } from "fs";
import { join } from "path";
import {
	NOT_VISIBLE,
	UNREADABLE,
	columnReader,
	columnTypes,
	dateReadings,
	getValue,
	isInView,
	normalizeGuid,
	readColumn,
	timeZoneIndependentOf,
	type ColumnTypeInfo,
	type ColumnValue,
} from "../GridFormatter/engine/rowValues";

interface Fixture {
	colDefs: ColumnTypeInfo[];
	rows: Record<string, unknown>[];
	nonEmptyExamples: { Lookup: unknown };
}

/** rowData captured from the real grid in spike V1. */
const fixture = JSON.parse(readFileSync(join(__dirname, "fixtures", "rowdata.wb_gridspike.json"), "utf8")) as Fixture;
const [row1, row2] = fixture.rows;
const typeOf = (column: string): string => {
	const def = fixture.colDefs.find((d) => d.name === column);
	if (!def) throw new Error(`fixture has no column ${column}`);
	return def.dataType;
};
const read = (row: Record<string, unknown>, column: string) => getValue(row, column, typeOf(column));

describe("getValue against the captured rowData (V1)", () => {
	it.each([
		["wb_name", "Text", "Spike row 01", "Spike row 02"],
		["wb_notes", "Text", "Note 1", "Note 2"],
		["statecode", "OptionSet", 0, 0],
		["statuscode", "OptionSet", 1, 1],
		["wb_ragstatus", "OptionSet", 948790001, 948790002],
		["wb_flagged", "TwoOptions", false, false],
		["wb_count", "Integer", 10, 20],
		["wb_score", "Decimal", 3.14, 6.28],
		["wb_budget", "Currency", 1000, 2000],
		["wb_actualcost", "Currency", 750, 2250],
		["wb_duedate", "DateOnly", "2026-10-18", "2026-10-19"],
	])("%s (%s) → %p, %p", (column, dataType, first, second) => {
		expect(typeOf(column)).toBe(dataType);
		expect(read(row1, column)).toEqual(first);
		expect(read(row2, column)).toEqual(second);
	});

	it("reads choice values (strings in rowData) as numbers", () => {
		expect(row1.wb_ragstatus).toBe("948790001");
		expect(typeof read(row1, "wb_ragstatus")).toBe("number");
	});

	it("reads multi-select as number[]", () => {
		expect(read(row1, "wb_tags")).toEqual([948790000, 948790001]);
		expect(read(row2, "wb_tags")).toEqual([948790002]);
	});

	it("reads Owner (dataType Persona) as its lower-case GUID", () => {
		expect(typeOf("ownerid")).toBe("Persona");
		expect(read(row1, "ownerid")).toBe("00000000-0000-0000-0000-000000000001");
	});

	it("reads a Lookup as its GUID, and an empty one as null", () => {
		expect(read(row1, "wb_parentid")).toBeNull();
		expect(getValue({ wb_parentid: fixture.nonEmptyExamples.Lookup }, "wb_parentid", "Lookup")).toBe(
			"4c2ddcfb-c2cd-f111-a05b-70a8a59b69e5",
		);
	});

	it("reads DateOnly as the UTC date part, with no time-zone shift", () => {
		expect(row1.wb_duedate).toBe("2026-10-18T00:00:00.000Z");
		expect(read(row1, "wb_duedate")).toBe("2026-10-18");
	});

	it("reads DateAndTime as a Date at the same instant", () => {
		const reviewed = read(row1, "wb_reviewedon");
		expect(reviewed).toBeInstanceOf(Date);
		expect((reviewed as Date).toISOString()).toBe("2026-10-21T19:48:00.000Z");
		expect((read(row2, "createdon") as Date).toISOString()).toBe("2026-10-22T02:48:00.000Z");
	});

	it("reads every captured column without returning undefined", () => {
		for (const row of fixture.rows) {
			for (const { name, dataType } of fixture.colDefs) {
				expect(getValue(row, name, dataType)).not.toBeUndefined();
			}
		}
	});
});

describe("getValue: text types", () => {
	it.each(["Text", "Email", "Phone", "URL", "Ticker", "TextArea", "Multiple", "RichText", "AutoNumber"])(
		"%s reads strings as-is",
		(dataType) => {
			expect(getValue({ c: "Hello World" }, "c", dataType)).toBe("Hello World");
		},
	);

	it.each([[42], [true], [{}], [["a"]]])("Text %p → UNREADABLE", (raw) => {
		expect(getValue({ c: raw }, "c", "Text")).toBe(UNREADABLE);
	});
});

describe("getValue: empty cells", () => {
	it.each(["Text", "OptionSet", "MultiSelectPicklist", "TwoOptions", "Integer", "Lookup", "DateOnly", "DateAndTime", "Image", "File", "Unknown"])(
		"%s: null, undefined, \"\" and [] are empty (null), never UNREADABLE",
		(dataType) => {
			for (const raw of [null, undefined, "", []]) expect(getValue({ c: raw }, "c", dataType)).toBeNull();
		},
	);
});

describe("getValue: numbers", () => {
	it.each(["Integer", "Decimal", "FloatingPoint", "Currency", "Duration", "Language", "TimeZone"])(
		"%s reads numbers",
		(dataType) => {
			expect(getValue({ c: 12.5 }, "c", dataType)).toBe(12.5);
			expect(getValue({ c: -3 }, "c", dataType)).toBe(-3);
			expect(getValue({ c: 0 }, "c", dataType)).toBe(0);
		},
	);

	it.each([
		["42", 42],
		[" -1.5 ", -1.5],
		[".5", 0.5],
		["1e3", 1000],
		["7.", 7],
	])("reads the numeric string %p as %p", (raw, expected) => {
		expect(getValue({ c: raw }, "c", "Decimal")).toBe(expected);
	});

	it.each([[NaN], [Infinity], ["12abc"], ["$1,000"], [true], [[1]], [{}]])("%p → UNREADABLE", (raw) => {
		expect(getValue({ c: raw }, "c", "Currency")).toBe(UNREADABLE);
	});
});

describe("getValue: choices (OptionSet)", () => {
	it.each([
		["948790001", 948790001],
		["0", 0],
		["-1", -1],
		[948790001, 948790001],
	])("%p → %p", (raw, expected) => {
		expect(getValue({ c: raw }, "c", "OptionSet")).toBe(expected);
	});

	it.each([["Red"], ["1.5"], [1.5], [NaN], [true], [[1]]])("%p → UNREADABLE", (raw) => {
		expect(getValue({ c: raw }, "c", "OptionSet")).toBe(UNREADABLE);
	});
});

describe("getValue: multi-select", () => {
	it("reads numbers and numeric strings", () => {
		expect(getValue({ c: [1, "2"] }, "c", "MultiSelectPicklist")).toEqual([1, 2]);
	});

	it.each([[[1, "x"]], [[1.5]], ["1,2"], [1]])("%p → UNREADABLE", (raw) => {
		expect(getValue({ c: raw }, "c", "MultiSelectPicklist")).toBe(UNREADABLE);
	});
});

describe("getValue: Yes/No (TwoOptions)", () => {
	it.each([
		[true, true],
		[false, false],
		[1, true],
		[0, false],
		["1", true],
		["0", false],
		["true", true],
		["false", false],
	])("%p → %p", (raw, expected) => {
		expect(getValue({ c: raw }, "c", "TwoOptions")).toBe(expected);
	});

	it.each([["yes"], [2], [{}]])("%p → UNREADABLE", (raw) => {
		expect(getValue({ c: raw }, "c", "TwoOptions")).toBe(UNREADABLE);
	});
});

describe("getValue: lookups", () => {
	const guid = "4C2DDCFB-C2CD-F111-A05B-70A8A59B69E5";
	const lower = guid.toLowerCase();

	it.each(["Lookup", "Customer", "Owner", "Persona"])("%s reads { id: { guid } } as a lower-case GUID", (dataType) => {
		expect(getValue({ c: { id: { guid }, etn: "account", name: "A" } }, "c", dataType)).toBe(lower);
	});

	it.each([
		["a bare GUID", guid],
		["a braced GUID", `{${guid}}`],
		["{ id: '<guid>' }", { id: guid }],
	])("accepts %s", (_, raw) => {
		expect(getValue({ c: raw }, "c", "Lookup")).toBe(lower);
	});

	it("reads UniqueIdentifier as a GUID", () => {
		expect(getValue({ c: ` ${guid} ` }, "c", "UniqueIdentifier")).toBe(lower);
	});

	it.each([[{}], [{ id: null }], [{ id: { guid: "nope" } }], [{ id: { guid: 7 } }], ["Test User"], [[guid]]])(
		"%p → UNREADABLE",
		(raw) => {
			expect(getValue({ c: raw }, "c", "Lookup")).toBe(UNREADABLE);
		},
	);
});

describe("getValue: dates", () => {
	it.each([
		["2026-10-18T00:00:00.000Z", "2026-10-18"],
		["2026-10-18", "2026-10-18"],
		["2026-10-18T23:59:59Z", "2026-10-18"],
	])("DateOnly %p → %p", (raw, expected) => {
		expect(getValue({ c: raw }, "c", "DateOnly")).toBe(expected);
	});

	it("DateOnly accepts a Date (UTC date part)", () => {
		expect(getValue({ c: new Date("2026-10-18T00:00:00Z") }, "c", "DateOnly")).toBe("2026-10-18");
	});

	it.each([["18/10/2026"], ["2026-02-30T00:00:00Z"], [new Date(NaN)], [20261018]])(
		"DateOnly %p → UNREADABLE",
		(raw) => {
			expect(getValue({ c: raw }, "c", "DateOnly")).toBe(UNREADABLE);
		},
	);

	it.each([
		["2026-10-21T19:48:00.000Z", "2026-10-21T19:48:00.000Z"],
		["2026-10-21T19:48:00Z", "2026-10-21T19:48:00.000Z"],
		["2026-10-22T05:48:00+10:00", "2026-10-21T19:48:00.000Z"],
		["2026-10-21T19:48:00", "2026-10-21T19:48:00.000Z"],
	])("DateAndTime %p → %p", (raw, expected) => {
		expect((getValue({ c: raw }, "c", "DateAndTime") as Date).toISOString()).toBe(expected);
	});

	it("DateAndTime copies a Date rather than sharing it", () => {
		const original = new Date("2026-10-21T19:48:00Z");
		const value = getValue({ c: original }, "c", "DateAndTime");
		expect(value).toEqual(original);
		expect(value).not.toBe(original);
	});

	it.each([["2026-10-21"], ["yesterday"], ["2026-13-01T00:00:00Z"], [new Date(NaN)], [0]])(
		"DateAndTime %p → UNREADABLE",
		(raw) => {
			expect(getValue({ c: raw }, "c", "DateAndTime")).toBe(UNREADABLE);
		},
	);
});

describe("getValue: unsupported input", () => {
	it.each(["Image", "File", "Unknown", "", "toString", "__proto__"])("a value of data type %p → UNREADABLE", (dataType) => {
		expect(getValue({ c: "x" }, "c", dataType)).toBe(UNREADABLE);
	});

	it.each([[null], [undefined], ["row"], [[]], [42]])("rowData %p → null", (rowData) => {
		expect(getValue(rowData, "c", "Text")).toBeNull();
	});

	it("a missing column → null", () => {
		expect(getValue(row1, "wb_missing", "Text")).toBeNull();
	});
});

describe("isInView and readColumn (V2)", () => {
	it("tells 'not in the view' apart from 'empty'", () => {
		expect(isInView(row1, "wb_parentid")).toBe(true);
		expect(readColumn(row1, "wb_parentid", "Lookup")).toBeNull();
		expect(isInView(row1, "wb_missing")).toBe(false);
		expect(readColumn(row1, "wb_missing", "Lookup")).toBe(NOT_VISIBLE);
	});

	it("doesn't treat grid bookkeeping keys or inherited properties as columns", () => {
		const rowData = { __rec_id: "x", params: {}, wb_name: "A" };
		expect(isInView(rowData, "__rec_id")).toBe(false);
		expect(isInView(rowData, "params")).toBe(false);
		expect(isInView(rowData, "toString")).toBe(false);
		expect(isInView(null, "wb_name")).toBe(false);
	});

	it("looks up related-table columns by their exact alias.column key", () => {
		const rowData = { "a_1.wb_ragstatus": "948790000" };
		expect(readColumn(rowData, "a_1.wb_ragstatus", "OptionSet")).toBe(948790000);
		expect(readColumn(rowData, "wb_ragstatus", "OptionSet")).toBe(NOT_VISIBLE);
	});

	it("an unknown data type means the column isn't in colDefs, so not visible", () => {
		expect(readColumn(row1, "wb_name", undefined)).toBe(NOT_VISIBLE);
	});

	it("reads a value when visible", () => {
		expect(readColumn(row1, "wb_count", "Integer")).toBe(10);
	});
});

describe("columnReader", () => {
	it("reads each column with its colDefs type", () => {
		const get = columnReader(row1, fixture.colDefs);
		expect(get("wb_ragstatus")).toBe(948790001);
		expect(get("wb_parentid")).toBeNull();
		expect(get("wb_missing")).toBe(NOT_VISIBLE);
	});

	it("treats a column missing from colDefs as not visible, even if rowData has it", () => {
		const get = columnReader(row1, [{ name: "wb_name", dataType: "Text" }]);
		expect(get("wb_name")).toBe("Spike row 01");
		expect(get("wb_count")).toBe(NOT_VISIBLE);
	});

	it("ignores malformed colDefs", () => {
		const colDefs = [null, { name: 1, dataType: "Text" }, { name: "wb_count" }, { name: "wb_count", dataType: "Integer" }];
		expect(columnReader(row1, colDefs as unknown as ColumnTypeInfo[])("wb_count")).toBe(10);
		expect(columnReader(row1, null as unknown as ColumnTypeInfo[])("wb_count")).toBe(NOT_VISIBLE);
	});

	it("reads a value it can't normalise as UNREADABLE, not empty", () => {
		const get = columnReader({ wb_count: "lots", wb_photo: "base64…", wb_blank: null }, [
			{ name: "wb_count", dataType: "Integer" },
			{ name: "wb_photo", dataType: "Image" },
			{ name: "wb_blank", dataType: "Image" },
		]);
		expect(get("wb_count")).toBe(UNREADABLE);
		expect(get("wb_photo")).toBe(UNREADABLE);
		expect(get("wb_blank")).toBeNull();
	});
});

describe("columnTypes", () => {
	it("gives each colDefs column's dataType, and undefined for any other column", () => {
		const typeOf = columnTypes(fixture.colDefs);
		expect(typeOf("wb_duedate")).toBe("DateOnly");
		expect(typeOf("ownerid")).toBe("Persona");
		expect(typeOf("wb_missing")).toBeUndefined();
	});
});

describe("normalizeGuid", () => {
	it.each([
		["ABCDEF01-2345-6789-ABCD-EF0123456789", "abcdef01-2345-6789-abcd-ef0123456789"],
		["{abcdef01-2345-6789-abcd-ef0123456789}", "abcdef01-2345-6789-abcd-ef0123456789"],
	])("%p → %p", (raw, expected) => {
		expect(normalizeGuid(raw)).toBe(expected);
	});

	it.each([["abcdef01"], ["abcdef01-2345-6789-abcd-ef012345678g"], [null], [1]])("%p → null", (raw) => {
		expect(normalizeGuid(raw)).toBeNull();
	});
});

// Date behaviours (V11) -------------------------------------------------------

interface DateBehavioursFixture {
	colDefs: ColumnTypeInfo[];
	rows: Record<string, unknown>[];
	shown: Record<string, string>[];
	user: { timeZoneOffsetMinutes: number };
}

/** rowData for the four date behaviours, captured in spike V11 at UTC+11. */
const behaviours = JSON.parse(readFileSync(join(__dirname, "fixtures", "rowdata.date-behaviours.json"), "utf8")) as DateBehavioursFixture;
const AEDT = behaviours.user.timeZoneOffsetMinutes; // 660
const pad = (n: number): string => String(n).padStart(2, "0");

/** A normalised date as the grid shows it (en-AU): `21/10/2026`, or `21/10/2026 9:00 PM` at `offsetMinutes`. */
function shown(value: ColumnValue, offsetMinutes: number): string {
	if (typeof value === "string") {
		const [y, m, d] = value.split("-");
		return `${d}/${m}/${y}`;
	}
	if (!(value instanceof Date)) return `not a date: ${String(value)}`;
	const local = new Date(value.getTime() + offsetMinutes * 60_000);
	const hours = local.getUTCHours();
	const date = `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}/${local.getUTCFullYear()}`;
	return `${date} ${hours % 12 || 12}:${pad(local.getUTCMinutes())} ${hours < 12 ? "AM" : "PM"}`;
}

describe("date behaviours against the captured rowData (V11)", () => {
	const cases = behaviours.rows.flatMap((row, index) =>
		Object.entries(behaviours.shown[index]).map(([column, expected]) => [index + 1, column, expected, row] as const),
	);

	it("has a captured display for every column of row 01", () => {
		expect(Object.keys(behaviours.shown[0]).sort()).toEqual(behaviours.colDefs.map((d) => d.name).sort());
		expect(cases).toHaveLength(6);
	});

	it.each(cases)("row %i: %s reads as %p, as the user sees it at UTC+11", (_row, column, expected, row) => {
		expect(shown(columnReader(row, behaviours.colDefs, AEDT)(column), AEDT)).toBe(expected);
	});

	it("row 03 (display not captured) follows the same pattern", () => {
		const get = columnReader(behaviours.rows[2], behaviours.colDefs, AEDT);
		expect(get("wb_startdate")).toBe("2026-10-23");
		expect(shown(get("wb_meetingat"), AEDT)).toBe("23/10/2026 9:00 PM");
	});

	it("reads a Time Zone Independent date and time as the instant the user's clock shows it", () => {
		const meeting = columnReader(behaviours.rows[0], behaviours.colDefs, AEDT)("wb_meetingat");
		expect((meeting as Date).toISOString()).toBe("2026-10-21T10:00:00.000Z"); // 21:00 at UTC+11
		// A user at UTC+10 sees the same wall-clock time.
		expect(shown(columnReader(behaviours.rows[0], behaviours.colDefs, 600)("wb_meetingat"), 600)).toBe("21/10/2026 9:00 PM");
	});

	it("reads a User Local date-only value at the user's offset, so a user at UTC+10 sees the day before", () => {
		// Stored as 21 Oct 00:00 at UTC+11, which is 20 Oct 23:00 at UTC+10.
		expect(columnReader(behaviours.rows[0], behaviours.colDefs, 600)("wb_startdate")).toBe("2026-10-20");
	});

	it("leaves Date Only and User Local date-and-time columns as they were", () => {
		const get = columnReader(behaviours.rows[0], behaviours.colDefs, AEDT);
		expect(get("wb_duedate")).toBe("2026-10-18");
		expect((get("wb_reviewedon") as Date).toISOString()).toBe("2026-10-21T19:48:00.000Z");
	});

	it("reads empty values as null whatever the behaviour", () => {
		const get = columnReader({ wb_duedate: null, wb_startdate: null, wb_reviewedon: null, wb_meetingat: null }, behaviours.colDefs, AEDT);
		for (const { name } of behaviours.colDefs) expect(get(name)).toBeNull();
	});

	it("reads at UTC when no offset is given", () => {
		expect(columnReader(behaviours.rows[0], behaviours.colDefs)("wb_startdate")).toBe("2026-10-20");
	});
});

describe("getValue: date behaviours (V11)", () => {
	const userLocal = { timeZoneIndependent: false, offset: AEDT };
	const independent = { timeZoneIndependent: true, offset: AEDT };

	it.each([
		["DateOnly", "2026-10-20T13:00:00.000Z"],
		["DateAndTime", "2026-10-21T21:00:00.000Z"],
	])("%s without a behaviour reads as before (the date part, or the instant)", (dataType, raw) => {
		const before = getValue({ c: raw }, "c", dataType);
		expect(getValue({ c: raw }, "c", dataType, { timeZoneIndependent: undefined, offset: AEDT })).toEqual(before);
		expect(before).toEqual(dataType === "DateOnly" ? "2026-10-20" : new Date(raw));
	});

	it("DateOnly, User Local: the local date of the stored instant", () => {
		expect(getValue({ c: "2026-10-20T13:00:00.000Z" }, "c", "DateOnly", userLocal)).toBe("2026-10-21");
		expect(getValue({ c: new Date("2026-10-20T13:00:00.000Z") }, "c", "DateOnly", userLocal)).toBe("2026-10-21");
	});

	it("DateOnly, Date Only: the date part, whatever the offset", () => {
		expect(getValue({ c: "2026-10-18T00:00:00.000Z" }, "c", "DateOnly", { timeZoneIndependent: true, offset: -600 })).toBe("2026-10-18");
	});

	it("DateAndTime, User Local: the instant, whatever the offset", () => {
		expect((getValue({ c: "2026-10-21T19:48:00.000Z" }, "c", "DateAndTime", userLocal) as Date).toISOString()).toBe("2026-10-21T19:48:00.000Z");
	});

	it("DateAndTime, Time Zone Independent: the stored wall-clock time in the user's zone", () => {
		expect((getValue({ c: "2026-10-21T21:00:00.000Z" }, "c", "DateAndTime", independent) as Date).toISOString()).toBe("2026-10-21T10:00:00.000Z");
		expect((getValue({ c: new Date("2026-10-21T21:00:00.000Z") }, "c", "DateAndTime", independent) as Date).toISOString()).toBe(
			"2026-10-21T10:00:00.000Z",
		);
	});

	it("uses the offset in force at each value, across a daylight-saving change", () => {
		// Sydney: UTC+10 until 4 Oct 2026 02:00 local (2026-10-03T16:00Z), then UTC+11.
		const sydney = (instant: Date): number => (instant.getTime() < Date.parse("2026-10-03T16:00:00Z") ? 600 : 660);
		const local = { timeZoneIndependent: false, offset: sydney };
		expect(getValue({ c: "2026-10-03T14:00:00.000Z" }, "c", "DateOnly", local)).toBe("2026-10-04"); // midnight at +10
		expect(getValue({ c: "2026-10-04T13:00:00.000Z" }, "c", "DateOnly", local)).toBe("2026-10-05"); // midnight at +11
		const tzi = { timeZoneIndependent: true, offset: sydney };
		expect((getValue({ c: "2026-10-04T01:00:00.000Z" }, "c", "DateAndTime", tzi) as Date).toISOString()).toBe("2026-10-03T15:00:00.000Z");
		expect((getValue({ c: "2026-10-04T09:00:00.000Z" }, "c", "DateAndTime", tzi) as Date).toISOString()).toBe("2026-10-03T22:00:00.000Z");
	});

	it.each([
		["DateOnly", false],
		["DateAndTime", true],
	])("%s (timeZoneIndependent %p) can't be read when the offset can't", (dataType, timeZoneIndependent) => {
		const broken = (): number => {
			throw new Error("no settings");
		};
		expect(getValue({ c: "2026-10-20T13:00:00.000Z" }, "c", dataType, { timeZoneIndependent, offset: broken })).toBe(UNREADABLE);
		expect(getValue({ c: "2026-10-20T13:00:00.000Z" }, "c", dataType, { timeZoneIndependent, offset: NaN })).toBe(UNREADABLE);
	});

	it.each([["18/10/2026"], ["2026-02-30T00:00:00Z"], [new Date(NaN)], [20261018]])("a malformed %p is UNREADABLE in either behaviour", (raw) => {
		for (const dataType of ["DateOnly", "DateAndTime"]) {
			expect(getValue({ c: raw }, "c", dataType, userLocal)).toBe(UNREADABLE);
			expect(getValue({ c: raw }, "c", dataType, independent)).toBe(UNREADABLE);
		}
	});

	it("ignores a behaviour on columns that aren't dates", () => {
		expect(getValue({ c: "Spike" }, "c", "Text", independent)).toBe("Spike");
		expect(getValue({ c: "10" }, "c", "Integer", userLocal)).toBe(10);
	});
});

describe("timeZoneIndependentOf", () => {
	it.each([
		[{ customizerParams: { timeZoneIndependent: true } }, true],
		[{ customizerParams: { timeZoneIndependent: false } }, false],
	])("%j → %p", (def, expected) => {
		expect(timeZoneIndependentOf(def)).toBe(expected);
	});

	const throwing = {
		get customizerParams(): unknown {
			throw new Error("boom");
		},
	};

	it.each([
		["no customizerParams", { name: "c" }],
		["null customizerParams", { customizerParams: null }],
		["customizerParams that isn't an object", { customizerParams: "x" }],
		["no timeZoneIndependent", { customizerParams: { dropDownOptions: [] } }],
		["a string", { customizerParams: { timeZoneIndependent: "true" } }],
		["a number", { customizerParams: { timeZoneIndependent: 1 } }],
		["a throwing getter", throwing],
		["a colDef that isn't an object", null],
	])("%s → undefined", (_label, def) => {
		expect(timeZoneIndependentOf(def)).toBeUndefined();
	});
});

describe("dateReadings", () => {
	it("gives each date column's behaviour and the offset, and nothing for other columns", () => {
		const readings = dateReadings(
			[
				...behaviours.colDefs,
				{ name: "wb_name", dataType: "Text", customizerParams: { timeZoneIndependent: true } },
				{ name: "createdon", dataType: "DateAndTime" },
				null,
				{ name: 1, dataType: "DateOnly" },
			],
			AEDT,
		);
		expect([...readings.keys()]).toEqual(["wb_duedate", "wb_startdate", "wb_reviewedon", "wb_meetingat", "createdon"]);
		expect(readings.get("wb_startdate")).toEqual({ timeZoneIndependent: false, offset: AEDT });
		expect(readings.get("wb_meetingat")).toEqual({ timeZoneIndependent: true, offset: AEDT });
		expect(readings.get("createdon")).toEqual({ timeZoneIndependent: undefined, offset: AEDT });
	});

	it("is empty for colDefs that isn't an array", () => {
		expect(dateReadings(null as unknown as unknown[], 0).size).toBe(0);
	});
});
