/**
 * Which table a grid shows, so the right config file is loaded (decisions.md V9).
 *
 * `context.page.entityTypeName` is the table of the **page**. On a table's main
 * grid that's the grid's table, but on a form it's the form's table, so a
 * subgrid showing another table would get the form table's rules (#30). The
 * grid passes a form subgrid's own table only in the undocumented
 * `context.factory._customControlProperties.descriptor.Parameters.TargetEntityType`,
 * so that's read first, and the page's table is the fallback. The main grid
 * has no `TargetEntityType`.
 *
 * Nothing here throws.
 */
import type { Warn } from "./warnings";

/** Reads `value[key]` from anything, or `undefined`. */
function read(value: unknown, key: string): unknown {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function readPath(value: unknown, path: readonly string[]): unknown {
	return path.reduce(read, value);
}

const TARGET_TABLE = ["factory", "_customControlProperties", "descriptor", "Parameters", "TargetEntityType"];
const PAGE_TABLE = ["page", "entityTypeName"];
/** Set on a form (the open record's id); not on a table's main grid. */
const FORM_RECORD = ["mode", "contextInfo", "entityId"];

/**
 * The grid's table logical name: a form subgrid's `TargetEntityType`, else the
 * page's table. Warns when a grid on a form has no `TargetEntityType`, which
 * would mean the platform changed and a subgrid of another table may get the
 * form's rules. Returns `null` when neither is a non-empty string.
 */
export function gridTableOf(context: unknown, warn: Warn): string | null {
	try {
		const target = readPath(context, TARGET_TABLE);
		if (typeof target === "string" && target !== "") return target;
		const page = readPath(context, PAGE_TABLE);
		const pageTable = typeof page === "string" && page !== "" ? page : null;
		const formRecord = readPath(context, FORM_RECORD);
		if (pageTable && typeof formRecord === "string" && formRecord !== "") {
			warn(`couldn't read this subgrid's table, so it uses the rules for the form's table ${pageTable}. A subgrid of another table may be formatted wrongly; report it.`);
		}
		return pageTable;
	} catch {
		return null;
	}
}
