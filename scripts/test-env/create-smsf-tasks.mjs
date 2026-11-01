// Builds the ChoiceCounts test setup on top of the SMSF tables (create-smsf-tables.mjs runs first):
//   - a global choice wbsuper_ragstatus "RAG Status": Red, Amber, Green, with colours, as William Buck's RAG choice
//   - table wbsuper_smsftask "SMSF Task": lookup wbsuper_smsfmatter to SMSF Matter, and RAG Status on the global choice
//   - views "Red tasks" and "Amber tasks" (active tasks of that colour), for the drill-through
//   - wbsuper_taskrag "Task RAG", a text column on SMSF Matter that hosts the control (it's never written)
//   - on SMSF Matter's "Information" form: the host column on the first tab, and a "Tasks" tab with a subgrid of the
//     matter's tasks whose view picker offers the colour views (setCurrentView needs the view picker)
//   - sample tasks on three matters
// Idempotent. Usage: node scripts/test-env/create-smsf-tasks.mjs
// See docs/testing/choicecounts-test-environment.md.
import { randomUUID } from "node:crypto";
import { call, get, label, publish } from "./lib.mjs";

const SOLUTION = "WBSuperTest";
const TASK = "wbsuper_smsftask";
const TASK_SET = "wbsuper_smsftasks";
const MATTER = "wbsuper_smsfmatter";
const RELATIONSHIP = "wbsuper_SMSFMatter_SMSFTask";
const SUBGRID_ID = "tasks_subgrid";
const SUBGRID_CLASS = "{E7A81278-8635-4d9e-8D4D-59480B391C5B}";
const TEXT_CLASS = "{4273EDBD-AC1D-40d3-9FB2-095C621B552D}";
// The WBSuperTest publisher's option value prefix is 51234 (create-smsf-tables.mjs).
const RAG = { red: 512340000, amber: 512340001, green: 512340002 };

