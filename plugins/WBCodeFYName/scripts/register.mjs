// Registers WBCodeFYName in an environment through the Web API, so the first registration doesn't need the
// Windows-only Plug-in Registration Tool (ADR-0006). Safe to re-run: it updates what exists and creates what doesn't.
//
//   1. the WBWBCodeFYName solution (WilliamBuck publisher), if it's missing
//   2. the assembly (uploaded; re-uploaded on every run)
//   3. the plug-in type WBCodeFYName.SetPrimaryName
//   4. the Create and Update steps: PreOperation, synchronous, rank 20, the step configuration as unsecure configuration,
//      and on Update the filtering attributes (both lookups and the name)
//   5. the PreImage on the Update step (both lookups)
//
// Everything is added to the solution, ready for `pac solution sync`.
//
// Usage (from the repo root, after `dotnet build plugins/WBCodeFYName/WBCodeFYName/WBCodeFYName.csproj -c Release`):
//   export DATAVERSE_URL=https://<org>.crm6.dynamics.com
//   export DATAVERSE_TOKEN=$(az account get-access-token --resource $DATAVERSE_URL --query accessToken -o tsv)
//   node plugins/WBCodeFYName/scripts/register.mjs --env $DATAVERSE_URL [--config <step-config.json>] [--dry-run]
//
// --env must equal DATAVERSE_URL. It's there so a token for one environment is never used against another by mistake.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = resolve(HERE, "..");
const ASSEMBLY_NAME = "WBCodeFYName";
const TYPE_NAME = "WBCodeFYName.SetPrimaryName";
const SOLUTION = "WBWBCodeFYName";
const PUBLISHER = "WilliamBuck";
const CONFIG_KEYS = ["targetTable", "nameColumn", "wbCodeLookup", "wbCodeValueColumn", "fyLookup", "fyValueColumn"];

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};
const DRY_RUN = process.argv.includes("--dry-run");
const trim = (url) => url?.replace(/\/+$/, "").toLowerCase();

const ORG = trim(process.env.DATAVERSE_URL);
const TOKEN = process.env.DATAVERSE_TOKEN;
if (!ORG || !TOKEN) fail("Set DATAVERSE_URL and DATAVERSE_TOKEN first (see the usage at the top of this script).");
if (trim(arg("env")) !== ORG) fail(`--env must equal DATAVERSE_URL (${ORG}).`);
console.error(`Target environment: ${ORG}${DRY_RUN ? " (dry run: nothing is written)" : ""}`);

const configPath = resolve(arg("config", resolve(PLUGIN, "config/examples/step-config.example.json")));
const configText = readFileSync(configPath, "utf8");
const config = JSON.parse(configText);
const keys = Object.keys(config);
if (CONFIG_KEYS.some((k) => typeof config[k] !== "string" || !config[k]) || keys.length !== CONFIG_KEYS.length) {
  fail(`${configPath} must have exactly these string properties: ${CONFIG_KEYS.join(", ")}`);
}
// The step stores the configuration minified, so the exported XML is one stable line.
const unsecure = JSON.stringify(config);

const assemblyPath = resolve(arg("assembly", resolve(PLUGIN, `${ASSEMBLY_NAME}/bin/Release/net48/${ASSEMBLY_NAME}.dll`)));
const content = readFileSync(assemblyPath).toString("base64");
const fileVersion = readFileSync(resolve(PLUGIN, `${ASSEMBLY_NAME}/${ASSEMBLY_NAME}.csproj`), "utf8").match(/<FileVersion>([^<]+)</)?.[1];

const API = `${ORG}/api/data/v9.2`;
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/json",
  "Content-Type": "application/json; charset=utf-8",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

