import { normalizeHex, type HexColor } from "@wb-pcf/shared";
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

  test.each([14, "VirtualType", "MultiSelectPicklistType", "multiselectpicklist", 6, "LookupType", undefined, null])("%p can't be grouped", (type) => {
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

  test("reads Yes/No groups as 1 and 0, and numeric-string group values", () => {
    expect(readGroupCounts([row(true, 3), row(false, 1)])).toEqual(
      new Map([
        [1, 3],
        [0, 1],
      ]),
    );
    expect(readGroupCounts([row("2", 4)])).toEqual(new Map([[2, 4]]));
  });

  test("rejects counts that aren't whole numbers, as Dataverse never sends them", () => {
    for (const count of ["4", true, 1.5, -1, null]) expect(readGroupCounts([row(1, count)])).toBeNull();
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

describe("mergeCounts with no usable option values", () => {
  test("shows every option, and still reports the unknown values", () => {
    const options = [
      { value: 1, label: "Red", color: "#D13438", hidden: false },
      { value: 2, label: "Amber", color: null, hidden: false },
    ];
    const merged = mergeCounts(options, new Map([[1, 2]]), [100000000, 100000001]);
    expect(merged.badges.map((b) => [b.label, b.count])).toEqual([
      ["Red", 2],
      ["Amber", 0],
    ]);
    expect(merged.unknownOptionValues).toEqual([100000000, 100000001]);
  });
});

describe("readGroupCounts with a real Dataverse response (decisions.md C-3)", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const load = (name: string) => (require(`./fixtures/${name}`) as { value: unknown[] }).value;
  const fixture = { value: load("aggregate-choice.json") };

  test("Status Reason and Status groups are option values", () => {
    expect(readGroupCounts(load("aggregate-status-reason.json"))).toEqual(
      new Map([
        [1, 9],
        [2, 1],
      ]),
    );
    expect(readGroupCounts(load("aggregate-status.json"))).toEqual(
      new Map([
        [0, 9],
        [1, 1],
      ]),
    );
  });

  test("Yes/No groups arrive as booleans and become 0 and 1", () => {
    expect(readGroupCounts(load("aggregate-yes-no.json"))).toEqual(
      new Map([
        [0, 8],
        [1, 2],
      ]),
    );
  });

  test("reads the counts, ignores the annotations and drops the blank group (no group key at all)", () => {
    expect(readGroupCounts(fixture.value)).toEqual(
      new Map([
        [512340001, 3],
        [512340002, 3],
        [512340000, 2],
      ]),
    );
  });
});

describe("mergeCounts colouring (brief amendment, 1 Nov 2026)", () => {
  const hex = (color: string): HexColor => normalizeHex(color) as HexColor;
  const options = [
    { value: 1, label: "Red", color: "#D13438", hidden: false },
    { value: 2, label: "Amber", color: "#FFB900", hidden: false },
    { value: 3, label: "Green", color: null, hidden: false },
  ];
  const colours = (badges: readonly { label: string; color: string | null }[]) => badges.map((b) => [b.label, b.color]);

  test("neutral zero counts: only non-zero counts get a colour", () => {
    const merged = mergeCounts(options, new Map([[2, 3]]), null, { overrides: new Map(), neutralZeroCounts: true });
    expect(colours(merged.badges)).toEqual([
      ["Red", null],
      ["Amber", "#FFB900"],
      ["Green", null],
    ]);
  });

  test("overrides replace the choice colour, and give an option with none a colour", () => {
    const overrides = new Map([
      [1, hex("#C50F1F")],
      [3, hex("#0B6A0B")],
    ]);
    const merged = mergeCounts(options, new Map([[1, 1], [3, 1]]), null, { overrides, neutralZeroCounts: false });
    expect(colours(merged.badges)).toEqual([
      ["Red", "#C50F1F"],
      ["Amber", "#FFB900"],
      ["Green", "#0B6A0B"],
    ]);
  });

  test("an override doesn't colour a zero count when zero counts are neutral", () => {
    const merged = mergeCounts(options, new Map(), [1], { overrides: new Map([[1, hex("#C50F1F")]]), neutralZeroCounts: true });
    expect(colours(merged.badges)).toEqual([["Red", null]]);
  });
});
