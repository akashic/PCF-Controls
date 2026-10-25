// Creates or updates a web resource from a local file and publishes it. Used to deploy GridFormatter
// rules (ADR-0004, ADR-0005) and to swap in broken or empty rules for fail-soft tests.
// Usage: node scripts/test-env/upload-web-resource.mjs <file> [--prefix wb] [--name wb_GridFormatter.wb_gridspike.json] [--solution WBGridSpikeTest]
// The name defaults to <prefix>_GridFormatter.<file name>, e.g. wb_gridspike.json → wb_GridFormatter.wb_gridspike.json.
// The API accepts any publisher's prefix in the name, so --prefix tests a project that isn't on the wb publisher.
// Type is Script (JScript), as Dataverse has no JSON web resource type.
// See docs/testing/gridformatter-test-environment.md.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { arg, call, get, publish } from "./lib.mjs";

const file = process.argv[2];
if (!file || file.startsWith("--")) throw new Error("usage: upload-web-resource.mjs <file> [--prefix …] [--name …] [--solution …]");
const name = arg("name", `${arg("prefix", "wb")}_GridFormatter.${basename(file)}`);
const solution = arg("solution", "WBGridSpikeTest");
const content = readFileSync(file).toString("base64");

const existing = await get(`webresourceset?$select=webresourceid&$filter=name eq '${name}'`);
let id = existing?.value?.[0]?.webresourceid;
if (id) {
  await call("PATCH", `webresourceset(${id})`, { content }, { extraHeaders: { "If-Match": "*" } });
  console.log(`updated ${name}`);
} else {
  ({ id } = await call("POST", "webresourceset", { name, displayname: `GridFormatter rules: ${name}`, webresourcetype: 3, content }, { solution }));
  console.log(`created ${name} in ${solution}`);
}
await publish({ webresources: [id] });
console.log(`published (webresourceid ${id}); hard-reload the grid page to load it`);
