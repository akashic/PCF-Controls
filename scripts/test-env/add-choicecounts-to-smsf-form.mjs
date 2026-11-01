// Puts ChoiceCounts on SMSF Matter's "Information" form in the test environment, with drill-through:
//   - uploads controls/ChoiceCounts/examples/drill-through.js as web resource wbsuper_/choicecounts/drillthrough.js
//   - registers its onLoad on the form
//   - replaces the Task RAG field's control with wb_Controls.ChoiceCounts (web, tablet, phone): counting active
//     SMSF Tasks of this matter by RAG Status, Red and Amber only, raising OnOptionSelect
// Run create-smsf-tables.mjs and create-smsf-tasks.mjs first, and import the WBChoiceCounts solution.
// Idempotent: re-running updates the web resource and the control's parameters.
// Usage: node scripts/test-env/add-choicecounts-to-smsf-form.mjs
// See docs/testing/choicecounts-test-environment.md.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { call, get, publish } from "./lib.mjs";

// The RAG Status option values from create-smsf-tasks.mjs (WBSuperTest's option value prefix is 51234).
// Not imported from there: that script does its work when it's loaded.
const RAG = { red: 512340000, amber: 512340001 };

const SOLUTION = "WBSuperTest";
const MATTER = "wbsuper_smsfmatter";
const HOST = "wbsuper_taskrag";
const LIBRARY = "wbsuper_/choicecounts/drillthrough.js";
const HANDLER = "WBChoiceCounts.DrillThrough.onLoad";
const CONTROL = "wb_Controls.ChoiceCounts";
const TEXT_CLASS = "{4273EDBD-AC1D-40d3-9FB2-095C621B552D}";
const guid = () => `{${randomUUID().toUpperCase()}}`;
const xmlEscape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The control's configuration. Inactive tasks are left out; Green isn't shown.
const PARAMETERS = {
  tableName: "wbsuper_smsftask",
  groupColumn: "wbsuper_ragstatus",
  relationshipColumn: "wbsuper_smsfmatter",
  filterXml: '<condition attribute="statecode" operator="eq" value="0" />',
  optionValues: `${RAG.red},${RAG.amber}`,
  // Zero counts in grey, so only Red or Amber tasks that exist are coloured. No colour overrides: the choice's own.
  zeroCounts: "0",
  badgeAction: "1",
};

async function ensureWebResource() {
  const script = readFileSync(fileURLToPath(new URL("../../controls/ChoiceCounts/examples/drill-through.js", import.meta.url)), "utf8");
  const content = Buffer.from(script, "utf8").toString("base64");
  const existing = (await get(`webresourceset?$select=webresourceid&$filter=name eq '${LIBRARY}'`))?.value?.[0];
  let id = existing?.webresourceid;
  if (id) await call("PATCH", `webresourceset(${id})`, { content });
  else ({ id } = await call("POST", "webresourceset", { name: LIBRARY, displayname: "ChoiceCounts drill-through (SMSF Matter)", webresourcetype: 3, content }, { solution: SOLUTION }));
  console.log(`${existing ? "updated" : "created"} web resource ${LIBRARY}`);
  return id;
}

/** The control description that puts ChoiceCounts on the host field for each form factor. */
function controlDescription(uniqueId) {
  const statics = Object.entries(PARAMETERS)
    .map(([name, value]) => {
      const type = name === "filterXml" ? "Multiple" : name === "badgeAction" || name === "zeroCounts" ? "Enum" : "SingleLine.Text";
      return `<${name} static="true" type="${type}">${xmlEscape(value)}</${name}>`;
    })
    .join("");
  // host is bound to the field itself; recordId is bound to the primary key column (brief §2, VERIFY C-1).
  const parameters = `<host>${HOST}</host><recordId type="SingleLine.Text">${MATTER}id</recordId>${statics}`;
  const custom = [0, 1, 2].map((formFactor) => `<customControl formFactor="${formFactor}" name="${CONTROL}"><parameters>${parameters}</parameters></customControl>`).join("");
  return `<controlDescription forControl="${uniqueId}"><customControl id="${TEXT_CLASS}"><parameters><datafieldname>${HOST}</datafieldname></parameters></customControl>${custom}</controlDescription>`;
}

const webResourceId = await ensureWebResource();
const form = (await get(`systemforms?$select=formid,formxml&$filter=objecttypecode eq '${MATTER}' and type eq 2 and name eq 'Information'`))?.value?.[0];
if (!form) throw new Error("SMSF Matter has no main form called Information");
let formxml = form.formxml;

// 1. A uniqueid on the host control, for the control description to point at.
const hostTag = new RegExp(`<control id="${HOST}"[^>]*/>`);
const tag = formxml.match(hostTag)?.[0];
if (!tag) throw new Error(`the form has no ${HOST} control: run create-smsf-tasks.mjs first`);
let uniqueId = tag.match(/uniqueid="([^"]+)"/)?.[1];
if (!uniqueId) {
  uniqueId = guid();
  formxml = formxml.replace(hostTag, tag.replace(/\s*\/>$/, ` uniqueid="${uniqueId}" />`));
}

// 2. The control description, replacing any earlier one for this control.
const description = controlDescription(uniqueId);
const existingDescription = new RegExp(`<controlDescription forControl="${uniqueId.replace(/[{}]/g, "\\$&")}">[\\s\\S]*?</controlDescription>`);
if (existingDescription.test(formxml)) formxml = formxml.replace(existingDescription, description);
else if (formxml.includes("<controlDescriptions>")) formxml = formxml.replace("</controlDescriptions>", `${description}</controlDescriptions>`);
else formxml = formxml.replace("</form>", `<controlDescriptions>${description}</controlDescriptions></form>`);

// 3. The script library and its onLoad handler (formLibraries and events come straight after the tabs).
if (!formxml.includes(`name="${LIBRARY}"`)) {
  const library = `<Library name="${LIBRARY}" libraryUniqueId="${guid()}" />`;
  formxml = formxml.includes("<formLibraries>")
    ? formxml.replace("</formLibraries>", `${library}</formLibraries>`)
    : formxml.replace("</tabs>", `</tabs><formLibraries>${library}</formLibraries>`);
}
if (!formxml.includes(`functionName="${HANDLER}"`)) {
  const handler = `<Handler functionName="${HANDLER}" libraryName="${LIBRARY}" handlerUniqueId="${guid()}" enabled="true" parameters="" passExecutionContext="true" />`;
  formxml = formxml.includes('<event name="onload"')
    ? formxml.replace(/(<event name="onload"[^>]*>\s*<Handlers>)/, `$1${handler}`)
    : formxml.replace("</formLibraries>", `</formLibraries><events><event name="onload" application="false" active="false"><Handlers>${handler}</Handlers></event></events>`);
}

await call("PATCH", `systemforms(${form.formid})`, { formxml }, { solution: SOLUTION, extraHeaders: { "If-Match": "*" } });
await publish({ entities: [MATTER], webresources: [webResourceId] });
console.log(`ChoiceCounts is on Task RAG (${JSON.stringify(PARAMETERS)}); the drill-through script runs on load. Published.`);
