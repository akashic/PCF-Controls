#!/usr/bin/env node
// Checks every control under controls/ against the repo conventions (see README.md):
//   - its manifest uses the PCF namespace "Controls" and its solution declares the canonical WB publisher exactly
//   - manifest, package.json and Solution.xml versions agree
//   - manifest *-key attributes have no apostrophes (Dataverse rejects them on import)
//   - runtime source (controls/<X>/<X>/ and packages/*/src/) doesn't hard-code the wb_ prefix outside comments (ADR-0005)
// and every plug-in under plugins/ (ADR-0006):
//   - plugins/<X>/<X>/<X>.csproj signs the assembly, keeps AssemblyVersion at 1.0.0.0 and has a test project
//   - FileVersion and Solution.xml versions agree, and the solution (once it exists) declares the canonical publisher
//   - C# string literals in plugins/<X>/<X>/ contain no custom logical names (<prefix>_<name>); they come from step configuration
// Usage: node scripts/check-controls.mjs [--tag <Name>-v<x.y.z>]   (a control or a plug-in name)
// Tests: npm run test:scripts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// `pac solution init` generates a random option value prefix on every run,
// so every new solution must be edited to match these values.
const NAMESPACE = "Controls";

const PUBLISHER = {
  UniqueName: "WilliamBuck",
  CustomizationPrefix: "wb",
  CustomizationOptionValuePrefix: "94879",
};
const PUBLISHER_DESCRIPTION = "William Buck";

const SOURCE_FILE = /\.(tsx?|jsx?|mjs)$/;
// `wb_`, or `wb[_]` as written in a Dataverse `like`/`endswith` filter, in any case.
const PREFIX = /\bwb(_|\[_\])/i;

const xmlValue = (xml, element) => xml.match(new RegExp(`<${element}>([^<]*)</${element}>`))?.[1];

/**
 * Returns the comment ranges in a TypeScript/JavaScript file, found with the TypeScript parser so that
 * `//` or `/*` inside a string, template literal, regex or JSX text isn't mistaken for a comment.
 */
function commentRanges(code, fileName) {
  const kind = /\.[jt]sx$/.test(fileName) ? ts.ScriptKind.TSX : /\.m?js$/.test(fileName) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind);
  const ranges = [];
  const visit = (node) => {
    // JSDoc nodes hold comment text; the comment itself is picked up as trivia of the next token.
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    const children = node.getChildren(source);
    if (children.length) {
      children.forEach(visit);
      return;
    }
    // A leaf token: comments can only sit in the trivia before it (EndOfFileToken holds the last ones).
    // TypeScript splits that trivia at the first line break: "trailing" comments (of the previous token)
    // come before it and "leading" ones after, so both are needed.
    const start = node.getStart(source);
    const trivia = [...(ts.getTrailingCommentRanges(code, node.pos) ?? []), ...(ts.getLeadingCommentRanges(code, node.pos) ?? [])];
    for (const range of trivia) {
      if (range.end <= start) ranges.push(range);
    }
  };
  visit(source);
  return ranges;
}

/**
 * Finds `wb_` / `wb[_]` (any case) outside comments, in string literals, template literals and code.
 * Returns one `{ line, text }` per offending line (line numbers are 1-based).
 */
export function findPrefixHardCoding(code, fileName = "file.ts") {
  let stripped = code;
  for (const { pos, end } of commentRanges(code, fileName)) {
    // Keep newlines so line numbers still match the original file.
    stripped = stripped.slice(0, pos) + stripped.slice(pos, end).replace(/[^\n]/g, " ") + stripped.slice(end);
  }
  const lines = code.split("\n");
  return stripped
    .split("\n")
    .flatMap((text, i) => (PREFIX.test(text) ? [{ line: i + 1, text: lines[i].trim() }] : []));
}

