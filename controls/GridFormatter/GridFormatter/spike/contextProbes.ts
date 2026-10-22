// Temporary instrumentation for issue #9: probes that run once from init().
import { describe, elapsed, errorText, record } from "./probe";

type Ctx = ComponentFramework.Context<unknown>;

/** Records the result (or failure) of an async probe under one key. */
async function track(key: string, work: () => Promise<unknown>): Promise<void> {
  try {
    const result = await work();
    record(key, { atMs: elapsed(), result });
  } catch (e) {
    record(`${key} FAILED`, { atMs: elapsed(), error: errorText(e) });
  }
}

/** V4: what the customizer can learn about its table and view. */
export function probeHost(context: Ctx): string | null {
  const loose = context as unknown as Record<string, unknown>;
  const page = loose.page as Record<string, unknown> | undefined;
  const contextInfo = (context.mode as unknown as Record<string, unknown>).contextInfo;
  const url = new URL(window.location.href);

  record("V4 context keys", Object.keys(loose));
  record("V4 context.page", page);
  record("V4 context.mode", context.mode);
  record("V4 context.mode.contextInfo", contextInfo);
  record("V4 context.parameters", context.parameters);
  record("V4 page URL params", Object.fromEntries(url.searchParams.entries()));
  record("V4 form factor and user", {
    formFactor: context.client.getFormFactor(),
    client: context.client.getClient(),
    userLanguageId: context.userSettings.languageId,
    timeZoneOffsetMinutes: context.userSettings.getTimeZoneOffsetMinutes(),
  });

  const fromPage = typeof page?.entityTypeName === "string" ? page.entityTypeName : null;
  const fromContextInfo =
    contextInfo && typeof (contextInfo as Record<string, unknown>).entityTypeName === "string"
      ? ((contextInfo as Record<string, unknown>).entityTypeName as string)
      : null;
  const fromUrl = url.searchParams.get("etn");
  const table = fromPage ?? fromContextInfo ?? fromUrl;
  record("V4 table name candidates", { fromPage, fromContextInfo, fromUrl, viewIdFromUrl: url.searchParams.get("viewid") });
  return table;
}

/** V3 and V8: Web API and metadata access from a grid customizer, and the environment variable size limit. */
export function probeServices(context: Ctx): void {
  record("V3 service availability", {
    webAPI: typeof context.webAPI?.retrieveMultipleRecords,
    getEntityMetadata: typeof context.utils?.getEntityMetadata,
  });

  // §5.2.6: reading an environment variable with its current value.
  const query =
    "?$select=schemaname,defaultvalue,type&$top=3" +
    "&$expand=environmentvariabledefinition_environmentvariablevalue($select=value)";
  void track("V3 webAPI environmentvariabledefinition (with expand)", () =>
    context.webAPI.retrieveMultipleRecords("environmentvariabledefinition", query)
  );

  // V8: maximum length of an environment variable's value.
  for (const [table, column] of [
    ["environmentvariablevalue", "value"],
    ["environmentvariabledefinition", "defaultvalue"],
  ] as const) {
    void track(`V8 ${table}.${column} metadata`, async () =>
      attributeOf(await context.utils.getEntityMetadata(table, [column]), column)
    );
  }

  // Theme (§3.4): does the platform hand the control Fluent 9 tokens?
  const loose = context as unknown as Record<string, unknown>;
  const designLanguage = loose.fluentDesignLanguage as Record<string, unknown> | undefined;
  record("Theme context.fluentDesignLanguage", designLanguage);
  const rootStyle = getComputedStyle(document.documentElement);
  record("Theme CSS variables on :root", {
    colorNeutralBackground3: rootStyle.getPropertyValue("--colorNeutralBackground3"),
    colorNeutralForeground3: rootStyle.getPropertyValue("--colorNeutralForeground3"),
    colorBrandBackground: rootStyle.getPropertyValue("--colorBrandBackground"),
  });
}

/** V3: option colours for the choice columns visible in the grid, once the table is known. */
const requested = new Set<string>();
export function probeOptionColours(context: Ctx, table: string | null, choiceColumns: string[]): void {
  const key = `${table}:${choiceColumns.join(",")}`;
  if (!table || choiceColumns.length === 0 || requested.has(key)) return;
  requested.add(key);
  void track(`V3 getEntityMetadata(${table}) choice columns`, async () => {
    const metadata: unknown = await context.utils.getEntityMetadata(table, choiceColumns);
    const columns: Record<string, unknown> = {};
    for (const column of choiceColumns) columns[column] = attributeOf(metadata, column);
    return { columns, metadataKeys: Object.keys(metadata as object) };
  });
}

/** Finds an attribute in EntityMetadata, whichever shape the platform returns. */
function attributeOf(metadata: unknown, column: string): unknown {
  const attributes = (metadata as Record<string, unknown> | null)?.Attributes as
    | { get?: (name: string) => unknown; getByName?: (name: string) => unknown; _collection?: Record<string, unknown> }
    | undefined;
  if (!attributes) return { note: "no Attributes", metadata: describe(metadata, 2) };
  try {
    const found = attributes.get?.(column) ?? attributes.getByName?.(column) ?? attributes._collection?.[column];
    return found ? describe(found, 6) : { note: "attribute not found", attributesKeys: Object.keys(attributes) };
  } catch (e) {
    return { error: errorText(e), attributesKeys: Object.keys(attributes) };
  }
}
