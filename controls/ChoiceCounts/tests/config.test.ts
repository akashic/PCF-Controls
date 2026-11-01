import { normalizeRecordId, parseConfig, parseOptionColors, parseOptionValues, MAX_FILTER_LENGTH } from "../ChoiceCounts/logic/config";

const valid = { tableName: "abc_task", groupColumn: "abc_ragstatus" };

describe("parseConfig", () => {
  test("accepts the minimum and defaults the rest", () => {
    expect(parseConfig(valid)).toEqual({
      ok: true,
      config: {
        tableName: "abc_task",
        groupColumn: "abc_ragstatus",
        relationshipColumn: null,
        filter: [],
        optionValues: null,
        optionColors: new Map(),
        neutralZeroCounts: true,
      },
      warnings: [],
    });
  });

  test("trims every input and treats blanks as unset", () => {
    const result = parseConfig({ tableName: " abc_task ", groupColumn: "statuscode\n", relationshipColumn: "  ", filterXml: " ", optionValues: "" });
    expect(result).toMatchObject({ ok: true, config: { tableName: "abc_task", groupColumn: "statuscode", relationshipColumn: null, filter: [] } });
  });

  test("reads every optional input", () => {
    const result = parseConfig({
      ...valid,
      relationshipColumn: "abc_smsf",
      filterXml: '<condition attribute="statecode" operator="eq" value="0" />',
      optionValues: "1, 2",
    });
    expect(result).toMatchObject({
      ok: true,
      config: { relationshipColumn: "abc_smsf", optionValues: [1, 2], filter: [{ name: "condition" }] },
      warnings: [],
    });
  });

  test("passes optionValues warnings through without failing", () => {
    expect(parseConfig({ ...valid, optionValues: "1, red" })).toMatchObject({
      ok: true,
      config: { optionValues: [1] },
      warnings: ['Options to show: "red" isn\'t an option value, so it\'s skipped'],
    });
  });

  test("requires the table and the group column", () => {
    expect(parseConfig({})).toEqual({ ok: false, errors: ["Table to count is required", "Group by column is required"] });
    expect(parseConfig({ tableName: null, groupColumn: undefined })).toEqual({
      ok: false,
      errors: ["Table to count is required", "Group by column is required"],
    });
  });

  test.each([
    ["tableName", "abc task", 'Table to count "abc task" isn\'t a logical name'],
    ["groupColumn", "1status", 'Group by column "1status" isn\'t a logical name'],
    ["relationshipColumn", "abc_smsf'] or 1=1", 'Relationship column "abc_smsf\'] or 1=1" isn\'t a logical name'],
  ])("rejects a %s that isn't a logical name", (key, value, error) => {
    expect(parseConfig({ ...valid, [key]: value })).toEqual({ ok: false, errors: [error] });
  });

  test("rejects the whole configuration when the filter is rejected", () => {
    expect(parseConfig({ ...valid, filterXml: "<fetch />" })).toEqual({
      ok: false,
      errors: ["Filter (FetchXML): <fetch> isn't allowed here; use <condition>, <filter>, <link-entity>"],
    });
  });

  test("reports every error at once", () => {
    const result = parseConfig({ tableName: "a b", groupColumn: "c d", relationshipColumn: "e f", filterXml: "x" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toHaveLength(4);
  });
});

describe("parseOptionValues", () => {
  test.each([null, undefined, "", "   "])("blank (%p) means every option", (raw) => {
    expect(parseOptionValues(raw)).toEqual({ values: null, warnings: [] });
  });

  test("keeps the maker's order, including negative values", () => {
    expect(parseOptionValues("3,1, 2 ,-1")).toEqual({ values: [3, 1, 2, -1], warnings: [] });
  });

  test("skips repeats with a warning", () => {
    expect(parseOptionValues("1,2,1")).toEqual({ values: [1, 2], warnings: ["Options to show: 1 is listed more than once"] });
  });

  test.each([
    ["1.5", '"1.5"'],
    ["Red", '"Red"'],
    ["1e3", '"1e3"'],
    ["99999999999999999999", '"99999999999999999999"'],
    ["", '""'],
  ])("skips %p with a warning", (entry, quoted) => {
    expect(parseOptionValues(`1,${entry}`)).toEqual({ values: [1], warnings: [`Options to show: ${quoted} isn't an option value, so it's skipped`] });
  });

  test("nothing usable means every option", () => {
    expect(parseOptionValues("red, amber")).toEqual({
      values: null,
      warnings: ['Options to show: "red" isn\'t an option value, so it\'s skipped', 'Options to show: "amber" isn\'t an option value, so it\'s skipped'],
    });
  });
});

describe("normalizeRecordId", () => {
  test.each([null, undefined, "", "  "])("%p is empty (a new record before its first save)", (raw) => {
    expect(normalizeRecordId(raw)).toEqual({ kind: "empty" });
  });

  test("strips braces and lower-cases", () => {
    expect(normalizeRecordId(" {A1B2C3D4-0000-4000-8000-00000000ABCD} ")).toEqual({ kind: "guid", id: "a1b2c3d4-0000-4000-8000-00000000abcd" });
    expect(normalizeRecordId("a1b2c3d4-0000-4000-8000-00000000abcd")).toEqual({ kind: "guid", id: "a1b2c3d4-0000-4000-8000-00000000abcd" });
  });

  test.each(["not a guid", "a1b2c3d4000040008000000000000abcd", '{a1b2c3d4-0000-4000-8000-00000000abcd}" /><x', "{a1b2c3d4-0000-4000-8000-00000000abcd"])(
    "%p is invalid",
    (raw) => {
      expect(normalizeRecordId(raw)).toEqual({ kind: "invalid", raw: raw.trim() });
    },
  );
});

describe("parseConfig review fixes (1 Nov 2026)", () => {
  test("lower-cases logical names", () => {
    const result = parseConfig({ tableName: "WBSuper_SMSFTask", groupColumn: "WBSuper_RAGStatus", relationshipColumn: "WBSuper_SMSFMatter" });
    expect(result.ok && result.config).toMatchObject({ tableName: "wbsuper_smsftask", groupColumn: "wbsuper_ragstatus", relationshipColumn: "wbsuper_smsfmatter" });
  });

  test("rejects a filter longer than the limit", () => {
    const condition = '<condition attribute="a" operator="eq" value="1" />';
    const long = condition.repeat(Math.ceil((MAX_FILTER_LENGTH + 1) / condition.length));
    const result = parseConfig({ tableName: "t", groupColumn: "c", filterXml: long });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]).toMatch(/keep it under 4000/);
  });
});

