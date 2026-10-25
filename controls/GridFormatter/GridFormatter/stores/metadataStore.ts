/**
 * Loads option colours for the choice columns a table's rules use with
 * `fromOption`, once per table until the browser tab reloads (spike V3).
 *
 * 1. `context.utils.getEntityMetadata(table, columns)`, one call per table,
 *    read through `attributeDescriptor.OptionSet[].Color` (`optionMetadata.ts`).
 * 2. For columns that call didn't describe: the documented Web API metadata
 *    endpoint, one request per choice attribute type, all in parallel. This is
 *    best-effort and only works in the web client of Dataverse online.
 * 3. Columns neither source describes: one warning each. Their `fromOption`
 *    colours resolve to `defaults.fallbackColor`, or don't style.
 *
 * Each request is limited to 3 s (`timeout.ts`). When a request fails or times
 * out and a column is still missing, the result isn't cached, so the next grid
 * of that table asks again.
 */
import type { OptionColours } from "../engine/colours";
import type { ColumnName } from "../engine/configSchema";
import {
	mergeOptionColours,
	metadataFallbackUrls,
	readEntityMetadataColours,
	readWebApiColours,
	type OptionColourRead,
} from "../engine/optionMetadata";
import type { Warn } from "../engine/warnings";
import { withTimeout } from "./timeout";

/** The part of `context.utils` the store uses. */
export interface UtilsLike {
	getEntityMetadata(entityName: string, attributes?: string[]): Promise<unknown>;
}

/** GETs a Web API URL (relative to the org) and resolves to its JSON body; rejects on failure. */
export type FetchJson = (url: string) => Promise<unknown>;

export interface MetadataStoreOptions {
	/** A `createWarnOnce()` sink. */
	readonly warn: Warn;
	/** The Web API fallback. Without it, only `getEntityMetadata` is used. */
	readonly fetchJson?: FetchJson;
}

export interface MetadataStore {
	/** Option colours for `columns` of `table`. Never rejects. */
	load(table: string, columns: readonly ColumnName[], utils: UtilsLike): Promise<OptionColours>;
}

/** One source's result, and whether any of its requests failed or timed out. */
interface SourceRead extends OptionColourRead {
	readonly failed: boolean;
}

const EMPTY: OptionColours = new Map();

export function createMetadataStore({ warn, fetchJson }: MetadataStoreOptions): MetadataStore {
	const cache = new Map<string, Promise<OptionColours>>();

	async function fromEntityMetadata(table: string, columns: readonly ColumnName[], utils: UtilsLike): Promise<SourceRead> {
		try {
			return { ...readEntityMetadataColours(await withTimeout(utils.getEntityMetadata(table, [...columns])), columns), failed: false };
		} catch {
			return { colours: EMPTY, missing: columns, failed: true };
		}
	}

	async function fromWebApi(table: string, columns: readonly ColumnName[]): Promise<SourceRead> {
		if (!fetchJson || columns.length === 0) return { colours: EMPTY, missing: columns, failed: false };
		let failed = false;
		const bodies = await Promise.all(
			metadataFallbackUrls(table, columns).map((url) =>
				withTimeout(fetchJson(url)).catch((): unknown => {
					failed = true;
					return null;
				}),
			),
		);
		return { ...readWebApiColours(bodies, columns), failed };
	}

	/** The colours, and whether to try again next time: a request failed and a column is still missing. */
	async function fetchColours(table: string, columns: readonly ColumnName[], utils: UtilsLike) {
		const primary = await fromEntityMetadata(table, columns, utils);
		const fallback = await fromWebApi(table, primary.missing);
		for (const column of fallback.missing) {
			warn(`option colours for ${table}.${column} couldn't be read; fromOption colours on it use defaults.fallbackColor.`);
		}
		const retry = (primary.failed || fallback.failed) && fallback.missing.length > 0;
		return { colours: mergeOptionColours(primary.colours, fallback.colours), retry };
	}

	return {
		load(table, columns, utils) {
			if (columns.length === 0) return Promise.resolve(EMPTY);
			const key = `${table}\u0000${columns.join(",")}`;
			let pending = cache.get(key);
			if (!pending) {
				pending = fetchColours(table, columns, utils).then(
					({ colours, retry }) => {
						if (retry) cache.delete(key);
						return colours;
					},
					(error: unknown) => {
						cache.delete(key);
						warn(`option colours for ${table} couldn't be read (${String(error)}).`);
						return EMPTY;
					},
				);
				cache.set(key, pending);
			}
			return pending;
		},
	};
}
