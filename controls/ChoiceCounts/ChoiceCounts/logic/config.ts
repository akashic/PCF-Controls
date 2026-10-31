/**
 * Reads and validates the manifest's input properties (brief §4). Every name is
 * project-supplied and may use any prefix (ADR-0005), so nothing here assumes one.
 */
import { parseFilterXml, type XmlElement } from "./filterXml";

/** A logical name as Dataverse writes it. Anything else could inject into the query. */
const LOGICAL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface CountsConfig {
  readonly tableName: string;
  readonly groupColumn: string;
  /** The lookup on `tableName` that points at the form's record, or `null` to count every row. */
  readonly relationshipColumn: string | null;
  /** The parsed, allow-listed filter fragment (empty when there's none). */
  readonly filter: readonly XmlElement[];
  /** The option values to show, in this order, or `null` for every option. */
  readonly optionValues: readonly number[] | null;
}

export interface RawInputs {
  readonly tableName?: string | null;
  readonly groupColumn?: string | null;
  readonly relationshipColumn?: string | null;
  readonly filterXml?: string | null;
  readonly optionValues?: string | null;
}

export type ConfigResult =
  | { readonly ok: true; readonly config: CountsConfig; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

const blankToNull = (raw: string | null | undefined): string | null => {
  const trimmed = raw?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

/**
 * Validates every input. Errors make the whole configuration unusable (the control
 * shows "—"); warnings name parts that were skipped (unusable `optionValues` entries).
 */
export function parseConfig(raw: RawInputs): ConfigResult {
  const errors: string[] = [];
  const name = (label: string, value: string | null, required: boolean): string | null => {
    if (value === null) {
      if (required) errors.push(`${label} is required`);
      return null;
    }
    if (!LOGICAL_NAME.test(value)) {
      errors.push(`${label} "${value}" isn't a logical name`);
      return null;
    }
    return value;
  };

  const tableName = name("Table to count", blankToNull(raw.tableName), true);
  const groupColumn = name("Group by column", blankToNull(raw.groupColumn), true);
  const relationshipColumn = name("Relationship column", blankToNull(raw.relationshipColumn), false);

  let filter: readonly XmlElement[] = [];
  const filterXml = blankToNull(raw.filterXml);
  if (filterXml !== null) {
    const parsed = parseFilterXml(filterXml);
    if (parsed.ok) filter = parsed.nodes;
    else errors.push(`Filter (FetchXML): ${parsed.reason}`);
  }

  const { values: optionValues, warnings } = parseOptionValues(raw.optionValues);

  if (errors.length > 0 || tableName === null || groupColumn === null) return { ok: false, errors };
  return { ok: true, config: { tableName, groupColumn, relationshipColumn, filter, optionValues }, warnings };
}

/**
 * Parses "1, 2,3" into `[1, 2, 3]`. Entries that aren't whole numbers, and repeats, are
 * skipped with a warning. Blank, or nothing usable, means every option (`null`).
 */
export function parseOptionValues(raw: string | null | undefined): { values: number[] | null; warnings: string[] } {
  const text = blankToNull(raw);
  if (text === null) return { values: null, warnings: [] };
  const values: number[] = [];
  const warnings: string[] = [];
  for (const entry of text.split(",").map((part) => part.trim())) {
    if (!/^-?[0-9]+$/.test(entry) || !Number.isSafeInteger(Number(entry))) {
      warnings.push(`Options to show: "${entry}" isn't an option value, so it's skipped`);
      continue;
    }
    const value = Number(entry);
    if (values.includes(value)) warnings.push(`Options to show: ${value} is listed more than once`);
    else values.push(value);
  }
  return { values: values.length > 0 ? values : null, warnings };
}

export type RecordId =
  | { readonly kind: "empty" }
  | { readonly kind: "guid"; readonly id: string }
  | { readonly kind: "invalid"; readonly raw: string };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The bound record ID: empty on a new record before its first save (VERIFY C-1),
 * otherwise a GUID, with braces stripped and lower-cased.
 */
export function normalizeRecordId(raw: string | null | undefined): RecordId {
  const text = blankToNull(raw);
  if (text === null) return { kind: "empty" };
  const id = text.replace(/^\{(.*)\}$/, "$1").toLowerCase();
  return GUID.test(id) ? { kind: "guid", id } : { kind: "invalid", raw: text };
}
