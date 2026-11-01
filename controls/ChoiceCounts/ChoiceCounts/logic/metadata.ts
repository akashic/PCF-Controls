/**
 * Reads what the control needs about the counted table and its grouped column: the
 * table's primary ID column, the column's kind, and its options (value, label, colour,
 * hidden) in metadata order. Pure functions over unknown shapes, so the loader in
 * index.ts can try each source and fall back without anything throwing.
 *
 * Primary source: `context.utils.getEntityMetadata(table, [column])` (brief §3, VERIFY
 * C-4). Its options with colours are on `Attributes.get(column).attributeDescriptor`,
 * as GridFormatter found (its decisions.md V3).
 * Fallback: the Web API metadata endpoint, one typed request per kind of column.
 */
import { groupColumnKind, type ChoiceOption, type GroupColumnKind } from "./results";

export interface ColumnMetadata {
  readonly primaryIdColumn: string;
  readonly kind: GroupColumnKind;
  readonly options: readonly ChoiceOption[];
}

export type MetadataRead =
  | { readonly ok: true; readonly metadata: ColumnMetadata }
  | { readonly ok: false; readonly reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Calls `read` and returns `undefined` if it throws, so an unexpected shape is "missing", never an exception. */
function attempt<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/** A label as metadata writes it: a plain string (PCF), or `{ UserLocalizedLabel: { Label } }` (Web API). */
function labelText(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (!isRecord(raw)) return null;
  const localized = raw.UserLocalizedLabel;
  if (isRecord(localized) && typeof localized.Label === "string") return localized.Label;
  const labels = raw.LocalizedLabels;
  if (Array.isArray(labels) && isRecord(labels[0]) && typeof labels[0].Label === "string") return labels[0].Label;
  return null;
}

/** One option from `{ Value, Label, Color, IsHidden }`, or `null` if it has no whole-number value. */
function option(raw: unknown): ChoiceOption | null {
  if (!isRecord(raw)) return null;
  const value = typeof raw.Value === "string" && raw.Value.trim() !== "" ? Number(raw.Value) : raw.Value;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  return {
    value,
    label: labelText(raw.Label) ?? String(value),
    color: typeof raw.Color === "string" && raw.Color !== "" ? raw.Color : null,
    hidden: raw.IsHidden === true,
  };
}

/** The options of a list in metadata order, skipping entries that aren't options. */
export function readOptions(raw: unknown): ChoiceOption[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map(option).filter((o): o is ChoiceOption => o !== null);
}

/** A Boolean column's two options, `False` then `True` (0 then 1), as the platform lists them. */
export function readBooleanOptions(optionSet: unknown): ChoiceOption[] | null {
  if (!isRecord(optionSet)) return null;
  const options = [optionSet.FalseOption, optionSet.TrueOption].map(option);
  return options.every((o): o is ChoiceOption => o !== null) ? options : null;
}

/** `metadata.Attributes.get(column)`, whichever lookup the collection offers, or `undefined`. */
function attributeOf(metadata: unknown, column: string): unknown {
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
 * Reads `getEntityMetadata`'s result. Returns what it could find; anything missing
 * (`undefined`) is then read from the Web API.
 */
export function readEntityMetadata(
  metadata: unknown,
  column: string,
): { primaryIdColumn?: string; kind?: GroupColumnKind | null; options?: ChoiceOption[] } {
  const primaryId = attempt(() => (isRecord(metadata) ? metadata.PrimaryIdAttribute : undefined));
  const attribute = attributeOf(metadata, column);
  const descriptor = attempt(() => (isRecord(attribute) ? attribute.attributeDescriptor : undefined));
  // getEntityMetadata's descriptor has Type ("picklist", "boolean", "status", "state"; decisions.md C-4).
  const type = attempt(() => (isRecord(descriptor) ? (descriptor.Type ?? descriptor.AttributeType ?? descriptor.AttributeTypeName) : undefined));
  const kind = type === undefined ? undefined : groupColumnKind(isRecord(type) ? type.Value : type);
  const optionSet = attempt(() => (isRecord(descriptor) ? descriptor.OptionSet : undefined));
  const options = kind === "yesNo" ? readBooleanOptions(optionSet) ?? readOptions(optionSet) : readOptions(optionSet);
  return {
    ...(typeof primaryId === "string" && primaryId !== "" ? { primaryIdColumn: primaryId.toLowerCase() } : {}),
    ...(kind !== undefined ? { kind } : {}),
    ...(options && options.length > 0 ? { options } : {}),
  };
}

/** The Web API metadata type to cast to for each kind of column. */
const METADATA_TYPE: Record<GroupColumnKind, string> = {
  choice: "PicklistAttributeMetadata",
  status: "StatusAttributeMetadata",
  state: "StateAttributeMetadata",
  yesNo: "BooleanAttributeMetadata",
};

/** Web API paths (relative to `/api/data/v9.2/`) for the table's primary ID and the column's type. */
export function metadataPaths(table: string, column: string): { table: string; column: string } {
  return {
    table: `EntityDefinitions(LogicalName='${table}')?$select=PrimaryIdAttribute`,
    column: `EntityDefinitions(LogicalName='${table}')/Attributes(LogicalName='${column}')?$select=AttributeType,AttributeTypeName`,
  };
}

/** The Web API path that returns the column's options, with a local or global choice expanded. */
export function optionsPath(table: string, column: string, kind: GroupColumnKind): string {
  const base = `EntityDefinitions(LogicalName='${table}')/Attributes(LogicalName='${column}')/Microsoft.Dynamics.CRM.${METADATA_TYPE[kind]}?$select=LogicalName`;
  return kind === "choice" ? `${base}&$expand=OptionSet,GlobalOptionSet` : `${base}&$expand=OptionSet`;
}

/** The column's kind from the Web API's `{ AttributeType, AttributeTypeName: { Value } }`. */
export function readWebApiKind(json: unknown): GroupColumnKind | null {
  if (!isRecord(json)) return null;
  const typeName = isRecord(json.AttributeTypeName) ? json.AttributeTypeName.Value : undefined;
  return groupColumnKind(typeName) ?? groupColumnKind(json.AttributeType);
}

/** The options from the Web API's typed attribute metadata (a global choice wins over the local one). */
export function readWebApiOptions(json: unknown, kind: GroupColumnKind): ChoiceOption[] | null {
  if (!isRecord(json)) return null;
  const optionSets = [json.GlobalOptionSet, json.OptionSet].filter(isRecord);
  for (const optionSet of optionSets) {
    const options = kind === "yesNo" ? readBooleanOptions(optionSet) : readOptions(optionSet.Options);
    if (options && options.length > 0) return options;
  }
  return null;
}
