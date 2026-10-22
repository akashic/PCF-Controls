import { gridTableOf } from "../GridFormatter/engine/gridTable";

/** The context shapes captured in LowCode (decisions.md V9). */
const mainGrid = { page: { entityTypeName: "wb_gridspike" }, mode: { contextInfo: {} } };
const formSubgrid = (target: unknown) => ({
	page: { entityTypeName: "wb_gridspike" },
	mode: { contextInfo: { entityId: "4c2ddcfb-c2cd-f111-a05b-70a8a59b69e5" } },
	factory: { _customControlProperties: { descriptor: { Parameters: { TargetEntityType: target } } } },
});

describe("gridTableOf (#30)", () => {
	it("uses the page's table on a table's main grid, without a warning", () => {
		const warn = jest.fn();
		expect(gridTableOf(mainGrid, warn)).toBe("wb_gridspike");
		expect(warn).not.toHaveBeenCalled();
	});

	it("uses a form subgrid's own table, not the form's", () => {
		const warn = jest.fn();
		expect(gridTableOf(formSubgrid("systemuser"), warn)).toBe("systemuser");
		expect(gridTableOf(formSubgrid("wb_gridspike"), warn)).toBe("wb_gridspike");
		expect(warn).not.toHaveBeenCalled();
	});

	it.each([undefined, "", 42])("falls back to the form's table, with a warning, when TargetEntityType is %p", (target) => {
		const warn = jest.fn();
		expect(gridTableOf(formSubgrid(target), warn)).toBe("wb_gridspike");
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("uses the rules for the form's table wb_gridspike"));
	});

	it("doesn't warn on a page with an empty record id (a main grid or a new record)", () => {
		const warn = jest.fn();
		expect(gridTableOf({ ...mainGrid, mode: { contextInfo: { entityId: "" } } }, warn)).toBe("wb_gridspike");
		expect(warn).not.toHaveBeenCalled();
	});

	it.each([null, undefined, 42, {}, { page: {} }, { page: { entityTypeName: "" } }, { page: null }])("returns null without a table: %p", (context) => {
		const warn = jest.fn();
		expect(gridTableOf(context, warn)).toBeNull();
		expect(warn).not.toHaveBeenCalled();
	});

	it("returns null if reading the context throws", () => {
		const context = {
			get factory(): never {
				throw new Error("boom");
			},
		};
		expect(gridTableOf(context, jest.fn())).toBeNull();
	});
});
