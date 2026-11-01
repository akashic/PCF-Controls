/**
 * The control's two calls to Dataverse: the counted table's and grouped column's
 * metadata (cached at module scope, so several instances on a form share one load),
 * and the aggregate query. The pure parts are in logic/; this file only does I/O.
 */
import {
  metadataPaths,
  optionsPath,
  readEntityMetadata,
  readWebApiKind,
  readWebApiOptions,
  type ColumnMetadata,
  type MetadataRead,
} from "./logic/metadata";
import type { ChoiceOption, GroupColumnKind } from "./logic/results";

const cache = new Map<string, Promise<MetadataRead>>();

/** GETs a Web API path on the current org, the way GridFormatter's fallback does. Web client only. */
async function webApiGet(path: string): Promise<unknown> {
  const response = await fetch(`/api/data/v9.2/${path}`, {
    headers: { Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" },
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`metadata request failed (${response.status})`);
  return response.json();
}

async function load(utils: ComponentFramework.Utility, table: string, column: string): Promise<MetadataRead> {
  let primaryIdColumn: string | undefined;
  let kind: GroupColumnKind | null | undefined;
  let options: ChoiceOption[] | undefined;

  try {
    ({ primaryIdColumn, kind, options } = readEntityMetadata(await utils.getEntityMetadata(table, [column]), column));
  } catch {
    // Fall through to the Web API for whatever is missing.
  }

  try {
    const paths = metadataPaths(table, column);
    if (primaryIdColumn === undefined) {
      const json = (await webApiGet(paths.table)) as { PrimaryIdAttribute?: unknown };
      if (typeof json.PrimaryIdAttribute === "string") primaryIdColumn = json.PrimaryIdAttribute.toLowerCase();
    }
    if (kind === undefined) kind = readWebApiKind(await webApiGet(paths.column));
    if (kind && options === undefined) options = readWebApiOptions(await webApiGet(optionsPath(table, column, kind)), kind) ?? undefined;
  } catch (error) {
    return { ok: false, reason: `couldn't read the metadata of ${table}.${column}: ${String(error)}` };
  }

  if (!primaryIdColumn) return { ok: false, reason: `couldn't find the primary ID column of ${table}` };
  if (kind === null || kind === undefined) {
    return { ok: false, reason: `${table}.${column} isn't a Choice, Status Reason, Status or Yes/No column (multi-select choices can't be grouped)` };
  }
  if (!options) return { ok: false, reason: `couldn't read the options of ${table}.${column}` };
  const metadata: ColumnMetadata = { primaryIdColumn, kind, options };
  return { ok: true, metadata };
}

/** The metadata for `table`.`column`, loaded once per page. A failed load isn't cached, so a refresh retries it. */
export function loadMetadata(utils: ComponentFramework.Utility, table: string, column: string): Promise<MetadataRead> {
  const key = `${table}|${column}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = load(utils, table, column).then((read) => {
      if (!read.ok) cache.delete(key);
      return read;
    });
    cache.set(key, pending);
  }
  return pending;
}

/** Runs the aggregate FetchXML and returns the response's entities. */
export async function runCountQuery(webAPI: ComponentFramework.WebApi, table: string, fetchXml: string): Promise<unknown> {
  const result = await webAPI.retrieveMultipleRecords(table, `?fetchXml=${encodeURIComponent(fetchXml)}`);
  return result.entities;
}
