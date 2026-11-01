// Registers WBCodeFYName in an environment through the Web API, without the Windows-only Plug-in Registration Tool
// (ADR-0006). Safe to re-run: it updates what exists and creates what doesn't.
//
//   1. the WBWBCodeFYName solution (WilliamBuck publisher), if it's missing
//   2. the assembly (uploaded; re-uploaded on every run)
//   3. the plug-in type WBCodeFYName.SetPrimaryName
//   4. the Create and Update steps: PreOperation, synchronous, rank 20, the step configuration as unsecure configuration,
//      and on Update the filtering attributes (both lookups and the name). Disabled steps are enabled again.
//   5. the PreImage on the Update step (both lookups)
//
// Everything is added to the solution, ready for `pac solution sync`.
//
// WHEN TO USE IT: only for a plug-in's first registration (before solution/src exists) and in scratch environments.
// Once solution/src is in the repo, every other environment gets the plug-in by importing the solution. Never run
// this script in an environment and then import the solution there: the script's components get new IDs, so the
// import either fails on the assembly or adds a second pair of steps, and the plug-in runs twice on every save.
//
// Usage (from the repo root, after `dotnet build plugins/WBCodeFYName/WBCodeFYName/WBCodeFYName.csproj -c Release`):
//   export DATAVERSE_URL=https://<org>.crm6.dynamics.com
//   export DATAVERSE_TOKEN=$(az account get-access-token --resource $DATAVERSE_URL --query accessToken -o tsv)
//   node plugins/WBCodeFYName/scripts/register.mjs --env $DATAVERSE_URL [--config <step-config.json>] [--dry-run]
//
// --env must equal DATAVERSE_URL, so a token for one environment is never used against another by mistake.
// The configuration is validated against config/step-config.schema.json before anything is written.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { arg, dataverseClient, normalizeUrl, odataString as q } from "../../../scripts/lib/dataverse.mjs";
import { loadSchema, validateStepConfig } from "./step-config.mjs";

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ASSEMBLY_NAME = "WBCodeFYName";
const TYPE_NAME = "WBCodeFYName.SetPrimaryName";
const SOLUTION = "WBWBCodeFYName";
const PUBLISHER = "WilliamBuck";
// Solution component types for AddSolutionComponent.
const COMPONENT = { assembly: 91, step: 92 };

function fail(message) {
  console.error(message);
  process.exit(1);
}

let env, configPath, assemblyPath;
try {
  env = normalizeUrl(arg("env"));
  configPath = resolve(arg("config", resolve(PLUGIN, "config/examples/step-config.example.json")));
  assemblyPath = resolve(arg("assembly", resolve(PLUGIN, `${ASSEMBLY_NAME}/bin/Release/net48/${ASSEMBLY_NAME}.dll`)));
} catch (e) {
  fail(e.message);
}
const DRY_RUN = process.argv.includes("--dry-run");

const ORG = normalizeUrl(process.env.DATAVERSE_URL);
const TOKEN = process.env.DATAVERSE_TOKEN;
if (!ORG || !TOKEN) fail("Set DATAVERSE_URL and DATAVERSE_TOKEN first (see the usage at the top of this script).");
if (env !== ORG) fail(`--env must equal DATAVERSE_URL (${ORG}).`);
console.error(`Target environment: ${ORG}${DRY_RUN ? " (dry run: nothing is written)" : ""}`);

const config = JSON.parse(readFileSync(configPath, "utf8"));
const configErrors = validateStepConfig(config, loadSchema(resolve(PLUGIN, "config/step-config.schema.json")));
if (configErrors.length) fail(`${configPath} isn't a valid step configuration:\n  ${configErrors.join("\n  ")}`);
// Stored minified, so the exported step XML is one stable line.
const unsecure = JSON.stringify(config);

const content = readFileSync(assemblyPath).toString("base64");
const fileVersion = readFileSync(resolve(PLUGIN, `${ASSEMBLY_NAME}/${ASSEMBLY_NAME}.csproj`), "utf8").match(/<FileVersion>([^<]+)</)?.[1];
if (!fileVersion) fail(`No <FileVersion> in ${ASSEMBLY_NAME}.csproj`);
const assemblyDescription = `WBCodeFYName ${fileVersion}`;

