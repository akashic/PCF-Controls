import { normalizeHex } from "@wb-pcf/shared";
import { COUNT_ALIAS, GROUP_ALIAS } from "../ChoiceCounts/logic/fetchXml";
import { accessibleName, groupColumnKind, mergeCounts, readGroupCounts, type ChoiceOption } from "../ChoiceCounts/logic/results";

const row = (value: unknown, count: unknown) => ({ [GROUP_ALIAS]: value, [COUNT_ALIAS]: count, "@odata.etag": 'W/"1"' });

const options: ChoiceOption[] = [
  { value: 1, label: "Red", color: "#D13438", hidden: false },
  { value: 2, label: "Amber", color: "#ffaa44", hidden: false },
  { value: 3, label: "Green", color: "#107C10", hidden: false },
  { value: 4, label: "Retired", color: "#888888", hidden: true },
  { value: 5, label: "Unknown", color: null, hidden: false },
];

describe("groupColumnKind", () => {
  test.each([
    [11, "choice"],
    ["PicklistType", "choice"],
    [13, "status"],
    ["StatusType", "status"],
    [12, "state"],
    ["StateType", "state"],
    [0, "yesNo"],
    ["BooleanType", "yesNo"],
  ])("%p is %p", (type, kind) => {
    expect(groupColumnKind(type)).toBe(kind);
  });

  test.each([14, "VirtualType", "MultiSelectPicklistType", 6, "LookupType", "picklist", undefined, null])("%p can't be grouped", (type) => {
    expect(groupColumnKind(type)).toBeNull();
  });
});

describe("readGroupCounts", () => {
  test("reads one count per group and drops the blank group", () => {
    expect(readGroupCounts([row(1, 2), row(2, 5), row(null, 9), row(undefined, 1), row(3, 0)])).toEqual(
      new Map([
        [1, 2],
        [2, 5],
        [3, 0],
      ]),
    );
  });

  test("reads numeric strings, and Yes/No as 1 and 0", () => {
    expect(readGroupCounts([row("1", "4"), row(true, 3), row(false, 1)])).toEqual(
      new Map([
        [1, 4],
        [0, 1],
      ]).set(1, 7),
    );
  });

  test("adds up a value that appears twice", () => {
    expect(readGroupCounts([row(1, 2), row(1, 3)])).toEqual(new Map([[1, 5]]));
  });

  test("an empty response is no counts", () => {
    expect(readGroupCounts([])).toEqual(new Map());
  });

  test.each([
    ["not an array", { entities: [] }],
    ["a row that isn't an object", [7]],
    ["a null row", [null]],
    ["a missing count", [{ [GROUP_ALIAS]: 1 }]],
    ["a negative count", [row(1, -1)]],
    ["a fractional count", [row(1, 1.5)]],
    ["a text count", [row(1, "many")]],
    ["a fractional value", [row(1.5, 1)]],
    ["an object value", [row({ Value: 1 }, 1)]],
    ["a blank-string value", [row(" ", 1)]],
  ])("rejects %s", (_, entities) => {
    expect(readGroupCounts(entities)).toBeNull();
  });
});

describe("mergeCounts", () => {
  const counts = new Map([
    [1, 2],
    [3, 11],
  ]);

  test("shows every visible option in metadata order, with zeros", () => {
    const { badges, unknownOptionValues, unlistedValues } = mergeCounts(options, counts, null);
    expect(badges).toEqual([
      { value: 1, label: "Red", count: 2, color: normalizeHex("#D13438") },
      { value: 2, label: "Amber", count: 0, color: normalizeHex("#FFAA44") },
      { value: 3, label: "Green", count: 11, color: normalizeHex("#107C10") },
      { value: 5, label: "Unknown", count: 0, color: null },
    ]);
    expect(unknownOptionValues).toEqual([]);
    expect(unlistedValues).toEqual([]);
  });

  test("shows a hidden option once it has rows", () => {
    const { badges } = mergeCounts(options, new Map([[4, 1]]), null);
    expect(badges.map((badge) => badge.label)).toEqual(["Red", "Amber", "Green", "Retired", "Unknown"]);
  });

  test("a subset shows exactly those options in the maker's order, hidden or not", () => {
    const { badges } = mergeCounts(options, counts, [2, 1, 4]);
    expect(badges.map((badge) => [badge.label, badge.count])).toEqual([
      ["Amber", 0],
      ["Red", 2],
      ["Retired", 0],
    ]);
  });

  test("reports subset values that aren't options", () => {
    const { badges, unknownOptionValues } = mergeCounts(options, counts, [1, 99, 3, 100]);
    expect(badges.map((badge) => badge.value)).toEqual([1, 3]);
    expect(unknownOptionValues).toEqual([99, 100]);
  });

  test("reports counted values that aren't options, and doesn't show them", () => {
    const { badges, unlistedValues } = mergeCounts(options, new Map([[1, 1], [42, 3]]), null);
    expect(badges.find((badge) => badge.value === 42)).toBeUndefined();
    expect(unlistedValues).toEqual([42]);
  });

  test("an option with an invalid colour gets none", () => {
    const { badges } = mergeCounts([{ value: 1, label: "Odd", color: "reddish", hidden: false }], new Map(), null);
    expect(badges[0].color).toBeNull();
  });

  test("no options means no badges", () => {
    expect(mergeCounts([], new Map(), null).badges).toEqual([]);
  });
});

describe("accessibleName", () => {
  test("reads each label and count in order", () => {
    const { badges } = mergeCounts(options.slice(0, 3), new Map([[1, 2], [2, 5], [3, 11]]), null);
    expect(accessibleName(badges)).toBe("Red 2, Amber 5, Green 11");
  });

  test("is empty with no badges", () => {
    expect(accessibleName([])).toBe("");
  });
});
