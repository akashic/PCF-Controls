import { createMetadataStore, type FetchJson, type UtilsLike } from "../GridFormatter/stores/metadataStore";
import { AMBER, GREEN, RAG_OPTIONS, RED, spikeMetadata } from "./engineHelpers";

const RAG_MAP = new Map([
	[RED, "#D13438"],
	[AMBER, "#FFB900"],
	[GREEN, "#107C10"],
]);

function setup(getEntityMetadata: UtilsLike["getEntityMetadata"], fetchJson?: FetchJson) {
	const warnings: string[] = [];
	const metadataCalls: [string, string[] | undefined][] = [];
	const utils: UtilsLike = {
		getEntityMetadata: (table, columns) => {
			metadataCalls.push([table, columns]);
			return getEntityMetadata(table, columns);
		},
	};
	const store = createMetadataStore({ warn: (m) => warnings.push(m), fetchJson });
	return { store, utils, warnings, metadataCalls };
}

describe("metadataStore", () => {
	it("reads option colours with one getEntityMetadata call per table", async () => {
		const fetchJson = jest.fn<Promise<unknown>, [string]>();
		const { store, utils, warnings, metadataCalls } = setup(() => Promise.resolve(spikeMetadata({ wb_ragstatus: RAG_OPTIONS })), fetchJson);
		const [a, b] = await Promise.all([store.load("wb_gridspike", ["wb_ragstatus"], utils), store.load("wb_gridspike", ["wb_ragstatus"], utils)]);
		expect(a).toEqual(new Map([["wb_ragstatus", RAG_MAP]]));
		expect(b).toBe(a);
		expect(metadataCalls).toEqual([["wb_gridspike", ["wb_ragstatus"]]]);
		expect(fetchJson).not.toHaveBeenCalled();
		expect(warnings).toEqual([]);
	});

	it("makes no request when no rule uses fromOption", async () => {
		const { store, utils, metadataCalls } = setup(() => Promise.reject(new Error("unexpected")));
		expect(await store.load("t", [], utils)).toEqual(new Map());
		expect(metadataCalls).toEqual([]);
	});

	it("falls back to the Web API for columns getEntityMetadata doesn't describe", async () => {
		const urls: string[] = [];
		const fetchJson: FetchJson = (url) => {
			urls.push(url);
			return url.includes("StatusAttributeMetadata")
				? Promise.resolve({ value: [{ LogicalName: "statuscode", OptionSet: { Options: [{ Value: 1, Color: "#0000FF" }] } }] })
				: url.includes("StateAttributeMetadata")
					? Promise.reject(new Error("HTTP 400"))
					: Promise.resolve({ value: [] });
		};
		const { store, utils, warnings } = setup(() => Promise.resolve(spikeMetadata({ wb_ragstatus: RAG_OPTIONS })), fetchJson);
		const colours = await store.load("t", ["statuscode", "wb_ragstatus"], utils);
		expect(colours).toEqual(
			new Map([
				["statuscode", new Map([[1, "#0000FF"]])],
				["wb_ragstatus", RAG_MAP],
			]),
		);
		expect(urls).toHaveLength(4);
		expect(urls.every((url) => url.includes("$filter=LogicalName eq 'statuscode'&"))).toBe(true);
		expect(warnings).toEqual([]);
	});

	it("uses the fallback for every column when getEntityMetadata fails", async () => {
		const fetchJson: FetchJson = () => Promise.resolve({ value: [{ LogicalName: "wb_ragstatus", OptionSet: { Options: RAG_OPTIONS } }] });
		const { store, utils } = setup(() => Promise.reject(new Error("no metadata")), fetchJson);
		expect(await store.load("t", ["wb_ragstatus"], utils)).toEqual(new Map([["wb_ragstatus", RAG_MAP]]));
	});

	it("warns once per column neither source describes", async () => {
		const { store, utils, warnings } = setup(() => Promise.resolve({}));
		expect(await store.load("t", ["wb_a", "wb_b"], utils)).toEqual(new Map());
		expect(warnings).toEqual([
			"option colours for t.wb_a couldn't be read; fromOption colours on it use defaults.fallbackColor.",
			"option colours for t.wb_b couldn't be read; fromOption colours on it use defaults.fallbackColor.",
		]);
	});

	it("never rejects", async () => {
		const warnings: string[] = [];
		const store = createMetadataStore({
			warn: (m) => {
				warnings.push(m);
				if (m.startsWith("option colours for t.c")) throw new Error("sink failed");
			},
		});
		expect(await store.load("t", ["c"], { getEntityMetadata: () => Promise.resolve({}) })).toEqual(new Map());
		expect(warnings[1]).toBe("option colours for t couldn't be read (Error: sink failed).");
	});
});