/** Runtime source directories: each control's `controls/<X>/<X>/` and each package's `src/`. */
function sourceDirs(root) {
  const dirs = [];
  const subdirs = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []);
  for (const name of subdirs(join(root, "controls"))) dirs.push({ owner: name, dir: join(root, "controls", name, name) });
  for (const name of subdirs(join(root, "packages"))) dirs.push({ owner: `packages/${name}`, dir: join(root, "packages", name, "src") });
  return dirs.filter(({ dir }) => existsSync(dir));
}

/** A control can't know the publisher prefix of the project that uses it (ADR-0005). */
export function checkPrefixHardCoding(root) {
  const errors = [];
  for (const { owner, dir } of sourceDirs(root)) {
    for (const file of readdirSync(dir, { recursive: true })) {
      const parts = file.split(/[\\/]/);
      if (!SOURCE_FILE.test(file) || parts.includes("generated") || parts.includes("node_modules")) continue;
      const path = join(dir, file);
      for (const { line, text } of findPrefixHardCoding(readFileSync(path, "utf8"), file)) {
        errors.push(`${owner}: ${relative(root, path)}:${line} hard-codes the wb_ prefix (${text}); find project components under any prefix (ADR-0005)`);
      }
    }
  }
  return errors;
}

/** Checks the publisher block of a Solution.xml against the canonical WB publisher (ADR-0003). */
export function checkPublisher(xml, name) {
  const errors = [];
  const publisher = xml.match(/<Publisher>[\s\S]*?<\/Publisher>/)?.[0] ?? "";
  for (const [element, expected] of Object.entries(PUBLISHER)) {
    const actual = xmlValue(publisher, element);
    if (actual !== expected) errors.push(`${name}: publisher ${element} is "${actual}", expected "${expected}"`);
  }
  const descriptions = [...publisher.matchAll(/<Description\b[^>]*>/g)].map(([tag]) => ({
    description: tag.match(/\bdescription="([^"]*)"/)?.[1],
    languagecode: tag.match(/\blanguagecode="([^"]*)"/)?.[1],
  }));
  const english = descriptions.find((d) => d.languagecode === "1033");
  if (english?.description !== PUBLISHER_DESCRIPTION) {
    errors.push(`${name}: publisher description (1033) is "${english?.description}", expected "${PUBLISHER_DESCRIPTION}"`);
  }
  return errors;
}

