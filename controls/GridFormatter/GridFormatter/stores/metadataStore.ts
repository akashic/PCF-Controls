/**
 * Loads option colours for the choice columns a table's rules use with
 * `fromOption`, once per table per page (spike V3).
 *
 * 1. `context.utils.getEntityMetadata(table, columns)`, one call per table,
 *    read through `attributeDescriptor.OptionSet[].Color` (`optionMetadata.ts`).
 * 2. For columns that call didn't describe: the documented Web API metadata
 *    endpoint, one request per choice attribute type, all in parallel.
 * 3. Columns neither source describes: one warning each. Their `fromOption`
 *    colours resolve to `defaults.fallbackColor`, or don't style.
 */
import type { OptionColours } from "../engine/colours";
import type { ColumnName } from "../engine/configSchema";
import { mergeOptionColours, metadataFallbackUrls, readEntityMetadataColours, readWebApiColours } from "../engine/optionMetadata";
import type { Warn } from "../engine/warnings";

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

const EMPTY: OptionColours = new Map();

export function createMetadataStore({ warn, fetchJson }: MetadataStoreOptions): MetadataStore {
	const cache = new Map<string, Promise<OptionColours>>();

	async function fromEntityMetadata(table: string, columns: readonly ColumnName[], utils: UtilsLike) {
		try {
			return readEntityMetadataColours(await utils.getEntityMetadata(table, [...columns]), columns);
		} catch {
			return { colours: EMPTY, missing: columns };
		}
	}

	async function fromWebApi(table: string, columns: readonly ColumnName[]) {
		if (!fetchJson || columns.length === 0) return { colours: EMPTY, missing: columns };
		const bodies = await Promise.all(
			metadataFallbackUrls(table, columns).map((url) => fetchJson(url).catch((): unknown => null)),
		);
		return readWebApiColours(bodies, columns);
	}

	async function fetchColours(table: string, columns: readonly ColumnName[], utils: UtilsLike): Promise<OptionColours> {
		const primary = await fromEntityMetadata(table, columns, utils);
		const fallback = await fromWebApi(table, primary.missing);
		for (const column of fallback.missing) {
			warn(`option colours for ${table}.${column} couldn't be read; fromOption colours on it use defaults.fallbackColor.`);
		}
		return mergeOptionColours(primary.colours, fallback.colours);
	}

	return {
		load(table, columns, utils) {
			if (columns.length === 0) return Promise.resolve(EMPTY);
			const key = `${table}\u0000${columns.join(",")}`;
			let pending = cache.get(key);
			if (!pending) {
				pending = fetchColours(table, columns, utils).catch((error: unknown) => {
					warn(`option colours for ${table} couldn't be read (${String(error)}).`);
					return EMPTY;
				});
				cache.set(key, pending);
			}
			return pending;
		},
	};
}