const client = dataverseClient({ url: ORG, token: TOKEN });
const { one } = client;

/** Writes through the Web API, adding new components to the solution. In a dry run, only says what it would do. */
async function write(method, path, body, { inSolution = true } = {}) {
  if (DRY_RUN) {
    console.log(`  would ${method} ${path}`);
    return { id: "00000000-0000-0000-0000-000000000000" };
  }
  // Creating the solution itself must not name it in the header (0x80040217).
  return client.call(method, path, body, inSolution ? { solution: SOLUTION } : {});
}

async function ensureSolution() {
  if (await one(`solutions?$select=solutionid&$filter=uniquename eq '${SOLUTION}'`)) return console.log(`solution ${SOLUTION} exists`);
  const publisher = await one(`publishers?$select=publisherid&$filter=uniquename eq '${PUBLISHER}'`);
  if (!publisher) fail(`Publisher ${PUBLISHER} not found. Create it first (ADR-0003).`);
  await write("POST", "solutions", {
    uniquename: SOLUTION, friendlyname: SOLUTION, version: fileVersion,
    description: "WBCodeFYName plug-in: sets the WBCodeFY primary name from the WBCode and FY lookups.",
    "publisherid@odata.bind": `/publishers(${publisher.publisherid})`,
  }, { inSolution: false });
  console.log(`${DRY_RUN ? "would create" : "created"} solution ${SOLUTION}`);
}

async function ensureAssembly() {
  const { json } = await client.call("GET", `pluginassemblies?$select=pluginassemblyid,version,publickeytoken&$filter=name eq '${ASSEMBLY_NAME}'`);
  const matches = json.value;
  // More than one means a second registration exists (another key, or an orphan left by an AssemblyVersion change).
  // Updating either could attach the steps to the wrong one, so stop and let a person decide.
  if (matches.length > 1) {
    fail(`${matches.length} assemblies are called ${ASSEMBLY_NAME} (${matches.map((m) => `${m.version} ${m.publickeytoken}`).join("; ")}). Remove the extra one first.`);
  }
  const existing = matches[0];
  if (existing) {
    await write("PATCH", `pluginassemblies(${existing.pluginassemblyid})`, { content, description: assemblyDescription });
    console.log(`${DRY_RUN ? "would update" : "updated"} assembly ${ASSEMBLY_NAME} ${existing.version} (file version ${fileVersion})`);
    return existing.pluginassemblyid;
  }
  const { id } = await write("POST", "pluginassemblies", {
    name: ASSEMBLY_NAME, content, isolationmode: 2 /* sandbox */, sourcetype: 0 /* database */, description: assemblyDescription,
  });
  console.log(`${DRY_RUN ? "would register" : "registered"} assembly ${ASSEMBLY_NAME}`);
  return id;
}

async function ensureType(assemblyId) {
  const existing = await one(`plugintypes?$select=plugintypeid&$filter=typename eq '${TYPE_NAME}' and _pluginassemblyid_value eq ${assemblyId}`);
  if (existing) return console.log(`plug-in type ${TYPE_NAME} exists`), existing.plugintypeid;
  const { id } = await write("POST", "plugintypes", {
    typename: TYPE_NAME, name: TYPE_NAME, friendlyname: TYPE_NAME,
    description: "Sets the WBCodeFY primary name from the WBCode and FY lookups.",
    "pluginassemblyid@odata.bind": `/pluginassemblies(${assemblyId})`,
  });
  console.log(`${DRY_RUN ? "would create" : "created"} plug-in type ${TYPE_NAME}`);
  return id;
}