export function checkControls(root, tag = null) {
  const controlsDir = join(root, "controls");
  const errors = [];

  const tagMatch = tag?.match(/^(.+)-v(\d+\.\d+\.\d+)$/);
  if (tag && !tagMatch) errors.push(`Tag "${tag}" is not in the form <ControlName>-v<x.y.z>`);

  const controls = existsSync(controlsDir)
    ? readdirSync(controlsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  for (const name of controls) {
    const dir = join(controlsDir, name);
    const versions = {};

    const manifestPath = join(dir, name, "ControlManifest.Input.xml");
    if (existsSync(manifestPath)) {
      const manifest = readFileSync(manifestPath, "utf8");
      versions.manifest = manifest.match(/<control\b[^>]*\bversion="([^"]+)"/)?.[1];
      const namespace = manifest.match(/<control\b[^>]*\bnamespace="([^"]+)"/)?.[1];
      if (namespace !== NAMESPACE) errors.push(`${name}: manifest namespace is "${namespace}", expected "${NAMESPACE}"`);
      // Solution import validates display-name-key, description-key etc. against `noAposStringType`.
      for (const [, attr, value] of manifest.matchAll(/\b([\w-]+-key)="([^"]*)"/g)) {
        if (/'|&apos;/.test(value)) errors.push(`${name}: manifest ${attr}="${value}" contains an apostrophe, which fails solution import`);
      }
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
      errors.push(...checkPublisher(xml, name));
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

  errors.push(...checkPrefixHardCoding(root));
  return { errors, controls };
}

// A Dataverse custom logical or schema name: a publisher prefix (a letter, then 1-7 letters or digits), "_", then the name.
const LOGICAL_NAME = /\b[a-z][a-z0-9]{1,7}_[a-z0-9_]*[a-z0-9]/i;

/**
 * Returns the string literals in a C# file as `{ line, text }` (line numbers are 1-based, at the opening quote).
 * Handles `//` and `/* *\/` comments, regular, verbatim (`@"..."`) and interpolated (`$"..."`, `$@"..."`) strings,
 * and char literals such as `'"'`. An interpolated string's `{...}` holes are returned as part of its text.
 * Raw string literals (`"""`, C# 11) aren't handled: plug-ins target .NET Framework (net48), whose default language version is C# 7.3.
 */
export function csharpStringLiterals(code) {
  const literals = [];
  let line = 1;
  let i = 0;
  const advance = (to) => {
    for (; i < to; i++) if (code[i] === "\n") line++;
  };
  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];
    if (c === "/" && next === "/") {
      const end = code.indexOf("\n", i);
      advance(end === -1 ? code.length : end);
    } else if (c === "/" && next === "*") {
      const end = code.indexOf("*/", i + 2);
      advance(end === -1 ? code.length : end + 2);
    } else if (c === "'") {
      // A char literal: '"', '\'', '\\' or 'x'.
      const end = code.indexOf("'", code[i + 1] === "\\" ? i + 3 : i + 2);
      advance(end === -1 ? code.length : end + 1);
    } else if (c === '"' || ((c === "@" || c === "$") && (next === '"' || ((next === "@" || next === "$") && code[i + 2] === '"')))) {
      const prefix = c === '"' ? "" : next === '"' ? c : c + next;
      const verbatim = prefix.includes("@");
      const startLine = line;
      let j = i + prefix.length + 1;
      let text = "";
      while (j < code.length) {
        if (verbatim && code[j] === '"' && code[j + 1] === '"') {
          text += '"';
          j += 2;
        } else if (!verbatim && code[j] === "\\") {
          text += code.slice(j, j + 2);
          j += 2;
        } else if (code[j] === '"' || (!verbatim && code[j] === "\n")) {
          break;
        } else {
          text += code[j++];
        }
      }
      literals.push({ line: startLine, text });
      advance(Math.min(j + 1, code.length));
    } else {
      advance(i + 1);
    }
  }
  return literals;
}

/** Finds C# string literals that contain a custom logical name such as `abc_wbcode` (ADR-0005, ADR-0006). */
export function findLogicalNameHardCoding(code) {
  return csharpStringLiterals(code).filter(({ text }) => LOGICAL_NAME.test(text));
}

const csFiles = (dir) =>
  readdirSync(dir, { recursive: true }).filter((file) => {
    const parts = file.split(/[\\/]/);
    return file.endsWith(".cs") && !parts.includes("bin") && !parts.includes("obj");
  });

const readdirOrEmpty = (dir) =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];

