import { isFromOptionColor, isLeafCondition } from "../GridFormatter/engine/configSchema";
import { isRecord } from "../GridFormatter/engine/guards";

describe("configSchema type guards", () => {
	it("isLeafCondition tells leaves from groups", () => {
		expect(isLeafCondition({ column: "statecode", op: "eq", value: 1 })).toBe(true);
		expect(isLeafCondition({ all: [{ column: "statecode", op: "isNull" }] })).toBe(false);
		expect(isLeafCondition({ not: { column: "statecode", op: "isNull" } })).toBe(false);
	});

	it("isFromOptionColor tells fromOption colours from static ones", () => {
		expect(isFromOptionColor({ fromOption: "wb_ragstatus", alpha: "tint" })).toBe(true);
		expect(isFromOptionColor("#C50F1F")).toBe(false);
		expect(isFromOptionColor({ hex: "#C50F1F", alpha: 0.2 })).toBe(false);
		expect(isFromOptionColor({ token: "colorNeutralBackground3" })).toBe(false);
	});

});

describe("isRecord", () => {
	it("is true for objects, and false for null, arrays and other values", () => {
		expect(isRecord({})).toBe(true);
		expect(isRecord(new Map())).toBe(true);
		for (const value of [null, undefined, [], "x", 1, true]) expect(isRecord(value)).toBe(false);
	});
});
