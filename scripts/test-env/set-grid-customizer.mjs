// Points a table's Power Apps grid at a customizer control (and optionally turns inline editing on
// or off), then publishes. This is the scripted equivalent of: Customize the system → table →
// Controls → Power Apps grid control → Customizer control.
// Usage: node scripts/test-env/set-grid-customizer.mjs <table> <customizer> [--editing yes|no]
//   e.g. node scripts/test-env/set-grid-customizer.mjs wb_gridspike wb_Controls.GridFormatter
// How it works: a table's grid settings live in its customcontroldefaultconfig row as
// controldescriptionxml. If the table has no Power Apps grid yet, the XML is copied from a system
// table that has one (mailbox) and the customizer swapped in. The customizer is the
// GridCustomizerControlFullName parameter. See docs/testing/gridformatter-test-environment.md.
import { arg, call, get, publish } from "./lib.mjs";

const [table, customizer] = process.argv.slice(2);
const editing = arg("editing");
if (!table || !customizer || customizer.startsWith("--")) throw new Error("usage: set-grid-customizer.mjs <table> <customizer> [--editing yes|no]");

const ONE_GRID = "Microsoft.PowerApps.PowerAppsOneGrid";
const configOf = async (entity) =>
  (await get(`customcontroldefaultconfigs?$select=customcontroldefaultconfigid,controldescriptionxml&$filter=primaryentitytypecode eq '${entity}'`))?.value?.[0];

const target = await configOf(table);
if (!target) throw new Error(`no customcontroldefaultconfig row for ${table}; open the table once in the maker portal and retry`);

let xml = target.controldescriptionxml;
if (!xml.includes(ONE_GRID)) {
  const template = await configOf("mailbox");
  if (!template?.controldescriptionxml.includes(ONE_GRID)) throw new Error("couldn't find a Power Apps grid configuration to copy");
  xml = template.controldescriptionxml;
  console.log(`copied the Power Apps grid configuration from mailbox`);
}
const before = xml;
xml = xml.replace(/(<GridCustomizerControlFullName[^>]*>)[^<]*(<\/GridCustomizerControlFullName>)/g, `$1${customizer}$2`);
if (editing === "yes" || editing === "no") {
  xml = xml.replace(/(<EnableEditing[^>]*>)(yes|no)(<\/EnableEditing>)/g, `$1${editing}$3`);
}
const formFactors = (xml.match(/GridCustomizerControlFullName/g) ?? []).length / 2;
if (xml === before) console.log("no change needed");
await call("PATCH", `customcontroldefaultconfigs(${target.customcontroldefaultconfigid})`, { controldescriptionxml: xml }, { extraHeaders: { "If-Match": "*" } });
await publish({ entities: [table] });
console.log(`${table}: customizer = ${customizer}${editing ? `, editing = ${editing}` : ""} on ${formFactors} form factor(s); published. Hard-reload (Cmd+Shift+R) the grid to pick it up.`);
