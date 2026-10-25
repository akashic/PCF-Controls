/**
 * Option colours for `fromOption` (spike V3, `docs/decisions.md`).
 *
 * Primary source: `context.utils.getEntityMetadata(table, columns)`. Its
 * documented `Attributes.get(col).OptionSet` has no colours; they're only in
 * `Attributes.get(col).attributeDescriptor.OptionSet[]` (`{ Value, Label, Color }`,
 * `Color` missing when the option has none), which isn't in the typings. Every
 * step is checked, so a change of shape gives "missing", never an exception.
 *
 * Fallback for columns that aren't found that way: the documented Web API
 * metadata endpoint, one request per choice attribute type. It's best-effort:
 * it uses `fetch` against the org's own `/api/data`, so it only works in the
 * web client of Dataverse online, not in the mobile apps or offline.
 *
 * Colours are kept as written. `colours.ts` validates them when it uses them.
 */
import type { ColumnName, TableConfig } from "./configSchema";
import { isFromOptionColor } from "./configSchema";
import type { OptionColours } from "./colours";
import { isRecord } from "./guards";

type MutableOptionColours = Map<ColumnName, Map<number, string>>;

/** The result of reading one metadata source. */
export interface OptionColourRead {
	/** Colours per column found (a column whose options have no colours maps to an empty map). */
	readonly colours: OptionColours;
	/** Requested columns that source didn't describe. */
	readonly missing: readonly ColumnName[];
}

/**
 * The choice columns whose option colours the config needs: every
 * `fromOption` in a rule's `backgroundColor` or `color`, sorted. Columns of a
 * related table (`alias.column`) are left out: the grid's table metadata
 * doesn't describe them, so those rules fall back to `defaults.fallbackColor`.
 */
export function optionColumns(config: TableConfig | null): ColumnName[] {
	const columns = new Set<ColumnName>();
	for (const rule of config?.rules ?? []) {
		for (const colour of [rule.style?.backgroundColor, rule.style?.color]) {
			if (colour !== undefined && isFromOptionColor(colour) && !colour.fromOption.includes(".")) columns.add(colour.fromOption);
		}
	}
	return [...columns].sort();
}

/** Option value → colour from a list of `{ Value, Color }` options. Options with no colour are left out. */
function coloursOf(options: unknown[]): Map<number, string> {
	const colours = new Map<number, string>();
	for (const option of options) {
		if (!isRecord(option)) continue;
		const value = typeof option.Value === "string" && option.Value.trim() !== "" ? Number(option.Value) : option.Value;
		if (typeof value === "number" && Number.isInteger(value) && typeof option.Color === "string" && option.Color !== "") {
			colours.set(value, option.Color);
		}
	}
	return colours;
}

/** Calls `read` and returns `undefined` if it throws. */
function attempt<T>(read: () => T): T | undefined {
	try {
		return read();
	} catch {
		return undefined;
	}
}

/** `metadata.Attributes.get(column)`, whichever lookup the collection offers, or `undefined`. */
function attributeOf(metadata: unknown, column: ColumnName): unknown {
	const attributes = attempt(() => (isRecord(metadata) ? metadata.Attributes : undefined));
	if (!isRecord(attributes)) return undefined;
	for (const method of ["get", "getByName"] as const) {
		const lookup = attempt(() => attributes[method]);
		if (typeof lookup !== "function") continue;
		const found = attempt(() => (lookup as (name: string) => unknown).call(attributes, column));
		if (found !== undefined && found !== null) return found;
	}
	return undefined;
}

/**
 * Reads option colours from `getEntityMetadata`'s result through
 * `Attributes.get(col).attributeDescriptor.OptionSet[].Color`. A column is
 * `missing` when its attribute or that options array isn't there. Never throws.
 */
export function readEntityMetadataColours(metadata: unknown, columns: readonly ColumnName[]): OptionColourRead {
	const colours: MutableOptionColours = new Map();
	const missing: ColumnName[] = [];
	for (const column of columns) {
		const attribute = attributeOf(metadata, column);
		const options = attempt(() => {
			const descriptor = isRecord(attribute) ? attribute.attributeDescriptor : undefined;
			return isRecord(descriptor) ? descriptor.OptionSet : undefined;
		});
		if (Array.isArray(options)) colours.set(column, coloursOf(options));
		else missing.push(column);
	}
	return { colours, missing };
}

/** Attribute metadata types that have an `OptionSet` with option colours. */
export const CHOICE_METADATA_TYPES = [
	"PicklistAttributeMetadata",
	"MultiSelectPicklistAttributeMetadata",
	"StateAttributeMetadata",
	"StatusAttributeMetadata",
] as const;

const LOGICAL_NAME = /^[a-z][a-z0-9_]*$/;

/**
 * Web API metadata URLs (relative to the org) that return `columns`' options with
 * colours: one per choice attribute type, since `OptionSet` needs a typed cast.
 * Empty when there's nothing safe to ask for.
 */
export function metadataFallbackUrls(table: string, columns: readonly ColumnName[], apiVersion = "9.2"): string[] {
	const names = columns.filter((column) => LOGICAL_NAME.test(column));
	if (!LOGICAL_NAME.test(table) || names.length === 0) return [];
	const filter = names.map((name) => `LogicalName eq '${name}'`).join(" or ");
	return CHOICE_METADATA_TYPES.map(
		(type) =>
			`/api/data/v${apiVersion}/EntityDefinitions(LogicalName='${table}')/Attributes/Microsoft.Dynamics.CRM.${type}` +
			`?$select=LogicalName&$filter=${filter}&$expand=OptionSet($select=Options)`,
	);
}

/**
 * Reads the JSON bodies of the {@link metadataFallbackUrls} responses
 * (`{ value: [{ LogicalName, OptionSet: { Options: [{ Value, Color }] } }] }`).
 * Bodies that failed can be passed as `null`. Never throws.
 */
export function readWebApiColours(bodies: readonly unknown[], columns: readonly ColumnName[]): OptionColourRead {
	const wanted = new Set(columns);
	const colours: MutableOptionColours = new Map();
	for (const body of bodies) {
		const rows = isRecord(body) ? body.value : undefined;
		if (!Array.isArray(rows)) continue;
		for (const row of rows) {
			if (!isRecord(row) || typeof row.LogicalName !== "string" || !wanted.has(row.LogicalName)) continue;
			const options = isRecord(row.OptionSet) ? row.OptionSet.Options : undefined;
			if (Array.isArray(options)) colours.set(row.LogicalName, coloursOf(options));
		}
	}
	return { colours, missing: columns.filter((column) => !colours.has(column)) };
}

/** Both sources combined; `primary` wins for a column both describe. */
export function mergeOptionColours(primary: OptionColours, fallback: OptionColours): OptionColours {
	const merged = new Map(fallback);
	for (const [column, colours] of primary) merged.set(column, colours);
	return merged;
}
