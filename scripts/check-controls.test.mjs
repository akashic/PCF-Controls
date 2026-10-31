// Tests for scripts/check-controls.mjs. Run with `npm run test:scripts`.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import {
  checkPlugins,
  checkPrefixHardCoding,
  checkPublisher,
  checkRepo,
  csharpStringLiterals,
  findLogicalNameHardCoding,
  findPrefixHardCoding,
} from "./check-controls.mjs";

const lines = (code, fileName) => findPrefixHardCoding(code, fileName).map((hit) => hit.line);

describe("findPrefixHardCoding", () => {
  test("flags wb_ in code and string literals", () => {
    assert.deepEqual(lines('const name = "wb_GridFormatter.account.json";'), [1]);
    assert.deepEqual(lines("const name = 'x';\nconst wb_table = name;"), [2]);
  });

  test("is case-insensitive", () => {
    assert.deepEqual(lines('const a = "WB_x";\nconst b = "Wb[_]x";'), [1, 2]);
  });

  test("flags wb[_] as written in a Dataverse filter", () => {
    assert.deepEqual(lines("const filter = \"endswith(name,'wb[_]GridFormatter.x.json')\";"), [1]);
  });

  test("doesn't flag [_] without the wb prefix, or wb inside a longer word", () => {
    assert.deepEqual(lines("const filter = \"endswith(name,'[_]GridFormatter.x.json')\";\nconst lc_wb_x = 1;"), []);
  });

  test("// and /* */ inside a string are not comments", () => {
    assert.deepEqual(lines('const a = "// wb_x";\nconst b = \'/* wb_x */\';'), [1, 2]);
  });

  test("template literals are checked, including text after a ${} expression", () => {
    assert.deepEqual(lines("const a = `wb_${table}`;"), [1]);
    assert.deepEqual(lines("const a = `${x} // wb_x`;"), [1]);
    assert.deepEqual(lines("const a = `${`inner ${y}`} /* wb_x */`;"), [1]);
  });

  test("regex literals and JSX text are checked", () => {
    assert.deepEqual(lines("const re = /^wb_/;"), [1]);
    assert.deepEqual(lines("const el = <div>// wb_x</div>;", "View.tsx"), [1]);
  });

  test("comments may mention wb_", () => {
    const code = [
      "// wb_ line comment",
      "/* wb_ block comment */",
      "/**",
      " * JSDoc mentioning `wb_duedate`.",
      " */",
      "export const ok = a / b; // wb_ trailing comment",
      "const t = `${ /* wb_ inside an expression */ ok }`;",
      "const el = <div>{/* wb_ JSX comment */}</div>;",
      "// wb_ at end of file",
    ].join("\n");
    assert.deepEqual(lines(code, "View.tsx"), []);
  });

  test("reports the right line after a multi-line comment", () => {
    assert.deepEqual(lines('/*\n wb_\n*/\nconst a = "wb_x";'), [4]);
  });

  test("checks .js and .mjs files", () => {
    assert.deepEqual(lines('module.exports = { name: "wb_x" }; // wb_ ok', "helper.js"), [1]);
    assert.deepEqual(lines('export const name = "wb_x";', "helper.mjs"), [1]);
  });
});

describe("checkPrefixHardCoding", () => {
  const root = mkdtempSync(join(tmpdir(), "check-controls-"));
  after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };

  write("controls/Demo/Demo/index.ts", '// wb_ in a comment is fine\nexport const ok = "x";\n');
  write("controls/Demo/Demo/legacy/helper.js", 'export const name = "wb_x";\n');
  write("controls/Demo/Demo/generated/ManifestTypes.d.ts", 'export const skipped = "wb_x";\n');
  write("controls/Demo/Demo/ControlManifest.Input.xml", '<control namespace="Controls" constructor="wb_x" />\n');
  write("controls/Demo/tests/demo.test.ts", 'const fixture = "wb_x";\n');
  write("packages/shared/src/util.ts", 'export const name = `wb[_]x`;\n');
  write("packages/shared/tests/util.test.ts", 'const fixture = "wb_x";\n');

  const errors = checkPrefixHardCoding(root);

  test("flags a .js file in a control's source folder", () => {
    assert.ok(errors.some((e) => e.startsWith("Demo: controls/Demo/Demo/legacy/helper.js:1 ")));
  });

  test("flags packages/*/src", () => {
    assert.ok(errors.some((e) => e.startsWith("packages/shared: packages/shared/src/util.ts:1 ")));
  });

  test("skips generated/, tests, non-source files and comments", () => {
    assert.equal(errors.length, 2, errors.join("\n"));
  });
});

