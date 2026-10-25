#!/usr/bin/env node
// Validates GridFormatter config files against config/grid-format.schema.json.
//   - Every config/**/*.json (except the schema) must be valid.
//   - Every tests/fixtures/invalid-config/*.json must be rejected, at the path
//     listed in INVALID_FIXTURES, so the schema can't silently get looser.
// Also checks what JSON Schema can't express: rule ids are unique in a file,
// and dates in conditions are real (no 30 February), as the control checks.
// Exits non-zero on any failure. Run with `npm run validate:config`.
//
// ajv is a devDependency used only here. Control source never imports it, so
// pcf-scripts never bundles it.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const controlDir = fileURLToPath(new URL("..", import.meta.url));
const configDir = join(controlDir, "config");
const schemaPath = join(configDir, "grid-format.schema.json");
const invalidDir = join(controlDir, "tests", "fixtures", "invalid-config");

// Each invalid fixture and the instance path where it must fail.
const INVALID_FIXTURES = {
  "unknown-operator.json": "/rules/0/when/op",
  "wrong-operand-type.json": "/rules/0/when/value",
  "raw-css-style-key.json": "/rules/0/style",
  "unknown-token.json": "/rules/0/style/backgroundColor/token",
  "bad-hex.json": "/rules/0/style/color",
  "value-on-no-operand-operator.json": "/rules/0/when",
  "condition-too-deep.json": "/rules/0/when/all/0/all/0/all/0/all/0",
  "pill-with-row-scope.json": "/rules/0/scope",
  "pill-with-token-fill.json": "/rules/0/style/backgroundColor",
  "duplicate-rule-id.json": "/rules/1/id",
  "impossible-date.json": "/rules/0/when/value",
};

// strictRequired is off because if/then branches name properties defined on the parent schema.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
// VS Code's schema extension; not a validation keyword.
ajv.addVocabulary(["enumDescriptions"]);
const validate = ajv.compile(JSON.parse(readFileSync(schemaPath, "utf8")));

const rel = (path) => relative(controlDir, path);

// The shape of an ISO date or date and time, as engine/validate.ts and engine/dates.ts read it.
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2}))?)?$/;

/** False for text shaped like an ISO date that isn't a real date and time (2026-02-30, T25:00), as the control decides. */
function isRealDate(text) {
  const [, y, mo, d, h = 0, mi = 0, s = 0, zh = 0, zm = 0] = ISO_DATE.exec(text).map((part) => part && Number(part));
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return (
    t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d &&
    t.getUTCHours() === h && t.getUTCMinutes() === mi && t.getUTCSeconds() === s && zh <= 23 && zm <= 59
  );
}

/** Pushes an error for each condition value (or list item) that looks like a date but isn't a real one. */
function checkDates(node, path, errors) {
  if (typeof node !== "object" || node === null) return;
  for (const key of ["all", "any"]) node[key]?.forEach((item, i) => checkDates(item, `${path}/${key}/${i}`, errors));
  if ("not" in node) checkDates(node.not, `${path}/not`, errors);
  for (const value of Array.isArray(node.value) ? node.value : [node.value]) {
    if (typeof value === "string" && ISO_DATE.test(value) && !isRealDate(value)) {
      errors.push({ instancePath: `${path}/value`, message: `${JSON.stringify(value)} isn't a real date or time` });
    }
  }
}

/** Schema errors plus the checks JSON Schema can't express, as { instancePath, message }. */
function check(config) {
  if (!validate(config)) return validate.errors.map(({ instancePath, message }) => ({ instancePath, message }));
  const errors = [];
  const seen = new Set();
  config.rules.forEach((rule, i) => {
    if (seen.has(rule.id)) errors.push({ instancePath: `/rules/${i}/id`, message: `duplicate rule id "${rule.id}"` });
    seen.add(rule.id);
    checkDates(rule.when, `/rules/${i}/when`, errors);
  });
  return errors;
}

function listJson(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

function load(path) {
  try {
    return { config: JSON.parse(readFileSync(path, "utf8")) };
  } catch (e) {
    return { parseError: e instanceof Error ? e.message : String(e) };
  }
}

let failures = 0;
const fail = (message) => {
  failures++;
  console.error(`FAIL ${message}`);
};

for (const path of listJson(configDir).filter((p) => p !== schemaPath)) {
  const { config, parseError } = load(path);
  if (parseError) {
    fail(`${rel(path)}: invalid JSON (${parseError})`);
    continue;
  }
  const errors = check(config);
  if (errors.length === 0) {
    console.log(`ok   ${rel(path)}`);
  } else {
    fail(`${rel(path)}`);
    for (const e of errors) console.error(`       ${e.instancePath || "/"} ${e.message}`);
  }
}

const fixtures = listJson(invalidDir);
for (const path of fixtures) {
  const name = relative(invalidDir, path);
  const expectedPath = INVALID_FIXTURES[name];
  if (!expectedPath) {
    fail(`${rel(path)}: add it to INVALID_FIXTURES with the path where it should fail`);
    continue;
  }
  const { config, parseError } = load(path);
  if (parseError) {
    fail(`${rel(path)}: invalid JSON (${parseError})`);
    continue;
  }
  const errors = check(config);
  const hit = errors.find((e) => e.instancePath === expectedPath);
  if (hit) {
    console.log(`ok   ${rel(path)} rejected: ${expectedPath} ${hit.message}`);
  } else if (errors.length === 0) {
    fail(`${rel(path)}: expected it to be rejected at ${expectedPath}, but it is valid`);
  } else {
    fail(`${rel(path)}: expected an error at ${expectedPath}, got:`);
    for (const e of errors) console.error(`       ${e.instancePath || "/"} ${e.message}`);
  }
}
for (const name of Object.keys(INVALID_FIXTURES)) {
  if (!fixtures.includes(join(invalidDir, name))) fail(`missing invalid fixture ${rel(join(invalidDir, name))}`);
}

if (failures > 0) {
  console.error(`\n${failures} config check(s) failed.`);
  process.exit(1);
}
console.log("\nAll GridFormatter config files are valid.");
