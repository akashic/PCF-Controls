import { createConfigStore, type WebApiLike } from "../GridFormatter/stores/configStore";
import { createWarnOnce } from "../GridFormatter/engine/warnings";
import { example, exampleBase64 } from "./engineHelpers";

const base64 = (text: string): string => Buffer.from(text).toString("base64");

/** A store with a recording warn-once sink and info sink, and a fake Web API. */
function setup(respond: (entity: string, options?: string) => Promise<unknown>) {
	const warnings: string[] = [];
	const infos: string[] = [];
	const store = createConfigStore({ warn: createWarnOnce((m) => warnings.push(m)), info: (m) => infos.push(m) });
	const calls: [string, string | undefined][] = [];
	const webAPI: WebApiLike = {
		retrieveMultipleRecords: (entity, options) => {
			calls.push([entity, options]);
			return respond(entity, options);
		},
	};
	return { store, webAPI, warnings, infos, calls };
}

const found = (content: unknown, name = "abc_GridFormatter.t.json") => Promise.resolve({ entities: [{ name, content }] });

describe("configStore", () => {
	it("loads <prefix>_GridFormatter.<table>.json under any prefix and decodes it", async () => {
		const { store, webAPI, warnings, infos, calls } = setup(() => found(exampleBase64("wb_gridspike"), "lc_GridFormatter.wb_gridspike.json"));
		const config = await store.load("wb_gridspike", webAPI);
		const expected = example("wb_gridspike");
		expect(config).toEqual({ version: 1, defaults: expected.defaults, rules: expected.rules });
		expect(calls).toEqual([
			["webresource", "?$select=name,content&$filter=endswith(name,'[_]GridFormatter.wb[_]gridspike.json')&$orderby=name&$top=10"],
		]);
		expect(warnings).toEqual([]);
		expect(infos).toEqual([]);
	});

	it("matches the table name whatever its case", async () => {
		const { store, webAPI, calls } = setup(() => found(exampleBase64("rag-row"), "abc_GridFormatter.account.json"));
		expect(await store.load("Account", webAPI)).not.toBeNull();
		expect(await store.load("account", webAPI)).not.toBeNull();
		expect(calls).toHaveLength(1);
	});

	it("warns when several prefixes have a file, and uses the first name alphabetically", async () => {
		const { store, webAPI, warnings } = setup(() =>
			Promise.resolve({
				entities: [
					{ name: "xyz_GridFormatter.t.json", content: base64('{"version":2,"rules":[]}') },
					{ name: "abc_GridFormatter.t.json", content: exampleBase64("rag-row") },
				],
			}),
		);
		const config = await store.load("t", webAPI);
		expect(config?.rules.map((r) => r.id)).toEqual(["rag-row"]);
		expect(warnings).toEqual([
			"2 configs found for table t: abc_GridFormatter.t.json, xyz_GridFormatter.t.json. Using abc_GridFormatter.t.json; keep one per table.",
		]);
	});

	it("ignores files whose name only matched the wildcard query", async () => {
		const { store, webAPI, infos } = setup(() => found(exampleBase64("rag-row"), "a_x_GridFormatter.t.json"));
		expect(await store.load("t", webAPI)).toBeNull();
		expect(infos).toEqual(["no config web resource <prefix>_GridFormatter.t.json; the grid is shown without formatting."]);
	});

	it("loads once per table, sharing the request between grids", async () => {
		const { store, webAPI, calls } = setup(() => found(exampleBase64("combined"), "wb_GridFormatter.wb_gridspike.json"));
		const [a, b] = await Promise.all([store.load("wb_gridspike", webAPI), store.load("wb_gridspike", webAPI)]);
		const c = await store.load("wb_gridspike", webAPI);
		expect(a).not.toBeNull();
		expect(b).toBe(a);
		expect(c).toBe(a);
		expect(calls).toHaveLength(1);
		await store.load("account", webAPI);
		expect(calls).toHaveLength(2);
	});

	it("behaves like the plain grid when the file doesn't exist: one info line, no warning", async () => {
		const { store, webAPI, warnings, infos } = setup(() => Promise.resolve({ entities: [] }));
		expect(await store.load("wb_gridspike", webAPI)).toBeNull();
		expect(await store.load("wb_gridspike", webAPI)).toBeNull();
		expect(warnings).toEqual([]);
		expect(infos).toEqual(["no config web resource <prefix>_GridFormatter.wb_gridspike.json; the grid is shown without formatting."]);
	});

	it.each([
		["invalid JSON", base64("{ not json"), /^abc_GridFormatter\.t\.json: config ignored: it isn't valid JSON/],
		["the wrong version", base64('{"version":2,"rules":[]}'), /^abc_GridFormatter\.t\.json: config ignored: version 2 isn't supported/],
		["an empty web resource", null, /^config abc_GridFormatter\.t\.json ignored: the web resource is empty\.$/],
		["content that isn't UTF-8", Buffer.from([0x7b, 0xe9, 0x7d]).toString("base64"), /isn't UTF-8 text/],
	])("gives one warning and the plain grid for %s", async (_label, content, warning) => {
		const { store, webAPI, warnings } = setup(() => found(content));
		expect(await store.load("t", webAPI)).toBeNull();
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(warning);
	});

	it("skips invalid rules one by one", async () => {
		const text = JSON.stringify({ version: 1, rules: [{ id: "bad", scope: "row", style: { width: 1 } }, ...example("rag-row").rules] });
		const { store, webAPI, warnings } = setup(() => found(base64(text)));
		const config = await store.load("t", webAPI);
		expect(config?.rules.map((r) => r.id)).toEqual(["rag-row"]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(/^abc_GridFormatter\.t\.json: rule "bad" skipped/);
	});

	it("is the plain grid when no rule is valid", async () => {
		const { store, webAPI } = setup(() => found(base64('{"version":1,"rules":[]}')));
		expect(await store.load("t", webAPI)).toBeNull();
	});

	it("warns and tries again on the next load when the request fails", async () => {
		let fail = true;
		const { store, webAPI, warnings, calls } = setup(() => (fail ? Promise.reject(new Error("offline")) : found(exampleBase64("rag-row"))));
		expect(await store.load("t", webAPI)).toBeNull();
		expect(warnings).toEqual(["config <prefix>_GridFormatter.t.json couldn't be loaded (offline); the grid is shown without formatting."]);
		fail = false;
		expect(await store.load("t", webAPI)).not.toBeNull();
		expect(calls).toHaveLength(2);
	});

	it("reports a request failure that isn't an Error", async () => {
		const { store, webAPI, warnings } = setup(() => Promise.reject("nope"));
		await store.load("t", webAPI);
		expect(warnings[0]).toContain("couldn't be loaded (nope)");
	});

	it("never rejects, even when reading the response throws", async () => {
		const { store, webAPI, warnings } = setup(() =>
			Promise.resolve({
				get entities(): unknown {
					throw new Error("bad response");
				},
			}),
		);
		expect(await store.load("t", webAPI)).toBeNull();
		expect(warnings).toEqual(["config <prefix>_GridFormatter.t.json couldn't be read (bad response); the grid is shown without formatting."]);
	});

	it.each([null, undefined, "", "bad'name"])("warns without a request when the table name is %p", async (table) => {
		const { store, webAPI, warnings, calls } = setup(() => found(""));
		expect(await store.load(table, webAPI)).toBeNull();
		expect(calls).toEqual([]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(/^no config loaded: the grid's table name .* isn't a table logical name\.$/);
	});

	it("logs to the console by default", async () => {
		const info = jest.spyOn(console, "info").mockImplementation(() => undefined);
		const store = createConfigStore({ warn: () => undefined });
		await store.load("t", { retrieveMultipleRecords: () => Promise.resolve({ entities: [] }) });
		expect(info).toHaveBeenCalledWith("[GridFormatter] no config web resource <prefix>_GridFormatter.t.json; the grid is shown without formatting.");
		info.mockRestore();
	});
});
