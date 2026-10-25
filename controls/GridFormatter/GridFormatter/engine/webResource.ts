/**
 * Finding and decoding a table's config web resource (ADR-0004, ADR-0005).
 *
 * The config for table `<table>` is the web resource named
 * `<prefix>_GridFormatter.<table>.json`, where `<prefix>` is any publisher's
 * customization prefix: the control can't know which publisher the project
 * uses. The control finds it with
 * `webAPI.retrieveMultipleRecords("webresource", configQuery(table))`, an
 * `endswith` filter, then keeps only names that match exactly. Dataverse
 * returns the file in `content` as **Base64 of the file's bytes** (the
 * `webresource.content` column reference), so the text is Base64-decoded and
 * then read as UTF-8. A UTF-8 byte order mark, which some Windows editors
 * write, is dropped.
 *
 * Nothing here throws.
 */

/** Between the publisher prefix and the table name in every config web resource's name. */
export const CONFIG_NAME_MARKER = "_GridFormatter.";

/** A Dataverse table logical name: letters, digits and `_` (and no quotes, so it's safe in an OData string and a RegExp). */
const TABLE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** The table's logical name in lower case, or `null` when `table` isn't a table logical name. */
export function configTable(table: unknown): string | null {
	return typeof table === "string" && TABLE_NAME.test(table) ? table.toLowerCase() : null;
}

/** `<prefix>_GridFormatter.<table>.json`, the name pattern shown in messages before a file is found. */
export function configNamePattern(table: string): string {
	return `<prefix>${CONFIG_NAME_MARKER}${table}.json`;
}

/** Whether `name` is `<prefix>_GridFormatter.<table>.json` for some publisher prefix (case doesn't matter). */
export function isConfigName(name: unknown, table: string): name is string {
	return typeof name === "string" && new RegExp(`^[A-Za-z][A-Za-z0-9]*_GridFormatter\\.${table}\\.json$`, "i").test(name);
}

/**
 * The `retrieveMultipleRecords("webresource", …)` options that find a table's
 * config files under any prefix. `endswith` treats `_` as a one-character
 * wildcard, so each `_` is written as `[_]`, which matches only `_` (ADR-0005).
 * `$top=50` leaves room for names the query finds but {@link isConfigName}
 * rejects (such as `abc_old_GridFormatter.t.json`), so they can't crowd out a real file.
 */
export function configQuery(table: string): string {
	const suffix = `${CONFIG_NAME_MARKER}${table}.json`.replace(/_/g, "[_]");
	return `?$select=name,content&$filter=endswith(name,'${suffix}')&$orderby=name&$top=50`;
}

/** What the `webresource` query found. `others` are further matching files, which aren't used. */
export type ConfigRecord =
	| { readonly kind: "missing" }
	| { readonly kind: "empty"; readonly name: string; readonly others: readonly string[] }
	| { readonly kind: "content"; readonly name: string; readonly base64: string; readonly others: readonly string[] };

/**
 * Reads the result of {@link configQuery}. Rows whose name isn't exactly a
 * config name for `table` are ignored. Of the rest, the first name in
 * alphabetical order (ignoring case) is used: no row is `missing`; a row with
 * no `content` is `empty`.
 */
export function readConfigRecord(response: unknown, table: string): ConfigRecord {
	const entities = typeof response === "object" && response !== null ? (response as { entities?: unknown }).entities : undefined;
	const rows = (Array.isArray(entities) ? (entities as unknown[]) : [])
		.filter((row): row is { name: string; content?: unknown } => typeof row === "object" && row !== null && isConfigName((row as { name?: unknown }).name, table))
		.sort((a, b) => compareNames(a.name, b.name));
	const [first, ...rest] = rows;
	if (!first) return { kind: "missing" };
	const others = rest.map((row) => row.name);
	const { content } = first;
	return typeof content === "string" && content.trim() !== ""
		? { kind: "content", name: first.name, base64: content, others }
		: { kind: "empty", name: first.name, others };
}

/** Web resource names are unique (ignoring case), so two names never compare equal. */
function compareNames(a: string, b: string): number {
	return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
}

/**
 * Decodes Base64 (whitespace ignored) and reads the bytes as UTF-8. Returns
 * `null` when the input isn't Base64 or the bytes aren't valid UTF-8.
 */
export function decodeBase64Utf8(base64: string): string | null {
	try {
		const binary = atob(base64.replace(/\s+/g, ""));
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		// fatal: reject invalid UTF-8 rather than show U+FFFD; the BOM is dropped by default.
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return null;
	}
}
