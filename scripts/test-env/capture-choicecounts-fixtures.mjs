// Captures real aggregate responses for ChoiceCounts' tests (decisions.md C-3): the control's query grouped by a
// Status Reason, Status and Yes/No column. (The Choice response, aggregate-choice.json, was captured earlier.)
// Adds a Yes/No column wbsuper_urgent "Urgent" to the SMSF Task test table first, and marks some tasks urgent.
// Run create-smsf-tasks.mjs first. Writes controls/ChoiceCounts/tests/fixtures/*.json.
// Usage: node scripts/test-env/capture-choicecounts-fixtures.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { API, call, get, label, publish } from "./lib.mjs";

const SOLUTION = "WBSuperTest";
const TASK = "wbsuper_smsftask";
const MATTER_ID = "05e03215-8fd5-f111-84e8-7ced8d6ed1fc"; // 00224570-27
const FIXTURES = fileURLToPath(new URL("../../controls/ChoiceCounts/tests/fixtures/", import.meta.url));
const none = { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" };

async function ensureUrgentColumn() {
  if (await get(`EntityDefinitions(LogicalName='${TASK}')/Attributes(LogicalName='wbsuper_urgent')?$select=LogicalName`)) return;
  await call("POST", `EntityDefinitions(LogicalName='${TASK}')/Attributes`, {
    "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata", SchemaName: "wbsuper_Urgent", DisplayName: label("Urgent"), RequiredLevel: none, DefaultValue: false,
    OptionSet: { "@odata.type": "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata", TrueOption: { Value: 1, Label: label("Yes"), Color: "#D13438" }, FalseOption: { Value: 0, Label: label("No") } },
  }, { solution: SOLUTION });
  await publish({ entities: [TASK] });
  console.log("created column wbsuper_urgent (Yes/No)");
  // Two of the matter's tasks are urgent; the rest are No.
  const tasks = (await get(`${TASK}s?$select=wbsuper_name&$filter=_wbsuper_smsfmatter_value eq ${MATTER_ID}&$orderby=wbsuper_name`)).value;
  for (const [i, task] of tasks.entries()) await call("PATCH", `${TASK}s(${task.wbsuper_smsftaskid})`, { wbsuper_urgent: i < 2 });
}

/** The query the control builds (logic/fetchXml.ts), for `column`, filtered to the test matter. */
const countQuery = (column, extra = "") =>
  `<fetch aggregate="true"${extra}><entity name="${TASK}"><attribute name="wbsuper_smsftaskid" alias="choicecounts_count" aggregate="countcolumn" distinct="true" /><attribute name="${column}" alias="choicecounts_group" groupby="true" /><filter type="and"><condition attribute="wbsuper_smsfmatter" operator="eq" value="${MATTER_ID}" /></filter><order alias="choicecounts_group" /></entity></fetch>`;

async function capture(file, column, extra = "") {
  const fetchXml = countQuery(column, extra);
  const headers = { Authorization: `Bearer ${process.env.DATAVERSE_TOKEN}`, Accept: "application/json", Prefer: 'odata.include-annotations="*"' };
  const res = await fetch(`${API}/${TASK}s?fetchXml=${encodeURIComponent(fetchXml)}`, { headers });
  const json = await res.json();
  const body = res.ok ? { value: json.value } : { status: res.status, error: json.error };
  writeFileSync(`${FIXTURES}${file}`, JSON.stringify({ _source: `LowCode Web API, ${new Date().toISOString().slice(0, 10)}, matter 00224570-27 (decisions.md C-3)`, fetchXml, ...body }, null, 2) + "\n");
  console.log(`${file}: ${res.status} ${JSON.stringify(res.ok ? json.value.map((r) => [r.choicecounts_group, r.choicecounts_count]) : json.error)}`);
}

await ensureUrgentColumn();
await capture("aggregate-status-reason.json", "statuscode");
await capture("aggregate-status.json", "statecode");
await capture("aggregate-yes-no.json", "wbsuper_urgent");
// The 50,000-row error can't be provoked cheaply: aggregatelimit="1" doesn't raise it. With a distinct grouped
// count it fails with a generic SQL error (0x80044150); otherwise it quietly counts a subset (decisions.md C-3).
