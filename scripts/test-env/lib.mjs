// Shared helpers for the Dataverse test-environment scripts (see docs/testing/gridformatter-test-environment.md).
// Every script needs two environment variables:
//   DATAVERSE_URL    the environment, e.g. https://lowcode.crm.dynamics.com (no trailing slash)
//   DATAVERSE_TOKEN  a bearer token for it, e.g. $(az account get-access-token --resource $DATAVERSE_URL --query accessToken -o tsv)
// Only point these scripts at a test environment: they create tables, rows and config. Every script that
// imports this file writes, so importing it refuses to run unless DATAVERSE_URL is in the allow-list:
//   DATAVERSE_TEST_ENVS  comma-separated test environment URLs (default https://lowcode.crm.dynamics.com)
// A script that only reads may skip this file, but must never write.
import { isTestEnvironment, testEnvironments } from "./guard.mjs";

const ORG = process.env.DATAVERSE_URL?.replace(/\/+$/, "");
const TOKEN = process.env.DATAVERSE_TOKEN;
if (!ORG || !TOKEN) {
  console.error("Set DATAVERSE_URL and DATAVERSE_TOKEN first (see docs/testing/gridformatter-test-environment.md).");
  process.exit(1);
}

const allowed = testEnvironments(process.env.DATAVERSE_TEST_ENVS);
console.error(`Target environment: ${ORG}`);
if (!isTestEnvironment(ORG, allowed)) {
  console.error(
    `Refusing to run: ${ORG} isn't a listed test environment (${allowed.join(", ")}). ` +
      "Add it to DATAVERSE_TEST_ENVS only if it's a test environment (see docs/testing/gridformatter-test-environment.md §2).",
  );
  process.exit(1);
}

export const API = `${ORG}/api/data/v9.2`;
export const ORG_URL = ORG;

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/json",
  "Content-Type": "application/json; charset=utf-8",
  "OData-MaxVersion": "4.0",
  "OData-Version": "4.0",
};

/**
 * Calls the Web API and throws with the response body on failure.
 * Pass `solution` to add the MSCRM.SolutionUniqueName header, so new metadata components
 * (tables, columns, views, web resources) land in that unmanaged solution.
 */
export async function call(method, path, body, { solution, extraHeaders = {} } = {}) {
  const solutionHeader = solution ? { "MSCRM.SolutionUniqueName": solution } : {};
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: { ...headers, ...solutionHeader, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  const entityId = res.headers.get("OData-EntityId");
  return { json: text ? JSON.parse(text) : null, id: entityId?.match(/\(([^)]+)\)$/)?.[1] ?? null };
}

/** GET that returns null instead of throwing (e.g. "does this table exist?"). */
export async function get(path) {
  const res = await fetch(`${API}/${path}`, { headers });
  return res.ok ? res.json() : null;
}

/** Publishes the given components so changes reach the app. */
export async function publish({ entities = [], webresources = [] }) {
  const xml =
    "<importexportxml>" +
    (entities.length ? `<entities>${entities.map((e) => `<entity>${e}</entity>`).join("")}</entities>` : "") +
    (webresources.length ? `<webresources>${webresources.map((w) => `<webresource>{${w}}</webresource>`).join("")}</webresources>` : "") +
    "</importexportxml>";
  await call("POST", "PublishXml", { ParameterXml: xml });
}

/** A Dataverse Label in English (1033). */
export const label = (text) => ({
  "@odata.type": "Microsoft.Dynamics.CRM.Label",
  LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: text, LanguageCode: 1033 }],
});

/** Reads `--name value` style arguments. */
export function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