/** Checks every plug-in under plugins/ (ADR-0006). A folder without its project yet only gets a warning. */
export function checkPlugins(root, tag = null) {
  const pluginsDir = join(root, "plugins");
  const errors = [];
  const warnings = [];
  const tagMatch = tag?.match(/^(.+)-v(\d+\.\d+\.\d+)$/);
  const folders = readdirOrEmpty(pluginsDir);
  const plugins = [];

  for (const name of folders) {
    const dir = join(pluginsDir, name);
    const projectDir = join(dir, name);
    const csprojPath = join(projectDir, `${name}.csproj`);
    if (!existsSync(csprojPath)) {
      warnings.push(`${name}: no ${name}/${name}.csproj yet, so it isn't checked until the plug-in is scaffolded`);
      if (tagMatch?.[1] === name) errors.push(`${name}: can't release a plug-in that hasn't been scaffolded`);
      continue;
    }
    plugins.push(name);

    // `pac plugin init` uses the folder name as the C# namespace.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) errors.push(`${name}: the folder name must be a valid C# identifier (it becomes the namespace)`);

    const csproj = readFileSync(csprojPath, "utf8");
    if (!/<SignAssembly>true<\/SignAssembly>/.test(csproj)) {
      errors.push(`${name}: ${name}.csproj must set <SignAssembly>true</SignAssembly> (classic plug-in assemblies must be strong-name signed)`);
    }
    const assemblyVersion = xmlValue(csproj, "AssemblyVersion");
    if (assemblyVersion !== "1.0.0.0") {
      errors.push(`${name}: AssemblyVersion is "${assemblyVersion}", expected "1.0.0.0" (changing it re-registers the assembly; version with FileVersion)`);
    }
    const fileVersion = xmlValue(csproj, "FileVersion");
    const versions = {};
    if (/^\d+\.\d+\.\d+\.0$/.test(fileVersion ?? "")) versions.FileVersion = fileVersion.replace(/\.0$/, "");
    else errors.push(`${name}: FileVersion is "${fileVersion}", expected <x.y.z>.0`);

    const tests = join(dir, "tests");
    if (!existsSync(tests) || !readdirSync(tests).some((f) => f.endsWith(".csproj"))) {
      errors.push(`${name}: missing a test project in tests/`);
    }

    // The solution builds only once the registration has been synced into source (ADR-0006), so it may come later.
    const solutionXmlPath = join(dir, "solution", "src", "Other", "Solution.xml");
    if (existsSync(solutionXmlPath)) {
      const xml = readFileSync(solutionXmlPath, "utf8");
      errors.push(...checkPublisher(xml, name));
      versions["Solution.xml"] = xmlValue(xml.replace(/<Publisher>[\s\S]*?<\/Publisher>/, ""), "Version")?.replace(/\.0$/, "");
    } else if (tagMatch?.[1] === name) {
      errors.push(`${name}: can't release without solution/src/Other/Solution.xml`);
    }

    const distinct = new Set(Object.values(versions));
    if (distinct.size > 1) {
      errors.push(`${name}: versions disagree (${Object.entries(versions).map(([k, v]) => `${k}=${v}`).join(", ")})`);
    }
    if (tagMatch?.[1] === name && versions.FileVersion !== tagMatch[2]) {
      errors.push(`${name}: tag version ${tagMatch[2]} does not match FileVersion ${versions.FileVersion}`);
    }

    for (const file of csFiles(projectDir)) {
      const path = join(projectDir, file);
      for (const { line, text } of findLogicalNameHardCoding(readFileSync(path, "utf8"))) {
        errors.push(`${name}: ${relative(root, path)}:${line} hard-codes a logical name ("${text}"); read it from the step configuration (ADR-0006)`);
      }
    }
  }
  return { errors, warnings, plugins };
}

/** Runs every check. A tag must name a known control or plug-in. */
export function checkRepo(root, tag = null) {
  const controlResult = checkControls(root, tag);
  const pluginResult = checkPlugins(root, tag);
  const errors = [...controlResult.errors, ...pluginResult.errors];
  const tagName = tag?.match(/^(.+)-v\d+\.\d+\.\d+$/)?.[1];
  const known = [...controlResult.controls, ...readdirOrEmpty(join(root, "plugins"))];
  if (tagName && !known.includes(tagName)) errors.push(`Tag names unknown control or plug-in "${tagName}"`);
  return { errors, warnings: pluginResult.warnings, controls: controlResult.controls, plugins: pluginResult.plugins };
}

// Run only when executed directly (the tests import the functions above).
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const tagArg = process.argv.indexOf("--tag");
  const tag = tagArg > -1 ? process.argv[tagArg + 1] : null;
  const { errors, warnings, controls, plugins } = checkRepo(fileURLToPath(new URL("..", import.meta.url)), tag);
  if (warnings.length) console.warn(warnings.map((w) => `! ${w}`).join("\n"));
  if (errors.length) {
    console.error(errors.map((e) => `✗ ${e}`).join("\n"));
    process.exit(1);
  }
  console.log(`✓ ${controls.length} control(s) and ${plugins.length} plug-in(s) match the repo conventions${tag ? ` (tag ${tag})` : ""}`);
}
