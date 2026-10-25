// Creates the wb_gridspike test table that GridFormatter is tested against: one column of every
// type the brief needs, coloured choice options, two views and 30 rows. Idempotent: anything that
// already exists is left alone, so it's safe to re-run.
// Usage: node scripts/test-env/create-gridspike.mjs [--solution WBGridSpikeTest] [--publisher WilliamBuck] [--tz Australia/Sydney]
// See docs/testing/gridformatter-test-environment.md.
import { fileURLToPath } from "node:url";
import { arg, call, get, label, publish } from "./lib.mjs";

const SOLUTION = arg("solution", "WBGridSpikeTest");
// The test user's time zone, so User Local date-only values are stored as an app user would store them (#39).
const TZ = arg("tz", "Australia/Sydney");
const PUBLISHER = arg("publisher", "WilliamBuck");
const TABLE = "wb_gridspike";
const SET = "wb_gridspikes";

const none = { Value: "None", CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings" };
const option = (value, text, color) => ({ Value: value, Label: label(text), ...(color ? { Color: color } : {}) });

// Option values use the WilliamBuck option value prefix 94879 (ADR-0003).
export const RAG = { red: 948790000, amber: 948790001, green: 948790002, unknown: 948790003 };
export const TAG = { alpha: 948790000, beta: 948790001, gamma: 948790002 };

const columns = [
  {
    "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
    SchemaName: "wb_RagStatus", DisplayName: label("RAG status"), RequiredLevel: none,
    OptionSet: {
      "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata", IsGlobal: false, OptionSetType: "Picklist",
      // "Unknown" deliberately has no colour (brief §8.3: an option without a colour).
      Options: [option(RAG.red, "Red", "#D13438"), option(RAG.amber, "Amber", "#FFB900"), option(RAG.green, "Green", "#107C10"), option(RAG.unknown, "Unknown")],
    },
  },
  {
    "@odata.type": "Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata",
    SchemaName: "wb_Tags", DisplayName: label("Tags"), RequiredLevel: none,
    OptionSet: {
      "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata", IsGlobal: false, OptionSetType: "Picklist",
      Options: [option(TAG.alpha, "Alpha", "#0078D4"), option(TAG.beta, "Beta", "#8764B8"), option(TAG.gamma, "Gamma")],
    },
  },
  {
    "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
    SchemaName: "wb_Flagged", DisplayName: label("Flagged"), RequiredLevel: none, DefaultValue: false,
    OptionSet: {
      "@odata.type": "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
      TrueOption: { Value: 1, Label: label("Yes") }, FalseOption: { Value: 0, Label: label("No") },
    },
  },
  { "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata", SchemaName: "wb_Count", DisplayName: label("Count"), RequiredLevel: none, Format: "None", MinValue: -1000000, MaxValue: 1000000 },
  { "@odata.type": "Microsoft.Dynamics.CRM.DecimalAttributeMetadata", SchemaName: "wb_Score", DisplayName: label("Score"), RequiredLevel: none, Precision: 2, MinValue: -1000000, MaxValue: 1000000 },
  { "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata", SchemaName: "wb_Budget", DisplayName: label("Budget"), RequiredLevel: none, Precision: 2, PrecisionSource: 2, MinValue: 0, MaxValue: 1000000000 },
  { "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata", SchemaName: "wb_ActualCost", DisplayName: label("Actual cost"), RequiredLevel: none, Precision: 2, PrecisionSource: 2, MinValue: 0, MaxValue: 1000000000 },
  { "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", SchemaName: "wb_DueDate", DisplayName: label("Due date"), RequiredLevel: none, Format: "DateOnly", DateTimeBehavior: { Value: "DateOnly" } },
  { "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", SchemaName: "wb_ReviewedOn", DisplayName: label("Reviewed on"), RequiredLevel: none, Format: "DateAndTime", DateTimeBehavior: { Value: "UserLocal" } },
  // The other two date behaviours (#39): date-only with User Local behaviour (stored as the UTC instant of the
  // user's local midnight) and date-and-time with Time Zone Independent behaviour (stored and shown as entered).
  { "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", SchemaName: "wb_StartDate", DisplayName: label("Start date"), RequiredLevel: none, Format: "DateOnly", DateTimeBehavior: { Value: "UserLocal" } },
  { "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", SchemaName: "wb_MeetingAt", DisplayName: label("Meeting at"), RequiredLevel: none, Format: "DateAndTime", DateTimeBehavior: { Value: "TimeZoneIndependent" } },
  { "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", SchemaName: "wb_Notes", DisplayName: label("Notes"), RequiredLevel: none, MaxLength: 200, FormatName: { Value: "Text" } },
];

async function ensureSolution() {
  const existing = await get(`solutions?$select=solutionid&$filter=uniquename eq '${SOLUTION}'`);
  if (existing?.value?.length) return console.log(`solution ${SOLUTION} exists`);
  const publisher = await get(`publishers?$select=publisherid&$filter=uniquename eq '${PUBLISHER}'`);
  const publisherId = publisher?.value?.[0]?.publisherid;
  if (!publisherId) throw new Error(`publisher ${PUBLISHER} not found: create it first (ADR-0003)`);
  await call("POST", "solutions", {
    uniquename: SOLUTION, friendlyname: "WB Grid Spike Test (test data; safe to delete)", version: "1.0.0.0",
    "publisherid@odata.bind": `/publishers(${publisherId})`,
  });
  console.log(`created solution ${SOLUTION}`);
}

async function ensureTable() {
  if (await get(`EntityDefinitions(LogicalName='${TABLE}')?$select=LogicalName`)) return console.log(`table ${TABLE} exists`);
  await call("POST", "EntityDefinitions", {
    "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
    SchemaName: "wb_GridSpike", DisplayName: label("Grid spike"), DisplayCollectionName: label("Grid spikes"),
    Description: label("Test data for GridFormatter (issue #9 onwards). Safe to delete."),
    OwnershipType: "UserOwned", HasActivities: false, HasNotes: false, IsActivity: false,
    Attributes: [{
      "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata", SchemaName: "wb_Name", IsPrimaryName: true,
      DisplayName: label("Name"), RequiredLevel: none, MaxLength: 100, FormatName: { Value: "Text" },
    }],
  }, { solution: SOLUTION });
  console.log(`created table ${TABLE}`);
}

export async function ensureColumns() {
  const existing = await get(`EntityDefinitions(LogicalName='${TABLE}')/Attributes?$select=LogicalName`);
  const names = new Set(existing.value.map((a) => a.LogicalName));
  for (const column of columns) {
    if (names.has(column.SchemaName.toLowerCase())) continue;
    await call("POST", `EntityDefinitions(LogicalName='${TABLE}')/Attributes`, column, { solution: SOLUTION });
    console.log(`created column ${column.SchemaName}`);
  }
  if (!names.has("wb_parentid")) {
    // A lookup to the same table, so there's a Lookup column without needing other tables or data.
    await call("POST", "RelationshipDefinitions", {
      "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
      SchemaName: "wb_GridSpike_Parent", ReferencedEntity: TABLE, ReferencingEntity: TABLE,
      Lookup: { "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata", SchemaName: "wb_ParentId", DisplayName: label("Parent"), RequiredLevel: none },
    }, { solution: SOLUTION });
    console.log("created lookup wb_ParentId");
  }
}

export const ALL = ["wb_name", "statecode", "statuscode", "wb_ragstatus", "wb_tags", "wb_flagged", "wb_parentid", "ownerid", "wb_count", "wb_score", "wb_budget", "wb_actualcost", "wb_duedate", "wb_reviewedon", "wb_startdate", "wb_meetingat", "wb_notes", "createdon"];
// Leaves out wb_ragstatus and statecode, to test rules whose columns aren't in the view (V2).
const NARROW = ["wb_name", "wb_duedate", "wb_count", "wb_budget"];

/** A view's fetchxml and layoutxml showing `cols`, sorted by name. No statecode filter, so inactive rows show too. */
export function viewXml(cols) {
  const fetchxml = `<fetch version="1.0" mapping="logical"><entity name="${TABLE}">${cols.map((c) => `<attribute name="${c}"/>`).join("")}<attribute name="wb_gridspikeid"/><order attribute="wb_name" descending="false"/></entity></fetch>`;
  const layoutxml = `<grid name="resultset" object="1" jump="wb_name" select="1" icon="1" preview="1"><row name="result" id="wb_gridspikeid">${cols.map((c) => `<cell name="${c}" width="${c === "wb_name" ? 200 : 130}"/>`).join("")}</row></grid>`;
  return { fetchxml, layoutxml };
}

async function ensureView(name, cols, isDefault) {
  const existing = await get(`savedqueries?$select=savedqueryid&$filter=name eq '${name}' and returnedtypecode eq '${TABLE}'`);
  if (existing?.value?.length) return console.log(`view "${name}" exists`);
  await call("POST", "savedqueries", { name, returnedtypecode: TABLE, querytype: 0, ...viewXml(cols), isdefault: isDefault }, { solution: SOLUTION });
  console.log(`created view "${name}"`);
}

export const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

/** Minutes `timeZone` is ahead of UTC at `instant`, from how Intl writes the instant in the zone. */
function zoneOffsetMinutes(instant, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(instant).map((p) => [p.type, p.value]));
  return (Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - instant.getTime()) / 60_000;
}