const none = { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" };
const guid = () => `{${randomUUID().toUpperCase()}}`;

async function ensureGlobalChoice() {
  if (await get("GlobalOptionSetDefinitions(Name='wbsuper_ragstatus')?$select=Name")) return console.log("global choice wbsuper_ragstatus exists");
  const option = (value, text, color) => ({ Value: value, Label: label(text), Color: color });
  await call("POST", "GlobalOptionSetDefinitions", {
    "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata", Name: "wbsuper_ragstatus", DisplayName: label("RAG Status"),
    IsGlobal: true, OptionSetType: "Picklist",
    Options: [option(RAG.red, "Red", "#D13438"), option(RAG.amber, "Amber", "#FFB900"), option(RAG.green, "Green", "#107C10")],
  }, { solution: SOLUTION });
  console.log("created global choice wbsuper_ragstatus (Red, Amber, Green)");
}

async function ensureTaskTable() {
  if (!(await get(`EntityDefinitions(LogicalName='${TASK}')?$select=LogicalName`))) {
    await call("POST", "EntityDefinitions", {
      "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata", SchemaName: "wbsuper_SMSFTask",
      DisplayName: label("SMSF Task"), DisplayCollectionName: label("SMSF Tasks"),
      Description: label("Test table for ChoiceCounts: tasks on an SMSF Matter with a RAG status. Safe to delete."),
      OwnershipType: "UserOwned", HasActivities: false, HasNotes: false, IsActivity: false,
      Attributes: [{
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", SchemaName: "wbsuper_Name", IsPrimaryName: true,
        DisplayName: label("Name"), RequiredLevel: none, MaxLength: 200, FormatName: { Value: "Text" },
      }],
    }, { solution: SOLUTION });
    console.log(`created table ${TASK}`);
  } else console.log(`table ${TASK} exists`);

  const columns = await get(`EntityDefinitions(LogicalName='${TASK}')/Attributes?$select=LogicalName`);
  if (!columns) throw new Error(`couldn't read ${TASK}'s columns; wait a minute and re-run`);
  const names = new Set(columns.value.map((a) => a.LogicalName));
  if (!names.has("wbsuper_ragstatus")) {
    // The global choice has to be bound by its MetadataId; binding by Name fails ("Guid should contain 32 digits").
    const choice = await get("GlobalOptionSetDefinitions(Name='wbsuper_ragstatus')?$select=MetadataId");
    await call("POST", `EntityDefinitions(LogicalName='${TASK}')/Attributes`, {
      "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata", SchemaName: "wbsuper_RAGStatus",
      DisplayName: label("RAG Status"), RequiredLevel: none,
      "GlobalOptionSet@odata.bind": `/GlobalOptionSetDefinitions(${choice.MetadataId})`,
    }, { solution: SOLUTION });
    console.log("created column wbsuper_ragstatus (global choice)");
  }
  if (!names.has("wbsuper_smsfmatter")) {
    await call("POST", "RelationshipDefinitions", {
      "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
      SchemaName: RELATIONSHIP, ReferencedEntity: MATTER, ReferencingEntity: TASK,
      Lookup: { "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata", SchemaName: "wbsuper_SMSFMatter", DisplayName: label("SMSF Matter"), RequiredLevel: none },
    }, { solution: SOLUTION });
    console.log(`created lookup wbsuper_smsfmatter (${RELATIONSHIP})`);
  }

  const matterColumns = await get(`EntityDefinitions(LogicalName='${MATTER}')/Attributes?$select=LogicalName`);
  if (!matterColumns.value.some((a) => a.LogicalName === "wbsuper_taskrag")) {
    await call("POST", `EntityDefinitions(LogicalName='${MATTER}')/Attributes`, {
      "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", SchemaName: "wbsuper_TaskRAG",
      DisplayName: label("Task RAG"), Description: label("Hosts the ChoiceCounts control. Never written."),
      RequiredLevel: none, MaxLength: 100, FormatName: { Value: "Text" },
    }, { solution: SOLUTION });
    console.log("created host column wbsuper_smsfmatter.wbsuper_taskrag");
  }
}

const VIEW_COLUMNS = ["wbsuper_name", "wbsuper_ragstatus", "wbsuper_smsfmatter", "createdon"];
function viewXml(ragValue) {
  const conditions = `<condition attribute="statecode" operator="eq" value="0"/>${ragValue === undefined ? "" : `<condition attribute="wbsuper_ragstatus" operator="eq" value="${ragValue}"/>`}`;
  return {
    fetchxml: `<fetch version="1.0" mapping="logical"><entity name="${TASK}">${VIEW_COLUMNS.map((c) => `<attribute name="${c}"/>`).join("")}<attribute name="wbsuper_smsftaskid"/><filter type="and">${conditions}</filter><order attribute="wbsuper_name" descending="false"/></entity></fetch>`,
    layoutxml: `<grid name="resultset" object="1" jump="wbsuper_name" select="1" icon="1" preview="1"><row name="result" id="wbsuper_smsftaskid">${VIEW_COLUMNS.map((c) => `<cell name="${c}" width="${c === "wbsuper_name" ? 250 : 150}"/>`).join("")}</row></grid>`,
  };
}

async function ensureView(name, ragValue) {
  const existing = await get(`savedqueries?$select=savedqueryid&$filter=name eq '${name}' and returnedtypecode eq '${TASK}'`);
  if (existing?.value?.length) return existing.value[0].savedqueryid;
  const { id } = await call("POST", "savedqueries", { name, returnedtypecode: TASK, querytype: 0, ...viewXml(ragValue) }, { solution: SOLUTION });
  console.log(`created view "${name}"`);
  return id;
}

async function ensureForm(viewIds) {
  const form = (await get(`systemforms?$select=formid,name,formxml&$filter=objecttypecode eq '${MATTER}' and type eq 2 and name eq 'Information'`))?.value?.[0];
  if (!form) throw new Error("SMSF Matter has no main form called Information");
  let formxml = form.formxml;

  // The host column, under FY on the first tab, so the control can be put on it.
  if (!formxml.includes('id="wbsuper_taskrag"')) {
    const fyRow = formxml.indexOf('<control id="wbsuper_fy"');
    if (fyRow === -1) throw new Error("the form has no FY control: run create-smsf-tables.mjs first");
    const at = formxml.indexOf("</row>", fyRow) + "</row>".length;
    const row = `<row><cell id="${guid()}"><labels><label description="Task RAG" languagecode="1033" /></labels><control id="wbsuper_taskrag" classid="${TEXT_CLASS}" datafieldname="wbsuper_taskrag" disabled="false" /></cell></row>`;
    formxml = formxml.slice(0, at) + row + formxml.slice(at);
    console.log("added Task RAG to the form");
  }

  // A Tasks tab with a subgrid of the matter's tasks. Its view picker lists the default and colour views.
  if (!formxml.includes(`id="${SUBGRID_ID}"`)) {
    const ids = [viewIds.all, viewIds.red, viewIds.amber].map((v) => `{${v}}`).join(",");
    const subgrid = `<control id="${SUBGRID_ID}" classid="${SUBGRID_CLASS}" indicationOfSubgrid="true"><parameters><TargetEntityType>${TASK}</TargetEntityType><RelationshipName>${RELATIONSHIP}</RelationshipName><ViewId>{${viewIds.all}}</ViewId><IsUserView>false</IsUserView><AutoExpand>Fixed</AutoExpand><RecordsPerPage>10</RecordsPerPage><EnableQuickFind>false</EnableQuickFind><EnableViewPicker>true</EnableViewPicker><ViewIds>${ids}</ViewIds><EnableJumpBar>false</EnableJumpBar><ChartGridMode>Grid</ChartGridMode><VisualizationId /><IsUserChart>false</IsUserChart><EnableChartPicker>false</EnableChartPicker></parameters></control>`;
    const tab = `<tab name="tab_tasks" id="${guid()}" IsUserDefined="1" verticallayout="true" expanded="true" showlabel="true"><labels><label description="Tasks" languagecode="1033" /></labels><columns><column width="100%"><sections><section name="section_tasks" showlabel="false" showbar="false" IsUserDefined="1" id="${guid()}" columns="1"><labels><label description="Tasks" languagecode="1033" /></labels><rows><row><cell id="${guid()}" rowspan="10" colspan="1" showlabel="false"><labels><label description="Tasks" languagecode="1033" /></labels>${subgrid}</cell></row></rows></section></sections></column></columns></tab>`;
    formxml = formxml.replace("</tabs>", `${tab}</tabs>`);
    if (!formxml.includes(`id="${SUBGRID_ID}"`)) throw new Error("couldn't find </tabs> in the form XML");
    console.log("added the Tasks tab and its subgrid");
  }

  if (formxml === form.formxml) return console.log("form has Task RAG and the Tasks tab");
  await call("PATCH", `systemforms(${form.formid})`, { formxml }, { solution: SOLUTION, extraHeaders: { "If-Match": "*" } });
}

// Sample tasks: [matter name, task name, RAG or null, active]. 00224570-27 has a spread; 00100170-25 has no Amber.
const TASKS = [
  ["00224570-27", "Lodge annual return", RAG.red, true],
  ["00224570-27", "Chase bank statements", RAG.red, true],
  ["00224570-27", "Reconcile contributions", RAG.amber, true],
  ["00224570-27", "Review investment strategy", RAG.amber, true],
  ["00224570-27", "Confirm member details", RAG.amber, true],
  ["00224570-27", "Prepare financial statements", RAG.green, true],
  ["00224570-27", "Issue engagement letter", RAG.green, true],
  ["00224570-27", "Book audit", RAG.green, true],
  ["00224570-27", "Old overdue item (inactive)", RAG.red, false],
  ["00224570-27", "Task with no RAG", null, true],
  ["00100170-25", "Lodge annual return", RAG.red, true],
  ["00100170-25", "Prepare financial statements", RAG.green, true],
  ["00100170-25", "Book audit", RAG.green, true],
];

async function ensureTasks() {
  const matters = Object.fromEntries((await get(`${MATTER}s?$select=wbsuper_wbcodefy`)).value.map((m) => [m.wbsuper_wbcodefy, m.wbsuper_smsfmatterid]));
  for (const [matter, name, rag, active] of TASKS) {
    const matterId = matters[matter];
    if (!matterId) throw new Error(`SMSF Matter ${matter} not found`);
    const exists = await get(`${TASK_SET}?$select=wbsuper_smsftaskid&$filter=wbsuper_name eq '${name.replace(/'/g, "''")}' and _wbsuper_smsfmatter_value eq ${matterId}`);
    if (exists?.value?.length) continue;
    const { id } = await call("POST", TASK_SET, { wbsuper_name: name, wbsuper_ragstatus: rag, "wbsuper_SMSFMatter@odata.bind": `/${MATTER}s(${matterId})` });
    if (!active) await call("PATCH", `${TASK_SET}(${id})`, { statecode: 1, statuscode: 2 });
    console.log(`created task "${name}" on ${matter}`);
  }
}

await ensureGlobalChoice();
await ensureTaskTable();
await publish({ entities: [TASK, MATTER] });
const viewIds = {
  all: await ensureView("Active SMSF Tasks (all colours)", undefined),
  red: await ensureView("Red tasks", RAG.red),
  amber: await ensureView("Amber tasks", RAG.amber),
};
console.log(`views: ${JSON.stringify(viewIds)}`);
await ensureForm(viewIds);
await publish({ entities: [TASK, MATTER] });
await ensureTasks();
console.log("done");
