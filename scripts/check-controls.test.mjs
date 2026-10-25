// Tests for scripts/check-controls.mjs. Run with `npm run test:scripts`.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { checkPrefixHardCoding, checkPublisher, findPrefixHardCoding } from "./check-controls.mjs";

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
