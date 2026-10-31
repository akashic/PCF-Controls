import { normalizeRecordId, parseConfig, parseOptionValues } from "../ChoiceCounts/logic/config";

const valid = { tableName: "abc_task", groupColumn: "abc_ragstatus" };

describe("parseConfig", () => {
  test("accepts the minimum and defaults the rest", () => {
    expect(parseConfig(valid)).toEqual({
      ok: true,
      config: { tableName: "abc_task", groupColumn: "abc_ragstatus", relationshipColumn: null, filter: [], optionValues: null },
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