describe("colours and zero counts (brief amendment, 1 Nov 2026)", () => {
  test("parses value:colour pairs, normalising the colours", () => {
    expect(parseOptionColors(" 512340000:#c50f1f, 512340001 : #F7630C ,-1:#000 ")).toEqual({
      colors: new Map([
        [512340000, "#C50F1F"],
        [512340001, "#F7630C"],
        [-1, "#000000"],
      ]),
      warnings: [],
    });
  });

  test("skips entries that aren't value:colour, and keeps the first of a repeat, with warnings", () => {
    const { colors, warnings } = parseOptionColors("1:red, x:#000000, 2, 3:#12345, 1:#FFFFFF, 99999999999999999999:#000000,");
    // "1:red" is skipped, so "1:#FFFFFF" is the first valid colour for 1 and is kept.
    expect(colors).toEqual(new Map([[1, "#FFFFFF"]]));
    expect(warnings).toEqual([
      `Colours: "1:red" isn't "value:#colour", so it's skipped`,
      `Colours: "x:#000000" isn't "value:#colour", so it's skipped`,
      `Colours: "2" isn't "value:#colour", so it's skipped`,
      `Colours: "3:#12345" isn't "value:#colour", so it's skipped`,
      `Colours: "99999999999999999999:#000000" isn't "value:#colour", so it's skipped`,
    ]);
    expect(parseOptionColors("1:#000000, 1:#FFFFFF")).toEqual({
      colors: new Map([[1, "#000000"]]),
      warnings: ["Colours: 1 is listed more than once; the first colour is used"],
    });
    expect(parseOptionColors("  ")).toEqual({ colors: new Map(), warnings: [] });
  });

  test("parseConfig reads the colours and zero-count setting, and passes colour warnings through", () => {
    const result = parseConfig({ ...valid, optionColors: "1:#C50F1F, bad", zeroCounts: "1" });
    expect(result.ok && result.config.optionColors).toEqual(new Map([[1, "#C50F1F"]]));
    expect(result.ok && result.config.neutralZeroCounts).toBe(false);
    expect(result.ok && result.warnings).toEqual([`Colours: "bad" isn't "value:#colour", so it's skipped`]);
    expect(parseConfig({ ...valid, zeroCounts: "0" }).ok && (parseConfig({ ...valid, zeroCounts: "0" }) as { config: { neutralZeroCounts: boolean } }).config.neutralZeroCounts).toBe(true);
  });
});
