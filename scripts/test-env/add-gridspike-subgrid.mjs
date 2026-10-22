// Adds a "Child rows" subgrid to wb_gridspike's main form, listing the rows whose Parent is the open
// row (the wb_GridSpike_Parent self-relationship), so GridFormatter can be tested in a form subgrid.
// Idempotent: anything already in place is left alone.
// Usage: node scripts/test-env/add-gridspike-subgrid.mjs [--view "Grid spike - all columns"]
// Run set-grid-customizer.mjs first: the table's grid settings are what the subgrid copies.
// Open "Spike row 01" to see it. create-gridspike.mjs gives rows 5, 10, 15… that row as their Parent,
// but they're all Red (the RAG cycles every 5 rows), so rows 02-04 are made children too.
//
// A table's grid setting covers its views only, not form subgrids. A subgrid gets the Power Apps
// grid (and its customizer) from a <controlDescription> in the form XML, linked to the subgrid
// control's uniqueid, with the view and relationship inside its data-set.
// See docs/testing/gridformatter-test-environment.md.
import { randomUUID } from "node:crypto";
import { arg, call, get, publish } from "./lib.mjs";

const TABLE = "wb_gridspike";
const SET = "wb_gridspikes";
const RELATIONSHIP = "wb_GridSpike_Parent";
const CONTROL_ID = "wb_childrows";
const SUBGRID = "{E7A81278-8635-4d9e-8D4D-59480B391C5B}";
const ONE_GRID = "Microsoft.PowerApps.PowerAppsOneGrid";
const VIEW = arg("view", "Grid spike - all columns");

const rowId = async (name) => (await get(`${SET}?$select=wb_gridspikeid&$filter=wb_name eq '${name}'`))?.value?.[0]?.wb_gridspikeid;
const parentId = await rowId("Spike row 01");
if (!parentId) throw new Error(`"Spike row 01" not found: run create-gridspike.mjs first`);
for (const name of ["Spike row 02", "Spike row 03", "Spike row 04"]) {
  const id = await rowId(name);
  if (id) await call("PATCH", `${SET}(${id})`, { "wb_ParentId@odata.bind": `/${SET}(${parentId})` });
}
console.log("rows 02-04 have Spike row 01 as their Parent (Amber, Green, Unknown children)");

const forms = await get(`systemforms?$select=formid,name,formxml&$filter=objecttypecode eq '${TABLE}' and type eq 2`);
const form = forms?.value?.[0];
if (!form) throw new Error(`no main form for ${TABLE}`);
const views = await get(`savedqueries?$select=savedqueryid&$filter=name eq '${VIEW}' and returnedtypecode eq '${TABLE}'`);
const viewId = views?.value?.[0]?.savedqueryid;
if (!viewId) throw new Error(`view "${VIEW}" not found: run create-gridspike.mjs first`);

const guid = () => `{${randomUUID().toUpperCase()}}`;
let formxml = form.formxml;

// 1. The subgrid itself, appended to the first tab's last column.
if (!formxml.includes(`id="${CONTROL_ID}"`)) {
  const section = `<section name="childrows" showlabel="true" showbar="false" IsUserDefined="1" id="${guid()}" columns="1"><labels><label description="Child rows" languagecode="1033" /></labels><rows><row><cell id="${guid()}" rowspan="10" colspan="1" showlabel="false"><labels><label description="Child rows" languagecode="1033" /></labels><control id="${CONTROL_ID}" classid="${SUBGRID}" indicationOfSubgrid="true"><parameters><TargetEntityType>${TABLE}</TargetEntityType><RelationshipName>${RELATIONSHIP}</RelationshipName><ViewId>{${viewId}}</ViewId><IsUserView>false</IsUserView><AutoExpand>Fixed</AutoExpand><RecordsPerPage>10</RecordsPerPage><EnableQuickFind>false</EnableQuickFind><EnableViewPicker>false</EnableViewPicker><EnableJumpBar>false</EnableJumpBar><ChartGridMode>Grid</ChartGridMode><VisualizationId /><IsUserChart>false</IsUserChart><EnableChartPicker>false</EnableChartPicker></parameters></control></cell></row></rows></section>`;
  formxml = formxml.replace("</sections>", `${section}</sections>`);
  if (!formxml.includes(`id="${CONTROL_ID}"`)) throw new Error("couldn't find a <sections> element in the form XML");
  console.log(`added subgrid ${CONTROL_ID} (view "${VIEW}")`);
}

// 2. A uniqueid on the subgrid control, for the controlDescription to point at.
const controlTag = new RegExp(`<control id="${CONTROL_ID}"[^>]*>`);
let uniqueId = formxml.match(controlTag)[0].match(/uniqueid="([^"]+)"/)?.[1];
if (!uniqueId) {
  uniqueId = guid();
  formxml = formxml.replace(controlTag, (tag) => tag.replace(/>$/, ` uniqueid="${uniqueId}">`));
}

// 3. The Power Apps grid on the subgrid, with the table's grid settings (so the same customizer).
if (!formxml.includes(`forControl="${uniqueId}"`)) {
  const config = await get(`customcontroldefaultconfigs?$select=controldescriptionxml&$filter=primaryentitytypecode eq '${TABLE}'`);
  const tableXml = config?.value?.[0]?.controldescriptionxml ?? "";
  if (!tableXml.includes(ONE_GRID)) throw new Error(`${TABLE} has no Power Apps grid: run set-grid-customizer.mjs first`);
  const dataSet = `<data-set name="Items"><ViewId>{${viewId}}</ViewId><TargetEntityType>${TABLE}</TargetEntityType><IsUserView>false</IsUserView><EnableViewPicker>false</EnableViewPicker><RelationshipName>${RELATIONSHIP}</RelationshipName><FilteredViewIds>{${viewId}}</FilteredViewIds></data-set>`;
  const description = tableXml
    .match(/<controlDescription>[\s\S]*<\/controlDescription>/)[0]
    .replace("<controlDescription>", `<controlDescription forControl="${uniqueId}">`)
    .replace(/<data-set name="Items">[\s\S]*?<\/data-set>/g, dataSet);
  formxml = formxml.includes("<controlDescriptions>")
    ? formxml.replace("</controlDescriptions>", `${description}</controlDescriptions>`)
    : formxml.replace("</form>", `<controlDescriptions>${description}</controlDescriptions></form>`);
  const customizer = tableXml.match(/<GridCustomizerControlFullName[^>]*>([^<]*)</)?.[1] || "(none)";
  console.log(`subgrid ${CONTROL_ID} uses the Power Apps grid, customizer ${customizer}`);
}

if (formxml === form.formxml) {
  console.log(`form "${form.name}" already has the subgrid and its grid settings`);
} else {
  await call("PATCH", `systemforms(${form.formid})`, { formxml }, { extraHeaders: { "If-Match": "*" } });
  await publish({ entities: [TABLE] });
  console.log(`updated form "${form.name}"; published. Hard-reload (Cmd+Shift+R) the form to pick it up.`);
}