/** The UTC instant of local midnight on `date` (YYYY-MM-DD) in `timeZone`. Two passes, so a day when daylight saving changes is right. */
export function localMidnight(date, timeZone = TZ) {
  const wallClock = Date.parse(`${date}T00:00:00Z`);
  const guess = wallClock - zoneOffsetMinutes(new Date(wallClock), timeZone) * 60_000;
  return new Date(wallClock - zoneOffsetMinutes(new Date(guess), timeZone) * 60_000).toISOString();
}

/** One row's values; the same pattern is used by add-gridspike-rows.mjs. */
export function rowValues(i, width = 2) {
  const rags = [RAG.red, RAG.amber, RAG.green, RAG.unknown, null];
  const tagSets = [String(TAG.alpha), `${TAG.alpha},${TAG.beta}`, String(TAG.gamma), null];
  return {
    wb_name: `Spike row ${String(i).padStart(width, "0")}`,
    wb_ragstatus: rags[i % rags.length],
    wb_tags: tagSets[i % tagSets.length],
    wb_flagged: i % 3 === 0,
    wb_count: i % 7 === 0 ? null : i * 10,
    wb_score: i % 6 === 0 ? null : Math.round(i * 3.14159 * 100) / 100,
    wb_budget: i * 1000,
    wb_actualcost: i * 1000 + (i % 2 === 0 ? 250 : -250), // even rows over budget (column-to-column tests)
    wb_duedate: i % 8 === 0 ? null : day((i % 10) - 5), // -5..+4 days from today: overdue, today and future
    wb_reviewedon: i % 9 === 0 ? null : new Date(Date.now() - i * 3600_000 * 7).toISOString(),
    // Same dates as wb_duedate; 21:00 so a UTC reading of a time-zone-independent value lands on the next day east of UTC.
    wb_startdate: i % 8 === 0 ? null : localMidnight(day((i % 10) - 5)),
    wb_meetingat: i % 8 === 0 ? null : `${day((i % 10) - 5)}T21:00:00Z`,
    wb_notes: i % 4 === 0 ? null : `Note ${i}`,
  };
}

