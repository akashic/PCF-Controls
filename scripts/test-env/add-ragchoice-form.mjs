// Sets up wb_gridspike for testing RagChoice on a form (issue #7): a "RAG hidden test" choice column
// with one hidden option, and a separate main form "RagChoice test" that puts RagChoice on the RAG
// columns next to the platform's own dropdown. The table's "Information" form is left alone.
// Idempotent: anything already in place is left alone.
// Usage: node scripts/test-env/add-ragchoice-form.mjs [--solution WBGridSpikeTest]
// Import WBRagChoice first. Open a row with &formid=<the printed form id> in the URL.
//
// A field control is a <controlDescription forControl="{uniqueid}"> in the form XML, pointing at the
// field <control>'s uniqueid: the platform control first, then one <customControl> per form factor
// (0 web, 1 tablet, 2 phone) whose `value` parameter binds the column.
// See docs/testing/gridformatter-test-environment.md.
import { randomUUID } from "node:crypto";
import { arg, call, get, label, publish } from "./lib.mjs";

const SOLUTION = arg("solution", "WBGridSpikeTest");
const TABLE = "wb_gridspike";
const FORM_NAME = "RagChoice test";
const CONTROL = "wb_Controls.RagChoice";
const TEXT = "{4273EDBD-AC1D-40d3-9FB2-095C621B552D}";
const PICKLIST = "{3EF39988-22BB-4f0b-BBBE-64B5A3748AEE}";
const HIDDEN_COLUMN = "wb_raghiddentest";
// Retired is the hidden option: coloured, so a RagChoice that lists it would show a purple dot.
const HIDDEN_OPTIONS = [
  [948790000, "Red", "#D13438"],
  [948790001, "Amber", "#FFB900"],
  [948790002, "Green", "#107C10"],
  [948790003, "Retired (hidden)", "#8764B8"],
];
const HIDDEN_VALUE = 948790003;

const attrPath = `EntityDefinitions(LogicalName='${TABLE}')/Attributes`;

// 1. The choice column with a hidden option.
if (await get(`${attrPath}(LogicalName='${HIDDEN_COLUMN}')?$select=LogicalName`)) {
  console.log(`column ${HIDDEN_COLUMN} exists`);
} else {
  await call(
    "POST",
    attrPath,
    {
      "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
      SchemaName: "wb_RagHiddenTest",
      DisplayName: label("RAG hidden test"),
      RequiredLevel: { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" },
      OptionSet: {
        "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
        IsGlobal: false,
        OptionSetType: "Picklist",
        Options: HIDDEN_OPTIONS.map(([Value, text, Color]) => ({ Value, Label: label(text), Color })),
      },
    },
    { solution: SOLUTION },
  );
  console.log(`created column ${HIDDEN_COLUMN}`);
}

// The option's Hidden flag: readable as OptionMetadata.IsHidden, settable through UpdateOptionValue.
const metadata = await get(
  `${attrPath}(LogicalName='${HIDDEN_COLUMN}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)`,
);
if (metadata?.OptionSet?.Options?.find((o) => o.Value === HIDDEN_VALUE)?.IsHidden) {
  console.log(`option ${HIDDEN_VALUE} is already hidden`);
} else {
  await call("POST", "UpdateOptionValue", {
    EntityLogicalName: TABLE,
    AttributeLogicalName: HIDDEN_COLUMN,
    Value: HIDDEN_VALUE,
    IsHidden: true,
    MergeLabels: true,
    SolutionUniqueName: SOLUTION,
  });
  console.log(`hid option ${HIDDEN_VALUE}`);
}
await publish({ entities: [TABLE] });

// 2. The form.
const guid = () => `{${randomUUID().toUpperCase()}}`;
const cell = (text, control) =>
  `<row><cell id="${guid()}"><labels><label description="${text}" languagecode="1033" /></labels>${control}</cell></row>`;
const field = (id, column, uniqueid) =>
  `<control id="${id}" classid="${column === "wb_name" ? TEXT : PICKLIST}" datafieldname="${column}"${uniqueid ? ` uniqueid="${uniqueid}"` : ""} />`;
const description = (uniqueid, column, indicator) =>
  `<controlDescription forControl="${uniqueid}"><customControl id="${PICKLIST}"><parameters><datafieldname>${column}</datafieldname></parameters></customControl>` +
  [0, 1, 2]
    .map(
      (formFactor) =>
        `<customControl formFactor="${formFactor}" name="${CONTROL}"><parameters><value type="OptionSet">${column}</value><indicator type="Enum" static="true">${indicator}</indicator></parameters></customControl>`,
    )
    .join("") +
  "</controlDescription>";

const ids = { rag: guid(), bar: guid(), hidden: guid() };
const formxml =
  `<form><tabs><tab verticallayout="true" id="${guid()}" IsUserDefined="1"><labels><label description="RagChoice" languagecode="1033" /></labels>` +
  `<columns><column width="100%"><sections><section showlabel="true" showbar="false" IsUserDefined="1" id="${guid()}"><labels><label description="RagChoice (issue #7)" languagecode="1033" /></labels><rows>` +
  cell("Name", field("wb_name", "wb_name")) +
  cell("RAG status", field("wb_ragstatus", "wb_ragstatus", ids.rag)) +
  cell("RAG status (left bar)", field("wb_ragstatus_bar", "wb_ragstatus", ids.bar)) +
  cell("RAG status (platform control)", field("wb_ragstatus_platform", "wb_ragstatus")) +
  cell("RAG hidden test", field("wb_raghiddentest", HIDDEN_COLUMN, ids.hidden)) +
  cell("RAG hidden test (platform control)", field("wb_raghiddentest_platform", HIDDEN_COLUMN)) +
  `</rows></section></sections></column></columns></tab></tabs><controlDescriptions>` +
  description(ids.rag, "wb_ragstatus", "dot") +
  description(ids.bar, "wb_ragstatus", "bar") +
  description(ids.hidden, HIDDEN_COLUMN, "dot") +
  `</controlDescriptions></form>`;

const existing = await get(`systemforms?$select=formid&$filter=objecttypecode eq '${TABLE}' and type eq 2 and name eq '${FORM_NAME}'`);
let formId = existing?.value?.[0]?.formid;
if (formId) {
  await call("PATCH", `systemforms(${formId})`, { formxml }, { extraHeaders: { "If-Match": "*" } });
  console.log(`updated form "${FORM_NAME}"`);
} else {
  ({ id: formId } = await call("POST", "systemforms", { name: FORM_NAME, objecttypecode: TABLE, type: 2, formxml }, { solution: SOLUTION }));
  console.log(`created form "${FORM_NAME}"`);
}
await publish({ entities: [TABLE] });
console.log(`form id ${formId}: open a row with &formid=${formId}`);
