/**
 * Finding and decoding a table's config web resource (ADR-0004).
 *
 * The config for table `<table>` is the web resource named
 * `wb_/GridFormatter/<table>.json`. The control reads it with
 * `webAPI.retrieveMultipleRecords("webresource", configQuery(name))`. Dataverse
 * returns the file in `content` as **Base64 of the file's bytes** (the
 * `webresource.content` column reference), so the text is Base64-decoded and
 * then read as UTF-8. A UTF-8 byte order mark, which some Windows editors
 * write, is dropped.
 *
 * Nothing here throws.
 */

/** Every config web resource's name starts with this. */
export const CONFIG_WEB_RESOURCE_PREFIX = "wb_/GridFormatter/";

/** A Dataverse table logical name: letters, digits and `_` (and no quotes, so it's safe in an OData string). */
const TABLE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** `wb_/GridFormatter/<table>.json`, or `null` when `table` isn't a table logical name. */
export function configWebResourceName(table: unknown): string | null {
	return typeof table === "string" && TABLE_NAME.test(table) ? `${CONFIG_WEB_RESOURCE_PREFIX}${table.toLowerCase()}.json` : null;
}

/** The `retrieveMultipleRecords("webresource", …)` options that find one web resource by name. */
export function configQuery(name: string): string {
	// OData string literals escape a single quote by doubling it.
	return `?$select=name,content&$filter=name eq '${name.replace(/'/g, "''")}'&$top=1`;
}

/** What the `webresource` query found. */
export type ConfigRecord =
	| { readonly kind: "missing" }
	| { readonly kind: "empty" }
	| { readonly kind: "content"; readonly base64: string };

/** Reads the result of {@link configQuery}: no row is `missing`; a row with no `content` is `empty`. */
export function readConfigRecord(response: unknown): ConfigRecord {
	const entities = typeof response === "object" && response !== null ? (response as { entities?: unknown }).entities : undefined;
	const first: unknown = Array.isArray(entities) ? entities[0] : undefined;
	if (typeof first !== "object" || first === null) return { kind: "missing" };
	const content = (first as { content?: unknown }).content;
	return typeof content === "string" && content.trim() !== "" ? { kind: "content", base64: content } : { kind: "empty" };
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
