import type { TableConfig } from "../GridFormatter/engine/configSchema";
import {
	CHOICE_METADATA_TYPES,
	mergeOptionColours,
	metadataFallbackUrls,
	optionColumns,
	readEntityMetadataColours,
	readWebApiColours,
} from "../GridFormatter/engine/optionMetadata";
import { AMBER, GREEN, RAG_OPTIONS, RED, example, spikeMetadata } from "./engineHelpers";

const RAG_MAP = new Map([
	[RED, "#D13438"],
	[AMBER, "#FFB900"],
	[GREEN, "#107C10"],
]);

describe("optionColumns", () => {
	it("lists each fromOption column once, sorted", () => {
		const config: TableConfig = {
			version: 1,
			rules: [
				{ id: "a", scope: "row", style: { backgroundColor: { fromOption: "wb_ragstatus" } } },
				{ id: "b", scope: "row", style: { color: { fromOption: "statuscode" }, backgroundColor: "#FFFFFF" } },
				{ id: "c", scope: "row", style: { backgroundColor: { fromOption: "wb_ragstatus", alpha: "tint" } } },
				{ id: "d", scope: "row", stop: true },
			],
		};
		expect(optionColumns(config)).toEqual(["statuscode", "wb_ragstatus"]);
	});

	it("leaves out related-table columns and handles no config", () => {
		const config: TableConfig = { version: 1, rules: [{ id: "a", scope: "row", style: { backgroundColor: { fromOption: "acct.wb_rag" } } }] };
		expect(optionColumns(config)).toEqual([]);
		expect(optionColumns(null)).toEqual([]);
	});

	it("finds wb_ragstatus in the wb_gridspike example", () => {
		expect(optionColumns(example("wb_gridspike"))).toEqual(["wb_ragstatus"]);
	});
});

describe("readEntityMetadataColours (V3)", () => {
	it("reads attributeDescriptor.OptionSet[].Color, leaving out options with no colour", () => {
		const read = readEntityMetadataColours(spikeMetadata({ wb_ragstatus: RAG_OPTIONS }), ["wb_ragstatus"]);
		expect(read.colours).toEqual(new Map([["wb_ragstatus", RAG_MAP]]));
		expect(read.missing).toEqual([]);
	});

	it("accepts string option values and skips malformed options", () => {
		const options = [{ Value: "1", Color: "#111111" }, { Value: 2.5, Color: "#222222" }, { Value: 3, Color: "" }, { Value: " ", Color: "#333333" }, null, "x", { Value: 4, Color: 7 }];
		const read = readEntityMetadataColours(spikeMetadata({ c: options }), ["c"]);
		expect(read.colours.get("c")).toEqual(new Map([[1, "#111111"]]));
	});

	it("maps a column with no option colours to an empty map", () => {
		const read = readEntityMetadataColours(spikeMetadata({ c: [{ Value: 1, Label: "One" }] }), ["c"]);
		expect(read.colours.get("c")).toEqual(new Map());
		expect(read.missing).toEqual([]);
	});

	it("falls back to getByName when get finds nothing", () => {
		const metadata = { Attributes: { get: () => undefined, getByName: (name: string) => (name === "c" ? { attributeDescriptor: { OptionSet: [{ Value: 1, Color: "#ABCDEF" }] } } : null) } };
		expect(readEntityMetadataColours(metadata, ["c"]).colours.get("c")).toEqual(new Map([[1, "#ABCDEF"]]));
	});

	it.each([
		["no metadata", undefined],
		["no Attributes", {}],
		["Attributes not an object", { Attributes: 3 }],
		["no lookup functions", { Attributes: { get: 1 } }],
		["attribute not found", { Attributes: { get: () => null } }],
		["no attributeDescriptor", { Attributes: { get: () => ({ OptionSet: {} }) } }],
		["OptionSet not an array", { Attributes: { get: () => ({ attributeDescriptor: { OptionSet: {} } }) } }],
		["attribute is a string", { Attributes: { get: () => "x" } }],
	])("reports the column missing when there's %s", (_label, metadata) => {
		expect(readEntityMetadataColours(metadata, ["wb_ragstatus"])).toEqual({ colours: new Map(), missing: ["wb_ragstatus"] });
	});

	it("never throws, even when accessors throw", () => {
		const throwing = (): never => {
			throw new Error("boom");
		};
		const cases: unknown[] = [
			{ get Attributes() { return throwing(); } },
			{ Attributes: { get get() { return throwing(); } } },
			{ Attributes: { get: throwing } },
			{ Attributes: { get: () => ({ get attributeDescriptor() { return throwing(); } }) } },
		];
		for (const metadata of cases) {
			expect(readEntityMetadataColours(metadata, ["c"]).missing).toEqual(["c"]);
		}
	});
});

