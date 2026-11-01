import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadSchema, validateStepConfig } from "./step-config.mjs";

const configDir = fileURLToPath(new URL("../config/", import.meta.url));
const schema = loadSchema(join(configDir, "step-config.schema.json"));
const example = JSON.parse(readFileSync(join(configDir, "examples/step-config.example.json"), "utf8"));

test("accepts the example configuration", () => {
  assert.deepEqual(validateStepConfig(example, schema), []);
});

test("reports missing, unknown, non-string and badly named properties", () => {
  const { fyValueColumn, ...missing } = example;
  assert.deepEqual(validateStepConfig(missing, schema), ["fyValueColumn is missing"]);
  assert.deepEqual(validateStepConfig({ ...example, extra: "x" }, schema), ["extra isn't a step configuration property"]);
  assert.deepEqual(validateStepConfig({ ...example, fyLookup: 7 }, schema), ["fyLookup must be a string"]);
  assert.match(validateStepConfig({ ...example, fyLookup: "wbsuper_fy " }, schema)[0], /^fyLookup "wbsuper_fy " isn't a logical name/);
  assert.match(validateStepConfig({ ...example, targetTable: "" }, schema)[0], /^targetTable "" isn't a logical name/);
});

test("rejects a configuration that isn't an object", () => {
  for (const value of [null, [], "x", 1]) assert.deepEqual(validateStepConfig(value, schema), ["the configuration must be a JSON object"]);
});

test("refuses a schema with keywords it doesn't check", () => {
  const dir = mkdtempSync(join(tmpdir(), "step-config-"));
  const write = (s) => {
    const path = join(dir, "schema.json");
    writeFileSync(path, JSON.stringify(s));
    return path;
  };
  const base = JSON.parse(readFileSync(join(configDir, "step-config.schema.json"), "utf8"));
  assert.throws(() => loadSchema(write({ ...base, oneOf: [] })), /only understands a flat object schema/);
  assert.throws(() => loadSchema(write({ ...base, additionalProperties: true })), /only understands a flat object schema/);
  assert.throws(() => loadSchema(write({ ...base, $defs: { logicalName: { type: "string", maxLength: 50 } } })), /must be a string with at most a pattern/);
});
