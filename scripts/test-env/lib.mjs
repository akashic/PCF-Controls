// Shared helpers for the Dataverse test-environment scripts (see docs/testing/gridformatter-test-environment.md).
// Every script needs two environment variables:
//   DATAVERSE_URL    the environment, e.g. https://lowcode.crm.dynamics.com (no trailing slash)
//   DATAVERSE_TOKEN  a bearer token for it, e.g. $(az account get-access-token --resource $DATAVERSE_URL --query accessToken -o tsv)
// Only point these scripts at a test environment: they create tables, rows and config. Every script that
// imports this file writes, so importing it refuses to run unless DATAVERSE_URL is in the allow-list:
//   DATAVERSE_TEST_ENVS  comma-separated test environment URLs (default https://lowcode.crm.dynamics.com)
// A script that only reads may skip this file, but must never write.
// The Web API helpers themselves are in ../lib/dataverse.mjs, shared with plug-in registration.
import { dataverseClient } from "../lib/dataverse.mjs";
import { isTestEnvironment, testEnvironments } from "./guard.mjs";

export { arg, label } from "../lib/dataverse.mjs";

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

const client = dataverseClient({ url: ORG, token: TOKEN });

export const API = client.api;
export const ORG_URL = ORG;

/**
 * Calls the Web API and throws with the response body on failure.
 * Pass `solution` to add the MSCRM.SolutionUniqueName header, so new metadata components
 * (tables, columns, views, web resources) land in that unmanaged solution.
 */
export const call = client.call;

/** GET that returns null instead of throwing (e.g. "does this table exist?"). */
export const get = client.get;

/** Publishes the given components so changes reach the app. */
export const publish = client.publish;
