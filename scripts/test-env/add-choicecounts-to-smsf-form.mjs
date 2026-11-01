// Puts ChoiceCounts on SMSF Matter's "Information" form in the test environment, with drill-through:
//   - uploads controls/ChoiceCounts/examples/drill-through.js as web resource wbsuper_ChoiceCounts.wbsuper_smsfmatter.js
//     (named like GridFormatter's rules, <prefix>_ChoiceCounts.<table>.js, with no "/"; ADR-0005)
//   - registers its onLoad on the form
//   - puts wb_Controls.ChoiceCounts (web, tablet, phone) on each field in INSTANCES: Task RAG counts the matter's
//     active tasks by RAG Status (Red and Amber); Stage counts them by Status Reason. Both raise OnOptionSelect,
//     and the uploaded script gets a CONFIG entry for Stage on top of the example's Task RAG entry
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
const LIBRARY = `wbsuper_ChoiceCounts.${MATTER}.js`;
const HANDLER = "WBChoiceCounts.DrillThrough.onLoad";
const CONTROL = "wb_Controls.ChoiceCounts";
const TEXT_CLASS = "{4273EDBD-AC1D-40d3-9FB2-095C621B552D}";
const guid = () => `{${randomUUID().toUpperCase()}}`;
const xmlEscape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Status Reason values of a custom table (create-smsf-tasks.mjs makes a "Status: <label>" view for each).
const STATUS = { active: 1, inactive: 2 };

// The control's instances. Task RAG: Red and Amber active tasks, zero counts in grey, drill-through on.
// Stage: a second instance (several instances on one form) grouping the same tasks by Status Reason, every option,
// coloured or not, with its own drill-through. It checks Status Reason grouping, that instances don't interfere,
// and that one script handles drill-through for several instances.
const INSTANCES = [
  {
    host: "wbsuper_taskrag",
    label: "Task RAG",
    parameters: {
      tableName: "wbsuper_smsftask",
      groupColumn: "wbsuper_ragstatus",
      relationshipColumn: "wbsuper_smsfmatter",
      filterXml: '<condition attribute="statecode" operator="eq" value="0" />',
      optionValues: `${RAG.red},${RAG.amber}`,
      zeroCounts: "0",
      badgeAction: "1",
    },
  },
  {
    host: "wbsuper_stage",
    label: "Task status",
    parameters: {
      tableName: "wbsuper_smsftask",
      groupColumn: "statuscode",
      relationshipColumn: "wbsuper_smsfmatter",
      zeroCounts: "1",
      badgeAction: "1",
    },
  },
];

// The drill-through entries the example script doesn't have: its CONFIG has only Task RAG, as a project would
// start. Appended to the uploaded copy, so the example stays a clean template.
const EXTRA_DRILL_THROUGH = [
  {
    control: "wbsuper_stage",
    tab: "tab_tasks",
    subgrid: "tasks_subgrid",
    table: "wbsuper_smsftask",
    views: { [STATUS.active]: "Status: Active", [STATUS.inactive]: "Status: Inactive" },
  },
];

async function ensureWebResource() {
  const example = readFileSync(fileURLToPath(new URL("../../controls/ChoiceCounts/examples/drill-through.js", import.meta.url)), "utf8");
  const script = `${example}\n// Added by scripts/test-env/add-choicecounts-to-smsf-form.mjs: the test form's other clickable instances.\n${EXTRA_DRILL_THROUGH.map((entry) => `WBChoiceCounts.DrillThrough.config.controls.push(${JSON.stringify(entry)});`).join("\n")}\n`;
  const content = Buffer.from(script, "utf8").toString("base64");
  const existing = (await get(`webresourceset?$select=webresourceid&$filter=name eq '${LIBRARY}'`))?.value?.[0];
  let id = existing?.webresourceid;
  if (id) await call("PATCH", `webresourceset(${id})`, { content });
  else ({ id } = await call("POST", "webresourceset", { name: LIBRARY, displayname: "ChoiceCounts drill-through (SMSF Matter)", webresourcetype: 3, content }, { solution: SOLUTION }));
  console.log(`${existing ? "updated" : "created"} web resource ${LIBRARY}`);
  return id;
}

/** The control description that puts ChoiceCounts on the host field for each form factor. */
function controlDescription(uniqueId, { host, parameters: values }) {
  const statics = Object.entries(values)
    .map(([name, value]) => {
      const type = name === "filterXml" ? "Multiple" : name === "badgeAction" || name === "zeroCounts" ? "Enum" : "SingleLine.Text";
      return `<${name} static="true" type="${type}">${xmlEscape(value)}</${name}>`;
    })
    .join("");
  // host is bound to the field itself; recordId is bound to the primary key column (brief §2, VERIFY C-1).
  const parameters = `<host>${host}</host><recordId type="SingleLine.Text">${MATTER}id</recordId>${statics}`;
  const custom = [0, 1, 2].map((formFactor) => `<customControl formFactor="${formFactor}" name="${CONTROL}"><parameters>${parameters}</parameters></customControl>`).join("");
  return `<controlDescription forControl="${uniqueId}"><customControl id="${TEXT_CLASS}"><parameters><datafieldname>${host}</datafieldname></parameters></customControl>${custom}</controlDescription>`;
}

const webResourceId = await ensureWebResource();
const form = (await get(`systemforms?$select=formid,formxml&$filter=objecttypecode eq '${MATTER}' and type eq 2 and name eq 'Information'`))?.value?.[0];
if (!form) throw new Error("SMSF Matter has no main form called Information");
let formxml = form.formxml;

for (const instance of INSTANCES) {
  // 1. The host field on the form (under Task RAG if it isn't there yet), with a uniqueid for the description.
  if (!formxml.includes(`<control id="${instance.host}"`)) {
    const after = formxml.indexOf('<control id="wbsuper_taskrag"');
    if (after === -1) throw new Error("the form has no Task RAG control: run create-smsf-tasks.mjs first");
    const at = formxml.indexOf("</row>", after) + "</row>".length;
    const row = `<row><cell id="${guid()}"><labels><label description="${instance.label}" languagecode="1033" /></labels><control id="${instance.host}" classid="${TEXT_CLASS}" datafieldname="${instance.host}" disabled="false" /></cell></row>`;
    formxml = formxml.slice(0, at) + row + formxml.slice(at);
  }
  const hostTag = new RegExp(`<control id="${instance.host}"[^>]*/>`);
  const tag = formxml.match(hostTag)[0];
  let uniqueId = tag.match(/uniqueid="([^"]+)"/)?.[1];
  if (!uniqueId) {
    uniqueId = guid();
    formxml = formxml.replace(hostTag, tag.replace(/\s*\/>$/, ` uniqueid="${uniqueId}" />`));
  }

  // 2. The control description, replacing any earlier one for this field.
  const description = controlDescription(uniqueId, instance);
  const existingDescription = new RegExp(`<controlDescription forControl="${uniqueId.replace(/[{}]/g, "\\$&")}">[\\s\\S]*?</controlDescription>`);
  if (existingDescription.test(formxml)) formxml = formxml.replace(existingDescription, description);
  else if (formxml.includes("<controlDescriptions>")) formxml = formxml.replace("</controlDescriptions>", `${description}</controlDescriptions>`);
  else formxml = formxml.replace("</form>", `<controlDescriptions>${description}</controlDescriptions></form>`);
}

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
for (const { host, parameters } of INSTANCES) console.log(`ChoiceCounts on ${host}: ${JSON.stringify(parameters)}`);
console.log("The drill-through script runs on load. Published.");