async function ensureStep(typeId, message, filteringattributes) {
  const sdkMessage = await one(`sdkmessages?$select=sdkmessageid&$filter=name eq '${message}'`);
  if (!sdkMessage) fail(`The ${message} message wasn't found. Does this token have read access to sdkmessage?`);
  const filter = await one(`sdkmessagefilters?$select=sdkmessagefilterid&$filter=primaryobjecttypecode eq '${q(config.targetTable)}' and _sdkmessageid_value eq ${sdkMessage.sdkmessageid}`);
  if (!filter) fail(`No ${message} message filter for table ${config.targetTable}. Is targetTable right, and does the table exist here?`);
  // invocationsource isn't set: Dataverse stores Child (1) whatever is sent (decisions.md W-1).
  const settings = {
    name: `${TYPE_NAME}: ${message} of ${config.targetTable}`,
    description: `Sets ${config.nameColumn} from ${config.wbCodeLookup} and ${config.fyLookup}.`,
    stage: 20, // PreOperation
    mode: 0, // synchronous
    rank: 20,
    supporteddeployment: 0, // server only
    asyncautodelete: false,
    configuration: unsecure,
    filteringattributes,
  };
  const existing = await one(`sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,statecode&$filter=_eventhandler_value eq ${typeId} and _sdkmessageid_value eq ${sdkMessage.sdkmessageid} and _sdkmessagefilterid_value eq ${filter.sdkmessagefilterid}`);
  if (!existing) {
    const { id } = await write("POST", "sdkmessageprocessingsteps", {
      ...settings,
      "eventhandler_plugintype@odata.bind": `/plugintypes(${typeId})`,
      "sdkmessageid@odata.bind": `/sdkmessages(${sdkMessage.sdkmessageid})`,
      "sdkmessagefilterid@odata.bind": `/sdkmessagefilters(${filter.sdkmessagefilterid})`,
    });
    console.log(`${DRY_RUN ? "would create" : "created"} step ${settings.name}`);
    return id;
  }
  const id = existing.sdkmessageprocessingstepid;
  await write("PATCH", `sdkmessageprocessingsteps(${id})`, settings);
  console.log(`${DRY_RUN ? "would update" : "updated"} step ${settings.name}`);
  // An import without --activate-plugins leaves steps disabled (decisions.md W-3). Re-running the script repairs that.
  if (existing.statecode !== 0) {
    await write("PATCH", `sdkmessageprocessingsteps(${id})`, { statecode: 0, statuscode: 1 });
    console.log(`${DRY_RUN ? "would enable" : "enabled"} step ${settings.name} (it was disabled)`);
  }
  return id;
}

async function ensurePreImage(stepId) {
  const settings = {
    name: "PreImage", entityalias: "PreImage", imagetype: 0 /* pre-image */, messagepropertyname: "Target",
    attributes: [config.wbCodeLookup, config.fyLookup].join(","),
  };
  const existing = await one(`sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid,attributes&$filter=_sdkmessageprocessingstepid_value eq ${stepId} and entityalias eq 'PreImage'`);
  if (existing) {
    // Only the columns can change: a PATCH that repeats name, alias, type or message property fails with 0x80040216.
    if (existing.attributes === settings.attributes) return console.log("PreImage exists");
    await write("PATCH", `sdkmessageprocessingstepimages(${existing.sdkmessageprocessingstepimageid})`, { attributes: settings.attributes });
    return console.log(`${DRY_RUN ? "would update" : "updated"} PreImage columns`);
  }
  await write("POST", "sdkmessageprocessingstepimages", { ...settings, "sdkmessageprocessingstepid@odata.bind": `/sdkmessageprocessingsteps(${stepId})` });
  console.log(`${DRY_RUN ? "would create" : "created"} PreImage`);
}

async function addToSolution(componentId, componentType) {
  // AddSolutionComponent is idempotent, so components that existed before this run end up in the solution too.
  await write("POST", "AddSolutionComponent", {
    ComponentId: componentId, ComponentType: componentType, SolutionUniqueName: SOLUTION,
    AddRequiredComponents: false, DoNotIncludeSubcomponents: false,
  });
}

await ensureSolution();
const assemblyId = await ensureAssembly();
const typeId = await ensureType(assemblyId);
const createStep = await ensureStep(typeId, "Create", null);
const updateStep = await ensureStep(typeId, "Update", [config.wbCodeLookup, config.fyLookup, config.nameColumn].join(","));
await ensurePreImage(updateStep);
await addToSolution(assemblyId, COMPONENT.assembly);
await addToSolution(createStep, COMPONENT.step);
await addToSolution(updateStep, COMPONENT.step);
console.log(`done: ${SOLUTION} holds the assembly and both steps.${DRY_RUN ? "" : " Next: pac solution sync (see the README)."}`);
