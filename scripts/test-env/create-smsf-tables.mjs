// Creates a test copy of the dev tables WBCodeFYName runs against (plugins/WBCodeFYName/fields.md):
// SMSF Matter, SuperFundClient and Financial Year, with dev's wbsuper_ names, so the plug-in's example
// step configuration works unchanged. Adds a few Financial Years and SuperFundClients, valid and invalid.
// No SMSF Matter rows: creating one is how the plug-in is tested.
// Idempotent: anything that already exists is left alone, so it's safe to re-run.
// Usage: node scripts/test-env/create-smsf-tables.mjs [--solution WBSuperTest] [--option-prefix 51234]
// See docs/testing/wbcodefyname-test-environment.md.
import { arg, call, get, label, publish } from "./lib.mjs";

const SOLUTION = arg("solution", "WBSuperTest");
const PUBLISHER = "WBSuperTest";
const PREFIX = "wbsuper";
// Dev's option value prefix isn't recorded, and none of these tables has a choice column, so any free value will do.
const OPTION_PREFIX = Number(arg("option-prefix", "51234"));

const none = { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" };
const required = { ...none, Value: "ApplicationRequired" };
const req = (isRequired) => (isRequired ? required : none);

const text = (schema, display, isRequired = false, format = "Text") => ({
  "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
  SchemaName: schema, DisplayName: label(display), RequiredLevel: req(isRequired), MaxLength: 100, FormatName: { Value: format },
});
const email = (schema, display) => text(schema, display, false, "Email");
const phone = (schema, display) => text(schema, display, false, "Phone");
const memo = (schema, display) => ({
  "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
  SchemaName: schema, DisplayName: label(display), RequiredLevel: none, MaxLength: 4000, Format: "TextArea",
});
const whole = (schema, display, isRequired = false) => ({
  "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
  SchemaName: schema, DisplayName: label(display), RequiredLevel: req(isRequired), Format: "None", MinValue: -2147483648, MaxValue: 2147483647,
});
const dateOnly = (schema, display, isRequired = false) => ({
  "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
  SchemaName: schema, DisplayName: label(display), RequiredLevel: req(isRequired), Format: "DateOnly", DateTimeBehavior: { Value: "DateOnly" },
});
const dateTime = (schema, display, isRequired = false) => ({
  "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
  SchemaName: schema, DisplayName: label(display), RequiredLevel: req(isRequired), Format: "DateAndTime", DateTimeBehavior: { Value: "UserLocal" },
});
const yesNo = (schema, display) => ({
  "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
  SchemaName: schema, DisplayName: label(display), RequiredLevel: none, DefaultValue: false,
  OptionSet: {
    "@odata.type": "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
    TrueOption: { Value: 1, Label: label("Yes") }, FalseOption: { Value: 0, Label: label("No") },
  },
});
const money = (schema, display) => ({
  "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
  SchemaName: schema, DisplayName: label(display), RequiredLevel: none, Precision: 2, PrecisionSource: 2, MinValue: 0, MaxValue: 1000000000,
});

// Tables in dependency order: the lookup targets come before SMSF Matter.
// Names cut off in the photos (marked "guess") and Year's schema name aren't confirmed; the plug-in uses none of them.
const tables = [
  {
    logical: "wbsuper_financialyear", schema: "wbsuper_FinancialYear", display: "Financial Year", plural: "Financial Years",
    primary: text("wbsuper_Name", "Name", true),
    columns: [
      dateOnly("wbsuper_StartDate", "Start Date"),
      dateOnly("wbsuper_EndDate", "End Date", true),
      yesNo("wbsuper_IsCurrent", "Is Current"),
      whole("wbsuper_Year", "Year"), // guess: not in the photographed column list
    ],
  },
  {
    logical: "wbsuper_superfundclient", schema: "wbsuper_SuperFundClient", display: "SuperFundClient", plural: "SuperFundClients",
    primary: text("wbsuper_WBCode", "WBCode", true),
    columns: [
      text("wbsuper_ABN", "ABN"),
      text("wbsuper_Addressee", "Addressee"),
      dateOnly("wbsuper_ClientTerminationDate", "ClientTerminationDate"), // guess: cut off in the photo
      whole("wbsuper_ClientTypeId", "ClientTypeId", true),
      email("wbsuper_Email", "Email"),
      text("wbsuper_Fund", "Fund", true),
      text("wbsuper_FundNoted", "FundNoted"),
      email("wbsuper_HomeEmail", "HomeEmail"),
      phone("wbsuper_HomePhone", "HomePhone"),
      memo("wbsuper_HomePhoneNotes", "HomePhoneNotes"),
      dateTime("wbsuper_LastUpdatedDate", "LastUpdatedDate", true),
      phone("wbsuper_Mobile", "Mobile"),
      memo("wbsuper_MobileNotes", "MobileNotes"),
      email("wbsuper_PartnerEmail", "PartnerEmail"),
      dateOnly("wbsuper_PartnerTerminationDate", "PartnerTerminationDate"), // guess: cut off in the photo
      text("wbsuper_Salutation", "Salutation"),
      email("wbsuper_StatementEmail", "StatementEmail"),
      whole("wbsuper_VaultClientId", "VaultClientId", true),
      phone("wbsuper_WorkPhone", "WorkPhone"),
      memo("wbsuper_WorkPhoneNotes", "WorkPhoneNotes"),
      // Partner (lookup) is left out: its target table isn't recorded.
    ],
  },
  {
    logical: "wbsuper_smsfmatter", schema: "wbsuper_SMSFMatter", display: "SMSF Matter", plural: "SMSF Matters",
    primary: text("wbsuper_WBCodeFY", "WBCodeFY"),
    columns: [
      text("wbsuper_Preparer", "Preparer"),
      money("wbsuper_ProgressFee", "Progress Fee"), // also creates wbsuper_progressfee_base
      text("wbsuper_Stage", "Stage"),
      // Internal Contact, Manager, Reviewer and Wealth Advisory Contact (lookups) are left out: targets not recorded.
    ],
    lookups: [
      { schema: "wbsuper_WBCode", display: "WBCode", target: "wbsuper_superfundclient", relationship: "wbsuper_SuperFundClient_SMSFMatter_WBCode" },
      { schema: "wbsuper_FY", display: "FY", target: "wbsuper_financialyear", relationship: "wbsuper_FinancialYear_SMSFMatter_FY" },
    ],
  },
];

async function ensurePublisher() {
  const existing = await get(`publishers?$select=publisherid,uniquename&$filter=customizationprefix eq '${PREFIX}'`);
  if (existing?.value?.length) {
    console.log(`publisher with prefix ${PREFIX} exists (${existing.value[0].uniquename})`);
    return existing.value[0].publisherid;
  }
  const clash = await get(`publishers?$select=uniquename&$filter=customizationoptionvalueprefix eq ${OPTION_PREFIX}`);
  if (clash?.value?.length) throw new Error(`option value prefix ${OPTION_PREFIX} is used by ${clash.value[0].uniquename}: pass --option-prefix`);
  const { id } = await call("POST", "publishers", {
    uniquename: PUBLISHER, friendlyname: "WB Super (test copy of dev)", customizationprefix: PREFIX, customizationoptionvalueprefix: OPTION_PREFIX,
    description: "Test publisher so the WBCodeFYName test tables have dev's wbsuper_ names. Safe to delete with the WBSuperTest solution.",
  });
  console.log(`created publisher ${PUBLISHER} (${PREFIX}, ${OPTION_PREFIX})`);
  return id;
}

async function ensureSolution(publisherId) {
  const existing = await get(`solutions?$select=solutionid&$filter=uniquename eq '${SOLUTION}'`);
  if (existing?.value?.length) return console.log(`solution ${SOLUTION} exists`);
  await call("POST", "solutions", {
    uniquename: SOLUTION, friendlyname: "WB Super Test (copy of the dev SMSF tables; safe to delete)", version: "1.0.0.0",
    "publisherid@odata.bind": `/publishers(${publisherId})`,
  });
  console.log(`created solution ${SOLUTION}`);
}

async function ensureTable(t) {
  if (await get(`EntityDefinitions(LogicalName='${t.logical}')?$select=LogicalName`)) return console.log(`table ${t.logical} exists`);
  await call("POST", "EntityDefinitions", {
    "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
    SchemaName: t.schema, DisplayName: label(t.display), DisplayCollectionName: label(t.plural),
    Description: label("Test copy of the dev table for WBCodeFYName (plugins/WBCodeFYName/fields.md). Safe to delete."),
    OwnershipType: "UserOwned", HasActivities: false, HasNotes: false, IsActivity: false,
    Attributes: [{ ...t.primary, IsPrimaryName: true }],
  }, { solution: SOLUTION });
  console.log(`created table ${t.logical}`);
}

async function ensureColumns(t) {
  const existing = await get(`EntityDefinitions(LogicalName='${t.logical}')/Attributes?$select=LogicalName`);
  // Null while a just-created table's metadata is still provisioning, or on a throttled (429) read.
  if (!existing) throw new Error(`couldn't read ${t.logical}'s columns; wait a minute and re-run (it skips what exists)`);
  const names = new Set(existing.value.map((a) => a.LogicalName));
  for (const column of t.columns) {
    if (names.has(column.SchemaName.toLowerCase())) continue;
    await call("POST", `EntityDefinitions(LogicalName='${t.logical}')/Attributes`, column, { solution: SOLUTION });
    console.log(`created column ${t.logical}.${column.SchemaName.toLowerCase()}`);
  }
  for (const l of t.lookups ?? []) {
    if (names.has(l.schema.toLowerCase())) continue;
    await call("POST", "RelationshipDefinitions", {
      "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
      SchemaName: l.relationship, ReferencedEntity: l.target, ReferencingEntity: t.logical,
      Lookup: { "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata", SchemaName: l.schema, DisplayName: label(l.display), RequiredLevel: none },
    }, { solution: SOLUTION });
    console.log(`created lookup ${t.logical}.${l.schema.toLowerCase()} → ${l.target}`);
  }
}

// Rows from fields.md, plus one invalid FY. The plug-in wants FY plus two digits (NameRules.cs).
const financialYears = [
  { wbsuper_name: "FY25", wbsuper_startdate: "2024-07-01", wbsuper_enddate: "2025-06-30", wbsuper_iscurrent: false, wbsuper_year: 2025 },
  { wbsuper_name: "FY26", wbsuper_startdate: "2025-07-01", wbsuper_enddate: "2026-06-30", wbsuper_iscurrent: false, wbsuper_year: 2026 },
  { wbsuper_name: "FY27", wbsuper_startdate: "2026-07-01", wbsuper_enddate: "2027-06-30", wbsuper_iscurrent: true, wbsuper_year: 2027 },
  { wbsuper_name: "FY2028 (invalid test)", wbsuper_startdate: "2027-07-01", wbsuper_enddate: "2028-06-30", wbsuper_iscurrent: false, wbsuper_year: 2028 },
];

// A WBCode is a six-digit Client ID followed by 70 (GLOSSARY.md). The last two break that rule.
const clients = [
  ["00224570", "Gregg Family Super Fund"],
  ["00100170", "Test Super Fund One"],
  ["00100270", "Test Super Fund Two"],
  ["00100370", "Test Super Fund Three"],
  ["00100512", "Invalid suffix (test)"],
  ["1234570", "Invalid seven digits (test)"],
].map(([wbcode, fund], i) => ({
  wbsuper_wbcode: wbcode, wbsuper_fund: fund, wbsuper_clienttypeid: 1, wbsuper_vaultclientid: 1000 + i,
  wbsuper_lastupdateddate: new Date().toISOString(),
}));

async function ensureRows(set, nameColumn, rows) {
  for (const row of rows) {
    const name = row[nameColumn];
    const existing = await get(`${set}?$select=${nameColumn}&$filter=${nameColumn} eq '${name.replace(/'/g, "''")}'`);
    if (existing?.value?.length) continue;
    await call("POST", set, row);
    console.log(`created ${set} row ${name}`);
  }
}

// Adds both lookups to SMSF Matter's main form, under the name, and makes the name read-only
// (the plug-in README's prerequisites), so the plug-in can be tested from a form.
async function ensureForm() {
  const form = (await get("systemforms?$select=formid,formxml&$filter=objecttypecode eq 'wbsuper_smsfmatter' and type eq 2 and name eq 'Information'"))?.value?.[0];
  if (!form) throw new Error("SMSF Matter has no main form called Information");
  if (form.formxml.includes('id="wbsuper_wbcode"')) return console.log("form has the lookups");
  const lookupRow = (field, text) =>
    `<row><cell id="{${crypto.randomUUID()}}"><labels><label description="${text}" languagecode="1033" /></labels>` +
    `<control id="${field}" classid="{270BD3DB-D9AF-4782-9025-509E298DEC0A}" datafieldname="${field}" disabled="false" /></cell></row>`;
  const nameControl = /<control id="wbsuper_wbcodefy"([^>]*?)\s*\/>/;
  const match = form.formxml.match(nameControl);
  if (!match) throw new Error("the form has no wbsuper_wbcodefy control");
  const readOnlyName = `<control id="wbsuper_wbcodefy"${match[1].replace(/\sdisabled="[^"]*"/, "")} disabled="true" />`;
  // The name's row ends at the first </row> after its control; the lookups go straight after it.
  const at = form.formxml.indexOf("</row>", match.index) + "</row>".length;
  const formxml = (form.formxml.slice(0, at) + lookupRow("wbsuper_wbcode", "WBCode") + lookupRow("wbsuper_fy", "FY") + form.formxml.slice(at)).replace(nameControl, readOnlyName);
  await call("PATCH", `systemforms(${form.formid})`, { formxml }, { solution: SOLUTION });
  console.log("added WBCode and FY to the SMSF Matter form; name is read-only");
}

// The alternate key on WBCode + FY that the plug-in README requires of the project, so each pair appears once.
// Dataverse builds the key's index in the background: it's Pending, then Active (or Failed if duplicates exist).
async function ensureAlternateKey() {
  const keys = await get("EntityDefinitions(LogicalName='wbsuper_smsfmatter')/Keys?$select=LogicalName,EntityKeyIndexStatus");
  if (!keys) throw new Error("couldn't read SMSF Matter's keys");
  const existing = keys.value.find((k) => k.LogicalName === "wbsuper_wbcodefykey");
  if (existing) return console.log(`alternate key wbsuper_wbcodefykey exists (${existing.EntityKeyIndexStatus})`);
  await call("POST", "EntityDefinitions(LogicalName='wbsuper_smsfmatter')/Keys", {
    SchemaName: "wbsuper_WBCodeFYKey", DisplayName: label("WBCode and FY"), KeyAttributes: ["wbsuper_wbcode", "wbsuper_fy"],
  }, { solution: SOLUTION });
  console.log("created alternate key wbsuper_wbcodefykey (WBCode + FY); its index builds in the background");
}

const publisherId = await ensurePublisher();
await ensureSolution(publisherId);
for (const t of tables) await ensureTable(t);
for (const t of tables) await ensureColumns(t);
await ensureForm();
await ensureAlternateKey();
await publish({ entities: tables.map((t) => t.logical) });
await ensureRows("wbsuper_financialyears", "wbsuper_name", financialYears);
await ensureRows("wbsuper_superfundclients", "wbsuper_wbcode", clients);
console.log("done");
