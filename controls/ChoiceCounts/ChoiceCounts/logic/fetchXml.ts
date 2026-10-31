/**
 * Builds the one aggregate query (brief §5.1): rows of `tableName` counted by
 * distinct primary ID, grouped by the choice column. Counting distinct IDs means a
 * one-to-many `<link-entity>` in the maker's filter can't count a row twice.
 */
import { serializeXml, type XmlElement } from "./filterXml";

/** Aliases in the response. Long enough not to clash with an alias a maker gives a link-entity. */
export const COUNT_ALIAS = "choicecounts_count";
export const GROUP_ALIAS = "choicecounts_group";

export interface CountQuery {
  readonly tableName: string;
  /** The table's primary ID column, from metadata (VERIFY C-4). */
  readonly primaryIdColumn: string;
  readonly groupColumn: string;
  readonly filter: readonly XmlElement[];
  /** Restricts the count to rows whose lookup points at the form's record. */
  readonly relationship: { readonly column: string; readonly recordId: string } | null;
}

const element = (name: string, attributes: Record<string, string>, children: XmlElement[] = []): XmlElement => ({
  name,
  attributes: Object.entries(attributes),
  children,
  text: null,
});

/**
 * The FetchXML for `query`. Top-level `<link-entity>` elements of the filter go under
 * `<entity>`; its conditions and filters, and the relationship condition, go in one
 * `and` filter. Every name and value is escaped when serialised.
 */
export function buildFetchXml(query: CountQuery): string {
  const links = query.filter.filter((node) => node.name === "link-entity");
  const conditions = query.filter.filter((node) => node.name !== "link-entity");
  if (query.relationship) {
    conditions.push(element("condition", { attribute: query.relationship.column, operator: "eq", value: query.relationship.recordId }));
  }
  const entity = element("entity", { name: query.tableName }, [
    element("attribute", { name: query.primaryIdColumn, alias: COUNT_ALIAS, aggregate: "countcolumn", distinct: "true" }),
    element("attribute", { name: query.groupColumn, alias: GROUP_ALIAS, groupby: "true" }),
    ...links,
    ...(conditions.length > 0 ? [element("filter", { type: "and" }, conditions)] : []),
    element("order", { alias: GROUP_ALIAS }),
  ]);
  return serializeXml([element("fetch", { aggregate: "true" }, [entity])]);
}
