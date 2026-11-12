// Validates a TextHash step configuration against config/step-config.schema.json before it's registered,
// so a configuration the plug-in would reject (blocking every save on the table) never reaches an environment.
//
// The schema is flat: an object with required string properties, each a $ref to a pattern, and no others. This
// checks exactly those keywords, read from the schema file, so the schema stays the single source of truth. It
// refuses a schema that uses any other keyword rather than skip it, so the schema can't outgrow this check
// unnoticed. (ajv would do this, but it's only a GridFormatter devDependency, and new packages need sign-off.)
import { readFileSync } from "node:fs";

const SUPPORTED_SCHEMA_KEYS = new Set(["$schema", "$id", "title", "description", "type", "additionalProperties", "required", "properties", "$defs"]);
const SUPPORTED_DEF_KEYS = new Set(["type", "pattern", "description"]);

/** Reads and checks the schema; returns { required, properties: { name: { pattern } } }. */
export function loadSchema(path) {
  const schema = JSON.parse(readFileSync(path, "utf8"));
  const unsupported = Object.keys(schema).filter((k) => !SUPPORTED_SCHEMA_KEYS.has(k));
  if (unsupported.length || schema.type !== "object" || schema.additionalProperties !== false) {
    throw new Error(`${path}: step-config.mjs only understands a flat object schema with additionalProperties false (found ${unsupported.join(", ") || "a different shape"})`);
  }
  const properties = {};
  for (const [name, prop] of Object.entries(schema.properties)) {
    const def = prop.$ref ? schema.$defs?.[prop.$ref.replace("#/$defs/", "")] : prop;
    const extra = def && Object.keys(def).filter((k) => !SUPPORTED_DEF_KEYS.has(k));
    if (!def || def.type !== "string" || extra.length) throw new Error(`${path}: property ${name} must be a string with at most a pattern`);
    properties[name] = { pattern: def.pattern ? new RegExp(def.pattern, "u") : null };
  }
  return { required: schema.required ?? [], properties };
}

/** The ways `config` breaks the schema, as messages; empty when it's valid. */
export function validateStepConfig(config, schema) {
  if (typeof config !== "object" || config === null || Array.isArray(config)) return ["the configuration must be a JSON object"];
  const errors = [];
  for (const name of schema.required) if (!(name in config)) errors.push(`${name} is missing`);
  for (const [name, value] of Object.entries(config)) {
    const rule = schema.properties[name];
    if (!rule) errors.push(`${name} isn't a step configuration property`);
    else if (typeof value !== "string") errors.push(`${name} must be a string`);
    else if (rule.pattern && !rule.pattern.test(value)) errors.push(`${name} "${value}" doesn't match ${rule.pattern.source}`);
  }
  return errors;
}
