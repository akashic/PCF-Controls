import type { TableConfig } from "../GridFormatter/engine/configSchema";
import type { ConfigStore } from "../GridFormatter/stores/configStore";
import type { MetadataStore } from "../GridFormatter/stores/metadataStore";
import { LOAD_TIMEOUT_MS, loadFormatting, startWhenLoaded } from "../GridFormatter/stores/startup";
import { example, ragColours } from "./engineHelpers";

const utils = { getEntityMetadata: () => Promise.resolve({}) };
const webAPI = { retrieveMultipleRecords: () => Promise.resolve({}) };

function deps(config: TableConfig | null) {
	const metadataLoads: [string, readonly string[]][] = [];
	const configStore: ConfigStore = { load: () => Promise.resolve(config) };
	const metadataStore: MetadataStore = {
		load: (table, columns) => {
			metadataLoads.push([table, columns]);
			return Promise.resolve(ragColours);
		},
	};
	return { deps: { configStore, metadataStore, webAPI, utils }, metadataLoads };
}

describe("loadFormatting", () => {
	it("loads the config, then the option colours its fromOption columns need", async () => {
		const config = example("wb_gridspike");
		const { deps: d, metadataLoads } = deps(config);
		expect(await loadFormatting("wb_gridspike", d)).toEqual({ config, optionColours: ragColours });
		expect(metadataLoads).toEqual([["wb_gridspike", ["wb_ragstatus"]]]);
	});

	it("asks for no metadata without a config or a table", async () => {
		const none = deps(null);
		expect(await loadFormatting("t", none.deps)).toEqual({ config: null, optionColours: new Map() });
		const noTable = deps(example("rag-row"));
		expect(await loadFormatting(null, noTable.deps)).toEqual({ config: null, optionColours: new Map() });
		expect([...none.metadataLoads, ...noTable.metadataLoads]).toEqual([]);
	});
});

describe("startWhenLoaded (V5)", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it("fires once with the loaded value and cancels the timeout", async () => {
		const ready = jest.fn();
		const warn = jest.fn();
		startWhenLoaded(Promise.resolve("loaded"), { onReady: ready, warn });
		await jest.advanceTimersByTimeAsync(0);
		expect(ready).toHaveBeenCalledWith("loaded");
		await jest.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS * 2);
		expect(ready).toHaveBeenCalledTimes(1);
		expect(warn).not.toHaveBeenCalled();
	});

	it("fires with nothing after 3 s, with one warning, and ignores a late result", async () => {
		const ready = jest.fn();
		const warn = jest.fn();
		let resolve: (value: string) => void = () => undefined;
		startWhenLoaded(new Promise<string>((r) => (resolve = r)), { onReady: ready, warn });
		await jest.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS - 1);
		expect(ready).not.toHaveBeenCalled();
		await jest.advanceTimersByTimeAsync(1);
		expect(ready).toHaveBeenCalledWith(null);
		expect(warn).toHaveBeenCalledWith("config took longer than 3 s to load; the grid is shown without formatting.");
		resolve("late");
		await jest.advanceTimersByTimeAsync(0);
		expect(ready).toHaveBeenCalledTimes(1);
	});

	it("fires with nothing when loading fails", async () => {
		const ready = jest.fn();
		startWhenLoaded(Promise.reject(new Error("x")), { onReady: ready, warn: jest.fn(), timeoutMs: 50 });
		await jest.advanceTimersByTimeAsync(0);
		expect(ready).toHaveBeenCalledWith(null);
	});

	it("can be cancelled (destroy): no late onReady, no warning, and the timer is cleared", async () => {
		const ready = jest.fn();
		const warn = jest.fn();
		let resolve: (value: string) => void = () => undefined;
		const cancel = startWhenLoaded(new Promise<string>((r) => (resolve = r)), { onReady: ready, warn });
		cancel();
		expect(jest.getTimerCount()).toBe(0);
		resolve("late");
		await jest.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS * 2);
		expect(ready).not.toHaveBeenCalled();
		expect(warn).not.toHaveBeenCalled();
	});

	it("does nothing when cancelled after it has started", async () => {
		const ready = jest.fn();
		const clearTimer = jest.fn();
		const cancel = startWhenLoaded(Promise.resolve(1), { onReady: ready, warn: jest.fn(), clearTimer });
		await jest.advanceTimersByTimeAsync(0);
		expect(clearTimer).toHaveBeenCalledTimes(1);
		cancel();
		expect(clearTimer).toHaveBeenCalledTimes(1);
		expect(ready).toHaveBeenCalledTimes(1);
	});

	it("doesn't warn if the timer still fires after loading finished", async () => {
		let timerCallback: () => void = () => undefined;
		const ready = jest.fn();
		const warn = jest.fn();
		startWhenLoaded(Promise.resolve(1), {
			onReady: ready,
			warn,
			setTimer: (callback) => (timerCallback = callback),
			clearTimer: () => undefined,
		});
		await jest.advanceTimersByTimeAsync(0);
		timerCallback();
		expect(ready).toHaveBeenCalledTimes(1);
		expect(warn).not.toHaveBeenCalled();
	});
});