async function ensureRows() {
  const existing = await get(`${SET}?$select=wb_gridspikeid&$top=1`);
  if (existing?.value?.length) return console.log("rows exist");
  const ids = [];
  for (let i = 1; i <= 30; i++) {
    const row = rowValues(i);
    // Rows 5, 10, 15… get a Parent, so the Lookup column has values.
    if (ids.length >= 2 && i % 5 === 0) row["wb_ParentId@odata.bind"] = `/${SET}(${ids[0]})`;
    const { id } = await call("POST", SET, row);
    ids.push(id);
  }
  // Rows 25-30 inactive (statecode 1, statuscode 2), for the inactive-grey rule.
  for (const id of ids.slice(24)) await call("PATCH", `${SET}(${id})`, { statecode: 1, statuscode: 2 });
  console.log(`created ${ids.length} rows (6 inactive)`);
}

// Run only when executed directly (add-gridspike-rows.mjs imports rowValues from here).
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await ensureSolution();
  await ensureTable();
  await ensureColumns();
  await publish({ entities: [TABLE] });
  await ensureView("Grid spike - all columns", ALL, true);
  await ensureView("Grid spike - narrow (no RAG, no status)", NARROW, false);
  await publish({ entities: [TABLE] });
  await ensureRows();
  console.log("done");
}
