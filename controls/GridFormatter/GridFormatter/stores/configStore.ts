/**
 * Loads each table's config web resource, `<prefix>_GridFormatter.<table>.json`
 * under any publisher prefix (ADR-0004, ADR-0005), once per page.
 *
 * - The cache is per store; `index.ts` keeps one store at module scope, so every
 *   grid of the same table on the page shares one request (even while it's in flight).
 * - No such web resource: the plain grid, with one console info line.
 * - More than one (different prefixes): one warning, and the first name in
 *   alphabetical order is used.
 * - Not Base64/UTF-8, not JSON, not an object or the wrong version: one warning,
 *   the plain grid. Invalid rules are skipped one by one (`validate.ts`).
 * - A failed request: one warning, the plain grid, and the table isn't cached,
 *   so the next grid tries again.
 *
 * Not cached in `sessionStorage`: rules would then outlive a page reload, so a
 * newly deployed config wouldn't show until the browser tab was closed.
 */
import type { TableConfig } from "../engine/configSchema";
import { parseConfig } from "../engine/validate";
import { configNamePattern, configQuery, configTable, decodeBase64Utf8, readConfigRecord } from "../engine/webResource";
import { WARNING_PREFIX, type Warn } from "../engine/warnings";

/** The part of `context.webAPI` the store uses. */
export interface WebApiLike {
	retrieveMultipleRecords(entityType: string, options?: string): Promise<unknown>;
}

export interface StoreLog {
	/** A `createWarnOnce()` sink. */
	readonly warn: Warn;
	/** Informational messages (the console by default). */
	readonly info?: (message: string) => void;
}

export interface ConfigStore {
	/** The table's validated config, or `null` for the plain grid. Never rejects. */
	load(table: string | null | undefined, webAPI: WebApiLike): Promise<TableConfig | null>;
}

const consoleInfo = (message: string): void => console.info(`${WARNING_PREFIX} ${message}`);

const errorText = (error: unknown): string =>
	typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : String(error);

/** Thrown inside the store when the request itself fails, so the table isn't cached. */
class RequestFailed extends Error {}

export function createConfigStore({ warn, info = consoleInfo }: StoreLog): ConfigStore {
	const cache = new Map<string, Promise<TableConfig | null>>();

	async function fetchConfig(table: string, webAPI: WebApiLike): Promise<TableConfig | null> {
		let response: unknown;
		try {
			response = await webAPI.retrieveMultipleRecords("webresource", configQuery(table));
		} catch (error) {
			warn(`config ${configNamePattern(table)} couldn't be loaded (${errorText(error)}); the grid is shown without formatting.`);
			throw new RequestFailed();
		}
		const record = readConfigRecord(response, table);
		if (record.kind === "missing") {
			info(`no config web resource ${configNamePattern(table)}; the grid is shown without formatting.`);
			return null;
		}
		const { name } = record;
		if (record.others.length > 0) {
			const all = [name, ...record.others];
			warn(`${all.length} configs found for table ${table}: ${all.join(", ")}. Using ${name}; keep one per table.`);
		}
		if (record.kind === "empty") {
			warn(`config ${name} ignored: the web resource is empty.`);
			return null;
		}
		const text = decodeBase64Utf8(record.base64);
		if (text === null) {
			warn(`config ${name} ignored: its content isn't UTF-8 text.`);
			return null;
		}
		const config = parseConfig(text, (message) => warn(`${name}: ${message}`));
		return config && config.rules.length > 0 ? config : null;
	}

	return {
		load(gridTable, webAPI) {
			const table = configTable(gridTable);
			if (table === null) {
				warn(`no config loaded: the grid's table name ${JSON.stringify(gridTable) ?? "undefined"} isn't a table logical name.`);
				return Promise.resolve(null);
			}
			let pending = cache.get(table);
			if (!pending) {
				pending = fetchConfig(table, webAPI).catch((error: unknown) => {
					cache.delete(table);
					if (!(error instanceof RequestFailed))
						warn(`config ${configNamePattern(table)} couldn't be read (${errorText(error)}); the grid is shown without formatting.`);
					return null;
				});
				cache.set(table, pending);
			}
			return pending;
		},
	};
}
