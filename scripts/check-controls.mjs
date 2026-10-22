#!/usr/bin/env node
// Checks every control under controls/ against the repo conventions (see README.md):
//   - its manifest uses the PCF namespace "Controls" and its solution declares the canonical WB publisher exactly
//   - manifest, package.json and Solution.xml versions agree
// Usage: node scripts/check-controls.mjs [--tag <ControlName>-v<x.y.z>]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// `pac solution init` generates a random option value prefix on every run,
// so every new solution must be edited to match these values.
const NAMESPACE = "Controls";

const PUBLISHER = {
  UniqueName: "WilliamBuck",
  CustomizationPrefix: "wb",
  CustomizationOptionValuePrefix: "94879",
};

const root = fileURLToPath(new URL("..", import.meta.url));
const controlsDir = join(root, "controls");
const errors = [];

const tagArg = process.argv.indexOf("--tag");
const tag = tagArg > -1 ? process.argv[tagArg + 1] : null;
const tagMatch = tag?.match(/^(.+)-v(\d+\.\d+\.\d+)$/);
if (tag && !tagMatch) errors.push(`Tag "${tag}" is not in the form <ControlName>-v<x.y.z>`);

const xmlValue = (xml, element) => xml.match(new RegExp(`<${element}>([^<]*)</${element}>`))?.[1];

const controls = existsSync(controlsDir)
  ? readdirSync(controlsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];

if (tagMatch && !controls.includes(tagMatch[1])) errors.push(`Tag names unknown control "${tagMatch[1]}"`);

for (const name of controls) {
  const dir = join(controlsDir, name);
  const versions = {};

  const manifestPath = join(dir, name, "ControlManifest.Input.xml");
  if (existsSync(manifestPath)) {
    const manifest = readFileSync(manifestPath, "utf8");
    versions.manifest = manifest.match(/<control\b[^>]*\bversion="([^"]+)"/)?.[1];
    const namespace = manifest.match(/<control\b[^>]*\bnamespace="([^"]+)"/)?.[1];
    if (namespace !== NAMESPACE) errors.push(`${name}: manifest namespace is "${namespace}", expected "${NAMESPACE}"`);
  } else {
    errors.push(`${name}: missing ${name}/ControlManifest.Input.xml`);
  }

  // npm workspaces hoist node_modules to the repo root (ADR-0002), which breaks two `pac pcf init` defaults.
  const pcfprojPath = join(dir, `${name}.pcfproj`);
  if (existsSync(pcfprojPath) && !/<PcfEnableAutoNpmInstall>false<\/PcfEnableAutoNpmInstall>/.test(readFileSync(pcfprojPath, "utf8"))) {
    errors.push(`${name}: ${name}.pcfproj must set <PcfEnableAutoNpmInstall>false</PcfEnableAutoNpmInstall>`);
  }
  const tsconfigPath = join(dir, "tsconfig.json");
  if (existsSync(tsconfigPath) && /"(\.\/)?node_modules\//.test(readFileSync(tsconfigPath, "utf8"))) {
    errors.push(`${name}: tsconfig.json must extend "pcf-scripts/tsconfig_base.json" and use "../../node_modules/@types"`);
  }

  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) versions["package.json"] = JSON.parse(readFileSync(pkgPath, "utf8")).version;
  else errors.push(`${name}: missing package.json`);

  const solutionXmlPath = join(dir, "solution", "src", "Other", "Solution.xml");
  if (existsSync(solutionXmlPath)) {
    const xml = readFileSync(solutionXmlPath, "utf8");
    const publisher = xml.match(/<Publisher>[\s\S]*?<\/Publisher>/)?.[0] ?? "";
    for (const [element, expected] of Object.entries(PUBLISHER)) {
      const actual = xmlValue(publisher, element);
      if (actual !== expected) errors.push(`${name}: publisher ${element} is "${actual}", expected "${expected}"`);
    }
    // Solution versions are four-part; the trailing build number must be 0.
    versions["Solution.xml"] = xmlValue(xml.replace(/<Publisher>[\s\S]*?<\/Publisher>/, ""), "Version")?.replace(/\.0$/, "");
  } else {
    errors.push(`${name}: missing solution/src/Other/Solution.xml`);
  }

  const distinct = new Set(Object.values(versions));
  if (distinct.size > 1) {
    errors.push(`${name}: versions disagree (${Object.entries(versions).map(([k, v]) => `${k}=${v}`).join(", ")})`);
  }
  if (tagMatch?.[1] === name && versions.manifest !== tagMatch[2]) {
    errors.push(`${name}: tag version ${tagMatch[2]} does not match manifest version ${versions.manifest}`);
  }
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${controls.length} control(s) match the repo conventions${tag ? ` (tag ${tag})` : ""}`);