// `inSolution` adds new components to the solution as they're created. Off only for creating the solution itself.
async function call(method, path, body, { inSolution = true } = {}) {
  if (DRY_RUN && method !== "GET") {
    console.log(`  would ${method} ${path}`);
    return { id: "00000000-0000-0000-0000-000000000000" };
  }
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: { ...headers, ...(inSolution ? { "MSCRM.SolutionUniqueName": SOLUTION } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 800)}`);
  const entityId = res.headers.get("OData-EntityId");
  return { json: text ? JSON.parse(text) : null, id: entityId?.match(/\(([^)]+)\)$/)?.[1] ?? null };
}

async function one(path) {
  const res = await fetch(`${API}/${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${(await res.text()).slice(0, 800)}`);
  return (await res.json()).value?.[0] ?? null;
}

const q = (s) => s.replace(/'/g, "''");

async function ensureSolution() {
  if (await one(`solutions?$select=solutionid&$filter=uniquename eq '${SOLUTION}'`)) return console.log(`solution ${SOLUTION} exists`);
  const publisher = await one(`publishers?$select=publisherid&$filter=uniquename eq '${PUBLISHER}'`);
  if (!publisher) fail(`Publisher ${PUBLISHER} not found. Create it first (ADR-0003).`);
  await call("POST", "solutions", {
    uniquename: SOLUTION, friendlyname: SOLUTION, version: fileVersion ?? "0.1.0.0",
    description: "WBCodeFYName plug-in: sets the WBCodeFY primary name from the WBCode and FY lookups.",
    "publisherid@odata.bind": `/publishers(${publisher.publisherid})`,
  }, { inSolution: false });
  console.log(`created solution ${SOLUTION}`);
}

async function addToSolution(componentId, componentType) {
  // AddSolutionComponent is idempotent, so components that existed before this run end up in the solution too.
  await call("POST", "AddSolutionComponent", {
    ComponentId: componentId, ComponentType: componentType, SolutionUniqueName: SOLUTION,
    AddRequiredComponents: false, DoNotIncludeSubcomponents: false,
  });
}

async function ensureAssembly() {
  const existing = await one(`pluginassemblies?$select=pluginassemblyid,version&$filter=name eq '${ASSEMBLY_NAME}'`);
  if (existing) {
    await call("PATCH", `pluginassemblies(${existing.pluginassemblyid})`, { content });
    console.log(`updated assembly ${ASSEMBLY_NAME} ${existing.version} (file version ${fileVersion})`);
    return existing.pluginassemblyid;
  }
  const { id } = await call("POST", "pluginassemblies", {
    name: ASSEMBLY_NAME, content, isolationmode: 2 /* sandbox */, sourcetype: 0 /* database */,
    description: `WBCodeFYName ${fileVersion}`,
  });
  console.log(`registered assembly ${ASSEMBLY_NAME}`);
  return id;
}

async function ensureType(assemblyId) {
  const existing = await one(`plugintypes?$select=plugintypeid&$filter=typename eq '${TYPE_NAME}' and _pluginassemblyid_value eq ${assemblyId}`);
  if (existing) return console.log(`plug-in type ${TYPE_NAME} exists`), existing.plugintypeid;
  const { id } = await call("POST", "plugintypes", {
    typename: TYPE_NAME, name: TYPE_NAME, friendlyname: TYPE_NAME,
    description: "Sets the WBCodeFY primary name from the WBCode and FY lookups.",
    "pluginassemblyid@odata.bind": `/pluginassemblies(${assemblyId})`,
  });
  console.log(`created plug-in type ${TYPE_NAME}`);
  return id;
}

async function ensureStep(typeId, message, filteringattributes) {
  const sdkMessage = await one(`sdkmessages?$select=sdkmessageid&$filter=name eq '${message}'`);
  const filter = await one(`sdkmessagefilters?$select=sdkmessagefilterid&$filter=primaryobjecttypecode eq '${q(config.targetTable)}' and _sdkmessageid_value eq ${sdkMessage.sdkmessageid}`);
  if (!filter) fail(`No ${message} message filter for table ${config.targetTable}. Is targetTable right, and does the table exist here?`);
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
  const existing = await one(`sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=_eventhandler_value eq ${typeId} and _sdkmessageid_value eq ${sdkMessage.sdkmessageid} and _sdkmessagefilterid_value eq ${filter.sdkmessagefilterid}`);
  if (existing) {
    await call("PATCH", `sdkmessageprocessingsteps(${existing.sdkmessageprocessingstepid})`, settings);
    console.log(`updated step ${settings.name}`);
    return existing.sdkmessageprocessingstepid;
  }
  const { id } = await call("POST", "sdkmessageprocessingsteps", {
    ...settings,
    "eventhandler_plugintype@odata.bind": `/plugintypes(${typeId})`,
    "sdkmessageid@odata.bind": `/sdkmessages(${sdkMessage.sdkmessageid})`,
    "sdkmessagefilterid@odata.bind": `/sdkmessagefilters(${filter.sdkmessagefilterid})`,
  });
  console.log(`created step ${settings.name}`);
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
    await call("PATCH", `sdkmessageprocessingstepimages(${existing.sdkmessageprocessingstepimageid})`, { attributes: settings.attributes });
    return console.log("updated PreImage columns");
  }
  await call("POST", "sdkmessageprocessingstepimages", { ...settings, "sdkmessageprocessingstepid@odata.bind": `/sdkmessageprocessingsteps(${stepId})` });
  console.log("created PreImage");
}

await ensureSolution();
const assemblyId = await ensureAssembly();
const typeId = await ensureType(assemblyId);
const createStep = await ensureStep(typeId, "Create", null);
const updateStep = await ensureStep(typeId, "Update", [config.wbCodeLookup, config.fyLookup, config.nameColumn].join(","));
await ensurePreImage(updateStep);
// Solution component types: 91 plug-in assembly, 92 SDK message processing step.
await addToSolution(assemblyId, 91);
await addToSolution(createStep, 92);
await addToSolution(updateStep, 92);
console.log(`done: ${SOLUTION} holds the assembly and both steps. Next: pac solution sync (see the README).`);
