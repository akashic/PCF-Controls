import { createMetadataStore, type FetchJson, type UtilsLike } from "../GridFormatter/stores/metadataStore";
import { REQUEST_TIMEOUT_MS } from "../GridFormatter/stores/timeout";
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
		const { store, utils, warnings, metadataCalls } = setup(() => Promise.resolve(spikeMetadata({ wb_ragstatus: RAG_OPTIONS })), fetchJson);
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
		// One fallback request failed, but every column was found, so the result is kept.
		expect(await store.load("t", ["statuscode", "wb_ragstatus"], utils)).toBe(colours);
		expect(metadataCalls).toHaveLength(1);
	});

	it("doesn't keep a result after a failed request, so the next grid asks again", async () => {
		let fail = true;
		const { store, utils, warnings, metadataCalls } = setup(() =>
			fail ? Promise.reject(new Error("offline")) : Promise.resolve(spikeMetadata({ wb_ragstatus: RAG_OPTIONS })),
		);
		expect(await store.load("t", ["wb_ragstatus"], utils)).toEqual(new Map());
		expect(warnings).toEqual(["option colours for t.wb_ragstatus couldn't be read; fromOption colours on it use defaults.fallbackColor."]);
		fail = false;
		expect(await store.load("t", ["wb_ragstatus"], utils)).toEqual(new Map([["wb_ragstatus", RAG_MAP]]));
		expect(metadataCalls).toHaveLength(2);
	});

	it("gives up on each request after 3 s, and the next grid asks again", async () => {
		jest.useFakeTimers();
		try {
			const fetchJson = jest.fn<Promise<unknown>, [string]>(() => new Promise(() => undefined));
			const { store, utils, metadataCalls } = setup(() => new Promise(() => undefined), fetchJson);
			const first = store.load("t", ["wb_ragstatus"], utils);
			await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS); // getEntityMetadata
			expect(fetchJson).toHaveBeenCalledTimes(4);
			await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS); // the Web API fallback
			expect(await first).toEqual(new Map());
			void store.load("t", ["wb_ragstatus"], utils);
			expect(metadataCalls).toHaveLength(2);
			await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS * 2);
		} finally {
			jest.useRealTimers();
		}
	});

	it("uses the fallback for every column when getEntityMetadata fails", async () => {
		const fetchJson: FetchJson = () => Promise.resolve({ value: [{ LogicalName: "wb_ragstatus", OptionSet: { Options: RAG_OPTIONS } }] });
		const { store, utils } = setup(() => Promise.reject(new Error("no metadata")), fetchJson);
		expect(await store.load("t", ["wb_ragstatus"], utils)).toEqual(new Map([["wb_ragstatus", RAG_MAP]]));
	});

	it("warns once per column neither source describes, and keeps that result", async () => {
		const { store, utils, warnings, metadataCalls } = setup(() => Promise.resolve({}));
		expect(await store.load("t", ["wb_a", "wb_b"], utils)).toEqual(new Map());
		expect(warnings).toEqual([
			"option colours for t.wb_a couldn't be read; fromOption colours on it use defaults.fallbackColor.",
			"option colours for t.wb_b couldn't be read; fromOption colours on it use defaults.fallbackColor.",
		]);
		// No request failed: the columns just aren't choices, so asking again wouldn't help.
		await store.load("t", ["wb_a", "wb_b"], utils);
		expect(metadataCalls).toHaveLength(1);
	});

	it("never rejects", async () => {
		const warnings: string[] = [];
		const store = createMetadataStore({
			warn: (m) => {
				warnings.push(m);
				if (m.startsWith("option colours for t.c")) throw new Error("sink failed");
			},
		});
		const getEntityMetadata = jest.fn(() => Promise.resolve({}));
		expect(await store.load("t", ["c"], { getEntityMetadata })).toEqual(new Map());
		expect(warnings[1]).toBe("option colours for t couldn't be read (Error: sink failed).");
		await store.load("t", ["c"], { getEntityMetadata });
		expect(getEntityMetadata).toHaveBeenCalledTimes(2);
	});
});
