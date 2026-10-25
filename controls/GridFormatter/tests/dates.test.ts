import { dayNumber, fromWallClock, parseCalendarDate, parseIso, toLocalDate, type CalendarDate } from "../GridFormatter/engine/dates";

const AEST = 600; // UTC+10, the offset captured in the spike

describe("parseCalendarDate", () => {
	it.each(["2026-10-18", "2024-02-29", "2026-12-31", "1999-01-01"])("accepts %p", (input) => {
		expect(parseCalendarDate(input)).toBe(input);
	});

	it.each([
		"2026-02-29",
		"2026-13-01",
		"2026-00-10",
		"2026-10-32",
		"2026-10-18T00:00:00Z",
		"2026-1-8",
		"0050-01-01",
		" 2026-10-18",
		"",
		null,
		20261018,
	])("rejects %p", (input) => {
		expect(parseCalendarDate(input)).toBeNull();
	});
});

describe("dayNumber", () => {
	it("counts days since 1970-01-01", () => {
		expect(dayNumber("1970-01-01" as CalendarDate)).toBe(0);
		expect(dayNumber("2026-10-22" as CalendarDate) - dayNumber("2026-10-18" as CalendarDate)).toBe(4);
		expect(dayNumber("2027-01-01" as CalendarDate) - dayNumber("2026-12-31" as CalendarDate)).toBe(1);
	});
});

describe("toLocalDate", () => {
	it("shifts an instant by a positive (east of UTC) offset", () => {
		// The spike row shows 22/10/2026 6:48 AM at UTC+10.
		expect(toLocalDate(new Date("2026-10-21T19:48:00Z"), AEST)).toBe("2026-10-22");
		expect(toLocalDate(new Date("2026-10-21T13:59:59Z"), AEST)).toBe("2026-10-21");
		expect(toLocalDate(new Date("2026-10-21T14:00:00Z"), AEST)).toBe("2026-10-22");
	});

	it("shifts by a negative (west of UTC) offset", () => {
		expect(toLocalDate(new Date("2026-10-22T03:00:00Z"), -300)).toBe("2026-10-21");
		expect(toLocalDate(new Date("2026-10-22T05:00:00Z"), -300)).toBe("2026-10-22");
	});

	it("uses UTC with offset 0", () => {
		expect(toLocalDate(new Date("2026-10-21T23:59:59.999Z"), 0)).toBe("2026-10-21");
	});

	it("asks an offset function for the offset at that instant (daylight saving)", () => {
		// Sydney: AEDT (+660) from 4 Oct 2026, AEST (+600) before.
		const sydney = (d: Date) => (d.getTime() >= Date.UTC(2026, 9, 3, 16) ? 660 : 600);
		expect(toLocalDate(new Date("2026-10-21T13:30:00Z"), sydney)).toBe("2026-10-22");
		expect(toLocalDate(new Date("2026-09-21T13:30:00Z"), sydney)).toBe("2026-09-21");
	});

	it.each([
		["NaN", NaN],
		["Infinity", Infinity],
		["a string", "600" as unknown as number],
		["a function returning NaN", () => NaN],
		["a throwing function", () => {
			throw new Error("boom");
		}],
		["an offset that leaves the Date range", 1e12],
	])("returns null for %s", (_, offset) => {
		expect(toLocalDate(new Date("2026-10-21T19:48:00Z"), offset)).toBeNull();
	});

	it("returns null for an invalid Date or a non-Date", () => {
		expect(toLocalDate(new Date(NaN), AEST)).toBeNull();
		expect(toLocalDate("2026-10-21" as unknown as Date, AEST)).toBeNull();
	});
});