describe("checkPublisher", () => {
  const solutionXml = (description) => `<ImportExportXml><SolutionManifest>
    <Descriptions />
    <Publisher>
      <UniqueName>WilliamBuck</UniqueName>
      <Descriptions>
        <Description description="${description}" languagecode="1033" />
      </Descriptions>
      <CustomizationPrefix>wb</CustomizationPrefix>
      <CustomizationOptionValuePrefix>94879</CustomizationOptionValuePrefix>
    </Publisher>
  </SolutionManifest></ImportExportXml>`;

  test("accepts the canonical publisher", () => {
    assert.deepEqual(checkPublisher(solutionXml("William Buck"), "Demo"), []);
  });

  test("rejects any other publisher description", () => {
    assert.deepEqual(checkPublisher(solutionXml("William Buck. Publisher for WB PCF controls."), "Demo"), [
      'Demo: publisher description (1033) is "William Buck. Publisher for WB PCF controls.", expected "William Buck"',
    ]);
  });

  test("rejects a missing publisher description", () => {
    const xml = solutionXml("William Buck").replace(/<Descriptions>[\s\S]*?<\/Descriptions>/, "<Descriptions />");
    assert.equal(checkPublisher(xml, "Demo").length, 1);
  });

  test("rejects a random option value prefix", () => {
    const xml = solutionXml("William Buck").replace("94879", "12345");
    assert.deepEqual(checkPublisher(xml, "Demo"), ['Demo: publisher CustomizationOptionValuePrefix is "12345", expected "94879"']);
  });
});

describe("csharpStringLiterals", () => {
  const texts = (code) => csharpStringLiterals(code).map((l) => l.text);

  test("finds regular, verbatim and interpolated strings", () => {
    assert.deepEqual(texts('var a = "x"; var b = @"c:\\dir"; var c = $"n={n}"; var d = $@"p{x}"; var e = @$"q";'), [
      "x",
      "c:\\dir",
      "n={n}",
      "p{x}",
      "q",
    ]);
  });

  test("handles escapes, doubled quotes in verbatim strings and char literals", () => {
    assert.deepEqual(texts('var a = "say \\"hi\\""; var b = @"say ""hi"""; var q = \'"\'; var s = \'\\\'\'; var c = "after";'), [
      'say \\"hi\\"',
      'say "hi"',
      "after",
    ]);
  });

  test("ignores comments, including quotes inside them", () => {
    assert.deepEqual(texts('// "abc_x"\n/* "abc_y"\n */ var a = "z"; // it\'s'), ["z"]);
  });

  test("reports the line of the opening quote", () => {
    const literals = csharpStringLiterals('/*\n*/\nvar a =\n  @"one\ntwo";');
    assert.deepEqual(literals, [{ line: 4, text: "one\ntwo" }]);
  });
});

describe("findLogicalNameHardCoding", () => {
  const hits = (code) => findLogicalNameHardCoding(code).map((l) => l.text);

  test("flags custom logical and schema names under any prefix", () => {
    assert.deepEqual(hits('const string A = "wbsuper_wbcode"; var b = "abc_Project"; var c = $"{x}.cr8a2_fy";'), [
      "wbsuper_wbcode",
      "abc_Project",
      "{x}.cr8a2_fy",
    ]);
  });

  test("doesn't flag system names, plain text or names only in comments and identifiers", () => {
    const code = [
      "// wbsuper_wbcode comes from the step configuration",
      'var a = "statecode"; var b = "PreImage"; var c = "WBCode must end in 70";',
      "var wbsuper_x = config.NameColumn; var d = \"_leading\"; var e = \"trailing_\";",
    ].join("\n");
    assert.deepEqual(hits(code), []);
  });
});

