// Shared test helpers for the engine tests. Not a test file itself.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeHex, type HexColor } from "@wb-pcf/shared";
import type { OptionColours, ValueGetter } from "../GridFormatter/engine/colours";
import type { Condition, Rule, TableConfig } from "../GridFormatter/engine/configSchema";
import type { GridColumn, RuleMatcher } from "../GridFormatter/engine/resolveStyle";

export const hex = (value: string): HexColor => {
	const result = normalizeHex(value);
	if (!result) throw new Error(`test fixture ${value} is not a valid hex colour`);
	return result;
};

const controlDir = join(__dirname, "..");

/** A file from config/examples/, parsed. */
export const example = (name: string): TableConfig =>
	JSON.parse(readFileSync(join(controlDir, "config", "examples", `${name}.json`), "utf8")) as TableConfig;

/** A file from tests/fixtures/invalid-config/, parsed. */
export const invalidFixture = (name: string): unknown =>
	JSON.parse(readFileSync(join(controlDir, "tests", "fixtures", "invalid-config", `${name}.json`), "utf8"));

// The RAG choice captured in the spike (decisions.md V3).
export const RED = 948790000;
export const AMBER = 948790001;
export const GREEN = 948790002;
export const UNKNOWN = 948790003; // no colour in metadata

export const ragColours: OptionColours = new Map([
	[
		"wb_ragstatus",
		new Map<number, string>([
			[RED, "#D13438"],
			[AMBER, "#FFB900"],
			[GREEN, "#107C10"],
		]),
	],
]);

/** A grid like the spike's `wb_gridspike` views, one column per interesting type. */
export const columns: GridColumn[] = [
	{ name: "wb_name", dataType: "Text", isPrimary: true },
	{ name: "statecode", dataType: "OptionSet" },
	{ name: "wb_ragstatus", dataType: "OptionSet" },
	{ name: "wb_duedate", dataType: "DateOnly" },
	{ name: "wb_budget", dataType: "Currency" },
	{ name: "wb_actualcost", dataType: "Currency" },
	{ name: "ownerid", dataType: "Persona" },
	{ name: "wb_account", dataType: "Lookup" },
	{ name: "wb_tags", dataType: "MultiSelectPicklist" },
	{ name: "wb_notes", dataType: "Text" },
];

export const column = (name: string): GridColumn => {
	const found = columns.find((c) => c.name === name);
	if (!found) throw new Error(`no test column ${name}`);
	return found;
};

export const getter =
	(row: Record<string, unknown>): ValueGetter =>
	(name) =>
		row[name];

/** Matches rules by id, for precedence tests that don't care about conditions. */
export const matchIds =
	(...ids: string[]): RuleMatcher =>
	(rule) =>
		ids.includes(rule.id);

/**
 * A stand-in for the real condition evaluator (issue #11), covering only the
 * operators the example configs use. Dates are date-only strings; "today" is fixed.
 */
export function evaluate(condition: Condition, getValue: ValueGetter, today = "2026-10-22"): boolean {
	if ("all" in condition) return condition.all.every((c) => evaluate(c, getValue, today));
	if ("any" in condition) return condition.any.some((c) => evaluate(c, getValue, today));
	if ("not" in condition) return !evaluate(condition.not, getValue, today);
	const value = getValue(condition.column);
	const operand: unknown = condition.value;
	const other = typeof operand === "object" && operand !== null && !Array.isArray(operand) ? getValue((operand as { column: string }).column) : operand;
	switch (condition.op) {
		case "eq":
			return value === other;
		case "isNull":
			return value === null || value === undefined;
		case "isNotNull":
			return value !== null && value !== undefined;
		case "gt":
			return typeof value === "number" && typeof other === "number" && value > other;
		case "beforeToday":
			return typeof value === "string" && value < today;
		default:
			throw new Error(`test evaluator doesn't support ${condition.op}`);
	}
}

/** A matcher for one row using the stand-in evaluator. */
export const rowMatcher =
	(getValue: ValueGetter): RuleMatcher =>
	(rule: Rule) =>
		evaluate(rule.when as Condition, getValue);

/** `getEntityMetadata` as captured in the spike (V3): a collection with `get`, colours in attributeDescriptor. */
export function spikeMetadata(columns: Record<string, unknown[]>): unknown {
	const attributes = new Map(Object.entries(columns).map(([name, options]) => [name, { OptionSet: {}, attributeDescriptor: { OptionSet: options } }]));
	return { Attributes: { get: (name: string) => attributes.get(name) } };
}

export const RAG_OPTIONS = [
	{ Value: RED, Label: "Red", Color: "#D13438", IsHidden: false },
	{ Value: AMBER, Label: "Amber", Color: "#FFB900", IsHidden: false },
	{ Value: GREEN, Label: "Green", Color: "#107C10", IsHidden: false },
	{ Value: UNKNOWN, Label: "Unknown", IsHidden: false },
];

/** `tests/fixtures/rowdata.wb_gridspike.json`: rowData and colDefs captured in the spike (V1). */
export interface RowDataFixture {
	readonly colDefs: { readonly name: string; readonly dataType: string; readonly isPrimary: boolean }[];
	readonly rows: Record<string, unknown>[];
	readonly formattedValues: Record<string, string>;
	readonly user: { readonly timeZoneOffsetMinutes: number };
}

export const rowDataFixture = (): RowDataFixture =>
	JSON.parse(readFileSync(join(controlDir, "tests", "fixtures", "rowdata.wb_gridspike.json"), "utf8")) as RowDataFixture;

/** A config example's file bytes as Base64, as Dataverse returns them in `webresource.content`. */
export const exampleBase64 = (name: string): string =>
	readFileSync(join(controlDir, "config", "examples", `${name}.json`)).toString("base64");