describe("parseIso", () => {
	const instant = (input: string, offset?: number) => {
		const parsed = parseIso(input, offset);
		if (parsed?.kind !== "instant") throw new Error(`${input} did not parse as an instant`);
		return parsed.instant.toISOString();
	};

	it("parses a date-only string as a calendar date", () => {
		expect(parseIso("2026-12-31")).toEqual({ kind: "date", date: "2026-12-31" });
	});

	it.each([
		["2026-12-31T17:00:00Z", "2026-12-31T17:00:00.000Z"],
		["2026-12-31T17:00Z", "2026-12-31T17:00:00.000Z"],
		["2026-12-31T17:00:00.5Z", "2026-12-31T17:00:00.500Z"],
		["2026-12-31T17:00:00.123456Z", "2026-12-31T17:00:00.123Z"],
		["2027-01-01T03:00:00+10:00", "2026-12-31T17:00:00.000Z"],
		["2026-12-31T12:00:00-05:00", "2026-12-31T17:00:00.000Z"],
	])("parses %p as %p", (input, expected) => {
		expect(instant(input)).toBe(expected);
	});

	it("reads a time without a zone as UTC by default", () => {
		expect(instant("2026-12-31T17:00")).toBe("2026-12-31T17:00:00.000Z");
	});

	it("reads a time without a zone in the given local offset", () => {
		expect(instant("2027-01-01T03:00", AEST)).toBe("2026-12-31T17:00:00.000Z");
	});

	it("returns null when the local offset can't be read", () => {
		expect(parseIso("2026-12-31T17:00", NaN)).toBeNull();
		// A time with an explicit zone doesn't need it.
		expect(parseIso("2026-12-31T17:00Z", NaN)?.kind).toBe("instant");
	});

	describe("a time without a zone near a daylight-saving change", () => {
		// Sydney: AEST (UTC+10) until 02:00 on 4 Oct 2026, which is 16:00 UTC on 3 Oct; then AEDT (UTC+11).
		const change = Date.parse("2026-10-03T16:00:00Z");
		const sydney = (at: Date): number => (at.getTime() < change ? 600 : 660);

		it.each([
			// The evening before: still AEST. One pass would have read the offset at 20:00 UTC (AEDT) and been an hour out.
			["2026-10-03T20:00", "2026-10-03T10:00:00.000Z"],
			["2026-10-04T01:59", "2026-10-03T15:59:00.000Z"],
			// After the change: AEDT.
			["2026-10-04T03:00", "2026-10-03T16:00:00.000Z"],
			["2026-10-04T12:00", "2026-10-04T01:00:00.000Z"],
		])("reads %p in the offset in force then: %p", (input, expected) => {
			const parsed = parseIso(input, sydney);
			expect(parsed?.kind === "instant" && parsed.instant.toISOString()).toBe(expected);
		});
	});

	it.each([
		"2026-12-31T17:00+24:00",
		"2026-12-31T17:00-10:60",
		"2026-12-31T24:00Z",
		"2026-12-31T25:00:00Z",
		"2026-12-31T17:60Z",
		"2026-12-31T17:00:61Z",
		"2026-02-30T00:00Z",
		"2026-12-31 17:00",
		"2026-12-31T17",
		"31/12/2026",
		"",
		null,
		1,
	])("rejects %p", (input) => {
		expect(parseIso(input)).toBeNull();
	});
});

describe("fromWallClock", () => {
	const wallClock = Date.UTC(2026, 9, 22, 9, 0); // 09:00 on 22 Oct, as if UTC

	it("converts a local wall-clock time to UTC", () => {
		expect(new Date(fromWallClock(wallClock, AEST) ?? NaN).toISOString()).toBe("2026-10-21T23:00:00.000Z");
		expect(new Date(fromWallClock(wallClock, -300) ?? NaN).toISOString()).toBe("2026-10-22T14:00:00.000Z");
	});

	it("asks for the offset at its first guess, not at the wall-clock fields", () => {
		const asked: string[] = [];
		fromWallClock(wallClock, (at) => {
			asked.push(at.toISOString());
			return AEST;
		});
		expect(asked).toEqual(["2026-10-22T09:00:00.000Z", "2026-10-21T23:00:00.000Z"]);
	});

	it("is null when either reading of the offset fails", () => {
		expect(fromWallClock(wallClock, NaN)).toBeNull();
		const readings = [AEST, NaN];
		expect(fromWallClock(wallClock, () => readings.shift() ?? AEST)).toBeNull();
	});
});