describe("metadataFallbackUrls", () => {
	it("asks for the columns' option sets, one request per choice type", () => {
		const urls = metadataFallbackUrls("wb_gridspike", ["wb_ragstatus", "statuscode"]);
		expect(urls).toHaveLength(CHOICE_METADATA_TYPES.length);
		expect(urls[0]).toBe(
			"/api/data/v9.2/EntityDefinitions(LogicalName='wb_gridspike')/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata" +
				"?$select=LogicalName&$filter=LogicalName eq 'wb_ragstatus' or LogicalName eq 'statuscode'&$expand=OptionSet($select=Options)",
		);
		expect(urls.map((url) => /CRM\.(\w+)\?/.exec(url)?.[1])).toEqual([...CHOICE_METADATA_TYPES]);
	});

	it("leaves out unsafe names, and asks for nothing when none are left", () => {
		expect(metadataFallbackUrls("wb_t", ["ok_col", "bad'col"])[0]).toContain("$filter=LogicalName eq 'ok_col'&");
		expect(metadataFallbackUrls("wb_t", ["bad'col"])).toEqual([]);
		expect(metadataFallbackUrls("bad'table", ["ok"])).toEqual([]);
		expect(metadataFallbackUrls("wb_t", [])).toEqual([]);
	});

	it("takes an API version", () => {
		expect(metadataFallbackUrls("t", ["c"], "9.1")[0]).toMatch(/^\/api\/data\/v9\.1\//);
	});
});

describe("readWebApiColours", () => {
	it("reads Options[].Value/Color for the wanted columns from every response", () => {
		const picklists = { value: [{ LogicalName: "wb_ragstatus", OptionSet: { Options: RAG_OPTIONS } }, { LogicalName: "other", OptionSet: { Options: [] } }] };
		const statuses = { value: [{ LogicalName: "statuscode", OptionSet: { Options: [{ Value: 1, Color: "#0000FF" }] } }] };
		const read = readWebApiColours([picklists, null, statuses, { value: [] }], ["wb_ragstatus", "statuscode", "wb_missing"]);
		expect(read.colours).toEqual(
			new Map([
				["wb_ragstatus", RAG_MAP],
				["statuscode", new Map([[1, "#0000FF"]])],
			]),
		);
		expect(read.missing).toEqual(["wb_missing"]);
	});

	it("skips malformed bodies and rows", () => {
		const bodies = ["x", { value: "x" }, { value: [null, { LogicalName: 3 }, { LogicalName: "c" }, { LogicalName: "c", OptionSet: { Options: "x" } }] }];
		expect(readWebApiColours(bodies, ["c"])).toEqual({ colours: new Map(), missing: ["c"] });
	});
});

describe("mergeOptionColours", () => {
	it("prefers the primary source for a column both describe", () => {
		const primary = new Map([["a", new Map([[1, "#111111"]])]]);
		const fallback = new Map([
			["a", new Map([[1, "#999999"]])],
			["b", new Map([[2, "#222222"]])],
		]);
		expect(mergeOptionColours(primary, fallback)).toEqual(
			new Map([
				["a", new Map([[1, "#111111"]])],
				["b", new Map([[2, "#222222"]])],
			]),
		);
	});
});
