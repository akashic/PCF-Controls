// The configSchema.ts type guards the style engine relies on. (PR #23 adds
// tests/configSchema.test.ts for the same guards; this file keeps coverage at
// 100% whichever PR merges first.)
import { isCellScope, isFromOptionColor, isLeafCondition } from "../GridFormatter/engine/configSchema";

describe("configSchema type guards used by the style engine", () => {
	it("isLeafCondition tells leaves from groups", () => {
		expect(isLeafCondition({ column: "statecode", op: "eq", value: 1 })).toBe(true);
		expect(isLeafCondition({ not: { column: "statecode", op: "isNull" } })).toBe(false);
	});

	it("isFromOptionColor tells option colours from static colours", () => {
		expect(isFromOptionColor({ fromOption: "wb_ragstatus" })).toBe(true);
		expect(isFromOptionColor("#C50F1F")).toBe(false);
		expect(isFromOptionColor({ token: "colorNeutralBackground3" })).toBe(false);
	});

	it("isCellScope tells cell scope from row scope", () => {
		expect(isCellScope({ columns: ["wb_duedate"] })).toBe(true);
		expect(isCellScope("row")).toBe(false);
	});
});
