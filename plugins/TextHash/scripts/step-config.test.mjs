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

test("accepts the example configuration, with or without a scope", () => {
  assert.deepEqual(validateStepConfig(example, schema), []);
  const { scopeLookup, ...unscoped } = example;
  assert.deepEqual(validateStepConfig(unscoped, schema), []);
});

test("reports missing, unknown, non-string, badly named and blank properties", () => {
  const { hashColumn, ...missing } = example;
  assert.deepEqual(validateStepConfig(missing, schema), ["hashColumn is missing"]);
  assert.deepEqual(validateStepConfig({ ...example, extra: "x" }, schema), ["extra isn't a step configuration property"]);
  assert.deepEqual(validateStepConfig({ ...example, scopeLookup: 7 }, schema), ["scopeLookup must be a string"]);
  assert.match(validateStepConfig({ ...example, textColumn: "wbsuper_x " }, schema)[0], /^textColumn "wbsuper_x " doesn't match/);
  assert.match(validateStepConfig({ ...example, targetTable: "" }, schema)[0], /^targetTable "" doesn't match/);
  assert.match(validateStepConfig({ ...example, duplicateMessage: "  " }, schema)[0], /^duplicateMessage "  " doesn't match/);
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
  assert.throws(() => loadSchema(write({ ...base, $defs: { ...base.$defs, message: { type: "string", maxLength: 50 } } })), /must be a string with at most a pattern/);
});