describe("checkPlugins", () => {
  const root = mkdtempSync(join(tmpdir(), "check-plugins-"));
  after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const csproj = ({ sign = true, assemblyVersion = "1.0.0.0", fileVersion = "0.1.0.0" } = {}) =>
    `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><SignAssembly>${sign}</SignAssembly>` +
    `<AssemblyVersion>${assemblyVersion}</AssemblyVersion><FileVersion>${fileVersion}</FileVersion></PropertyGroup></Project>`;
  const solutionXml = (version) => `<ImportExportXml><SolutionManifest><Version>${version}</Version><Publisher>
      <UniqueName>WilliamBuck</UniqueName>
      <Descriptions><Description description="William Buck" languagecode="1033" /></Descriptions>
      <CustomizationPrefix>wb</CustomizationPrefix>
      <CustomizationOptionValuePrefix>94879</CustomizationOptionValuePrefix>
    </Publisher></SolutionManifest></ImportExportXml>`;

  // Good: everything in place, including the solution.
  write("plugins/Good/Good/Good.csproj", csproj());
  write("plugins/Good/Good/SetName.cs", '// abc_name in a comment is fine\nclass SetName { string m = "WBCode must end in 70"; }\n');
  write("plugins/Good/Good/obj/Generated.cs", 'class G { string s = "abc_skipped"; }\n');
  write("plugins/Good/tests/Good.Tests.csproj", "<Project />");
  write("plugins/Good/tests/Fixtures.cs", 'class F { string s = "abc_fixture"; }\n');
  write("plugins/Good/solution/src/Other/Solution.xml", solutionXml("0.1.0.0"));
  // Bad: unsigned, wrong AssemblyVersion, versions disagree, no tests, a hard-coded name.
  write("plugins/Bad/Bad/Bad.csproj", csproj({ sign: false, assemblyVersion: "0.2.0.0", fileVersion: "0.2.0.0" }));
  write("plugins/Bad/Bad/SetName.cs", 'class SetName {\n  const string Lookup = "abc_wbcode";\n}\n');
  write("plugins/Bad/solution/src/Other/Solution.xml", solutionXml("0.1.0.0"));
  // Early: no solution yet, which is allowed until the registration is synced.
  write("plugins/Early/Early/Early.csproj", csproj());
  write("plugins/Early/tests/Early.Tests.csproj", "<Project />");
  // Unscaffolded: only the requirements file.
  write("plugins/Later/requirements.md", "# Later\n");

  const { errors, warnings, plugins } = checkPlugins(root);
  const errorsFor = (name) => errors.filter((e) => e.startsWith(`${name}: `));

  test("passes a complete plug-in, ignoring comments, obj/ and tests/", () => {
    assert.deepEqual(errorsFor("Good"), []);
  });

  test("allows a plug-in whose solution doesn't exist yet", () => {
    assert.deepEqual(errorsFor("Early"), []);
  });

  test("flags signing, AssemblyVersion, version mismatch, missing tests and hard-coded names", () => {
    const bad = errorsFor("Bad");
    assert.equal(bad.length, 5, bad.join("\n"));
    assert.ok(bad.some((e) => e.includes("<SignAssembly>true</SignAssembly>")));
    assert.ok(bad.some((e) => e.includes('AssemblyVersion is "0.2.0.0"')));
    assert.ok(bad.some((e) => e.includes("versions disagree (FileVersion=0.2.0, Solution.xml=0.1.0)")));
    assert.ok(bad.some((e) => e.includes("missing a test project")));
    assert.ok(bad.some((e) => e.startsWith("Bad: plugins/Bad/Bad/SetName.cs:2 hard-codes a logical name")));
  });

  test("warns about, but doesn't check, a folder that isn't scaffolded", () => {
    assert.deepEqual(errorsFor("Later"), []);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].startsWith("Later: "));
    assert.deepEqual(plugins.sort(), ["Bad", "Early", "Good"]);
  });

  test("checks a release tag against FileVersion and needs a solution", () => {
    assert.deepEqual(checkPlugins(root, "Good-v0.1.0").errors.filter((e) => e.startsWith("Good: ")), []);
    assert.ok(checkPlugins(root, "Good-v0.2.0").errors.includes("Good: tag version 0.2.0 does not match FileVersion 0.1.0"));
    assert.ok(checkPlugins(root, "Early-v0.1.0").errors.includes("Early: can't release without solution/src/Other/Solution.xml"));
    assert.ok(checkPlugins(root, "Later-v0.1.0").errors.includes("Later: can't release a plug-in that hasn't been scaffolded"));
  });

  test("rejects a folder name that isn't a C# identifier", () => {
    write("plugins/Bad-Name/Bad-Name/Bad-Name.csproj", csproj());
    write("plugins/Bad-Name/tests/T.csproj", "<Project />");
    assert.ok(checkPlugins(root).errors.some((e) => e.startsWith("Bad-Name: the folder name must be a valid C# identifier")));
    rmSync(join(root, "plugins/Bad-Name"), { recursive: true });
  });
});

describe("checkRepo", () => {
  const root = mkdtempSync(join(tmpdir(), "check-repo-"));
  after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "plugins", "Later"), { recursive: true });

  test("accepts a tag for a plug-in folder and rejects an unknown name", () => {
    assert.ok(!checkRepo(root, "Later-v0.1.0").errors.some((e) => e.startsWith("Tag names unknown")));
    assert.ok(checkRepo(root, "Missing-v0.1.0").errors.includes('Tag names unknown control or plug-in "Missing"'));
  });
});
