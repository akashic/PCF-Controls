// Brings an existing wb_gridspike table up to date with the date-behaviour columns added for #39:
// wb_startdate (date-only, User Local behaviour) and wb_meetingat (date-and-time, Time Zone Independent).
// Creates the columns if missing, adds them to the "Grid spike - all columns" view, and fills them on
// rows 01-30 with rowValues()'s pattern. New tables get all of this from create-gridspike.mjs.
// Usage: node scripts/test-env/add-date-behaviour-columns.mjs [--tz Australia/Sydney]
// See docs/testing/gridformatter-test-environment.md.
import { call, get, publish } from "./lib.mjs";
import { ALL, ensureColumns, rowValues, viewXml } from "./create-gridspike.mjs";

const TABLE = "wb_gridspike";
const SET = "wb_gridspikes";
const VIEW = "Grid spike - all columns";
const NEW = ["wb_startdate", "wb_meetingat"];

await ensureColumns();
await publish({ entities: [TABLE] });

const view = (await get(`savedqueries?$select=savedqueryid,fetchxml,layoutxml&$filter=name eq '${VIEW}' and returnedtypecode eq '${TABLE}'`))?.value?.[0];
if (!view) throw new Error(`view "${VIEW}" not found: run create-gridspike.mjs first`);
// Dataverse rewrites a saved view's XML (spacing, attribute order), so rebuild it from ALL rather than
// editing the stored text. The script created this view from ALL, so nothing else is lost.
const columnsIn = (xml, element) => [...xml.matchAll(new RegExp(`<${element} name="(\\w+)"`, "g"))].map((m) => m[1]);
const wanted = viewXml(ALL);
if (columnsIn(view.fetchxml, "attribute").join() !== columnsIn(wanted.fetchxml, "attribute").join() || columnsIn(view.layoutxml, "cell").join() !== ALL.join()) {
  await call("PATCH", `savedqueries(${view.savedqueryid})`, wanted, { extraHeaders: { "If-Match": "*" } });
  await publish({ entities: [TABLE] });
  console.log(`rebuilt "${VIEW}" with ${NEW.join(", ")}`);
} else {
  console.log(`"${VIEW}" already has ${NEW.join(", ")}`);
}

// Rows 01-30 have two-digit names; the volume rows (031-260) are left empty.
const rows = ((await get(`${SET}?$select=wb_name&$filter=startswith(wb_name,'Spike row ')`))?.value ?? []).filter((row) => /^Spike row \d\d$/.test(row.wb_name));
for (const row of rows) {
  const i = Number(row.wb_name.slice(-2));
  const values = rowValues(i);
  await call("PATCH", `${SET}(${row.wb_gridspikeid})`, { wb_startdate: values.wb_startdate, wb_meetingat: values.wb_meetingat }, { extraHeaders: { "If-Match": "*" } });
}
console.log(`set ${NEW.join(", ")} on ${rows.length} rows`);
