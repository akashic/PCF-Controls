import { normalizeHex, type HexColor } from "@wb-pcf/shared";
import {
  BLANK_KEY,
  MASKED_VALUE,
  PLACEHOLDER,
  ariaLabelFor,
  buildChoiceItems,
  displayValue,
  isRequired,
  normalizeRawValue,
  parseFallbackColor,
  parseIndicatorStyle,
  resolveFieldState,
  resolveIndicatorColor,
  syncSelection,
  toOutputs,
  valueForKey,
} from "../RagChoice/logic";

const hex = (value: string): HexColor => {
  const color = normalizeHex(value);
  if (!color) throw new Error(`bad test colour ${value}`);
  return color;
};

// The §8.2 harness fixture: three coloured options and one without a colour.
const RAG_OPTIONS = [
  { Label: "Red", Value: 948790000, Color: "#C50F1F" },
  { Label: "Amber", Value: 948790001, Color: "#ffb900" },
  { Label: "Green", Value: 948790002, Color: "107C10" },
  { Label: "Not assessed", Value: 948790003, Color: "" },
];

describe("parseIndicatorStyle", () => {
  it("returns bar only for 'bar'", () => {
    expect(parseIndicatorStyle("bar")).toBe("bar");
  });

  it.each([["dot"], [null], [undefined], ["BAR"], [""], [1]])("defaults %p to dot", (raw) => {
    expect(parseIndicatorStyle(raw)).toBe("dot");
  });
});

describe("parseFallbackColor", () => {
  it("normalises a valid colour", () => {
    expect(parseFallbackColor(" #abc ")).toEqual({ color: "#AABBCC", invalid: false });
  });

  it.each([[null], [undefined], [""], ["   "], [42]])("treats %p as no fallback", (raw) => {
    expect(parseFallbackColor(raw)).toEqual({ color: null, invalid: false });
  });

  it("flags an invalid colour so the caller can warn", () => {
    expect(parseFallbackColor("red")).toEqual({ color: null, invalid: true });
  });
});

describe("resolveIndicatorColor", () => {
  const fallback = hex("#605E5C");

  it("uses the option's own colour when valid", () => {
    expect(resolveIndicatorColor("#c50f1f", fallback)).toBe("#C50F1F");
  });

  it.each([[""], [null], [undefined], ["not-a-colour"], ["#12345"]])(
    "uses the fallback when the option colour is %p",
    (color) => {
      expect(resolveIndicatorColor(color, fallback)).toBe("#605E5C");
    },
  );

  it("shows no indicator when neither colour is usable", () => {
    expect(resolveIndicatorColor("", null)).toBeNull();
  });
});

describe("normalizeRawValue", () => {
  it("keeps finite numbers, including 0", () => {
    expect(normalizeRawValue(948790000)).toBe(948790000);
    expect(normalizeRawValue(0)).toBe(0);
  });

  it.each([[null], [undefined], [NaN], [Infinity], ["948790000"], [{}]])("maps %p to null", (raw) => {
    expect(normalizeRawValue(raw)).toBeNull();
  });
});

describe("isRequired", () => {
  it.each([
    [0, false],
    [1, true],
    [2, true],
    [3, false],
    [undefined, false],
    ["2", false],
  ])("RequiredLevel %p → %p", (level, expected) => {
    expect(isRequired(level)).toBe(expected);
  });
});

describe("buildChoiceItems", () => {
  it("keeps metadata order, adds a blank option first, and resolves each colour", () => {
    expect(buildChoiceItems(RAG_OPTIONS, null, false)).toEqual([
      { key: BLANK_KEY, value: null, label: PLACEHOLDER, color: null },
      { key: "948790000", value: 948790000, label: "Red", color: "#C50F1F" },
      { key: "948790001", value: 948790001, label: "Amber", color: "#FFB900" },
      { key: "948790002", value: 948790002, label: "Green", color: "#107C10" },
      { key: "948790003", value: 948790003, label: "Not assessed", color: null },
    ]);
  });

  it("omits the blank option when the column is required", () => {
    const items = buildChoiceItems(RAG_OPTIONS, null, true);
    expect(items.map((i) => i.key)).toEqual(["948790000", "948790001", "948790002", "948790003"]);
  });

  it("applies the fallback colour only to options without a valid colour", () => {
    const items = buildChoiceItems(RAG_OPTIONS, hex("#605E5C"), true);
    expect(items.map((i) => i.color)).toEqual(["#C50F1F", "#FFB900", "#107C10", "#605E5C"]);
  });

  it("never infers a colour from the label", () => {
    const [item] = buildChoiceItems([{ Label: "Red", Value: 1, Color: null }], null, true);
    expect(item?.color).toBeNull();
  });

  it("skips malformed and duplicate entries without throwing", () => {
    const options = [null, "x", { Label: "No value" }, { Label: "A", Value: 1 }, { Label: "A again", Value: 1 }, { Value: 2 }];
    expect(buildChoiceItems(options, null, true)).toEqual([
      { key: "1", value: 1, label: "A", color: null },
      { key: "2", value: 2, label: "2", color: null },
    ]);
  });

  it.each([[undefined], [null], [{}]])("returns only the blank option when Options is %p", (options) => {
    expect(buildChoiceItems(options, null, false)).toEqual([
      { key: BLANK_KEY, value: null, label: PLACEHOLDER, color: null },
    ]);
    expect(buildChoiceItems(options, null, true)).toEqual([]);
  });
});

describe("valueForKey", () => {
  const items = buildChoiceItems(RAG_OPTIONS, null, false);

  it("maps an option key to its value", () => {
    expect(valueForKey(items, "948790001")).toBe(948790001);
  });

  it.each([[BLANK_KEY], ["999"], [undefined]])("maps %p to null (clear)", (key) => {
    expect(valueForKey(items, key)).toBeNull();
  });
});

describe("displayValue", () => {
  const items = buildChoiceItems(RAG_OPTIONS, null, false);

  it("shows the selected label and its colour", () => {
    expect(displayValue(items, 948790000, true)).toEqual({ text: "Red", color: "#C50F1F", selectedKey: "948790000" });
  });

  it("shows the placeholder and no indicator when empty", () => {
    expect(displayValue(items, null, true)).toEqual({ text: "", color: null, selectedKey: null });
  });

  it("shows an option without a colour with no indicator", () => {
    expect(displayValue(items, 948790003, true)).toEqual({ text: "Not assessed", color: null, selectedKey: "948790003" });
  });

  it("shows a value missing from the options as its number, with no indicator", () => {
    expect(displayValue(items, 5, true)).toEqual({ text: "5", color: null, selectedKey: null });
  });

  it("masks the value with no indicator when the field isn't readable", () => {
    expect(displayValue(items, 948790000, false)).toEqual({ text: MASKED_VALUE, color: null, selectedKey: null });
    expect(displayValue(items, null, false).text).toBe(MASKED_VALUE);
  });
});

describe("resolveFieldState", () => {
  it("is readable and editable with no security info (harness)", () => {
    expect(resolveFieldState({ isControlDisabled: false })).toEqual({ readable: true, editable: true });
    expect(resolveFieldState({ isControlDisabled: false, security: null })).toEqual({ readable: true, editable: true });
  });

  it("is read-only when the control is disabled", () => {
    expect(resolveFieldState({ isControlDisabled: true })).toEqual({ readable: true, editable: false });
  });

  it("is read-only when field security denies update", () => {
    expect(resolveFieldState({ isControlDisabled: false, security: { readable: true, editable: false } })).toEqual({
      readable: true,
      editable: false,
    });
  });

  it("is neither readable nor editable when field security denies read", () => {
    expect(resolveFieldState({ isControlDisabled: false, security: { readable: false, editable: true } })).toEqual({
      readable: false,
      editable: false,
    });
  });
});

describe("ariaLabelFor", () => {
  it("uses the column's display name", () => {
    expect(ariaLabelFor("RAG status")).toBe("RAG status");
  });

  it.each([[""], ["  "], [undefined], [null], [3]])("gives no label for %p", (name) => {
    expect(ariaLabelFor(name)).toBeUndefined();
  });
});

describe("syncSelection", () => {
  it("takes an external change to the bound value", () => {
    expect(syncSelection({ selected: 1, lastRaw: 1 }, 2)).toEqual({ selected: 2, lastRaw: 2 });
  });

  it("takes an external clear", () => {
    expect(syncSelection({ selected: 1, lastRaw: 1 }, null)).toEqual({ selected: null, lastRaw: null });
  });

  it("keeps a user selection the platform hasn't echoed back yet", () => {
    const current = { selected: 2, lastRaw: 1 };
    expect(syncSelection(current, 1)).toBe(current);
  });

  it("accepts the platform confirming the user's change", () => {
    expect(syncSelection({ selected: 2, lastRaw: 1 }, 2)).toEqual({ selected: 2, lastRaw: 2 });
  });

  it("lets a later external change override a pending user selection", () => {
    expect(syncSelection({ selected: 2, lastRaw: 1 }, 3)).toEqual({ selected: 3, lastRaw: 3 });
  });

  it("treats a non-numeric raw value as empty", () => {
    expect(syncSelection({ selected: 1, lastRaw: 1 }, "1")).toEqual({ selected: null, lastRaw: null });
  });
});

describe("toOutputs", () => {
  it("returns the selected value", () => {
    expect(toOutputs(948790002)).toEqual({ value: 948790002 });
    expect(toOutputs(0)).toEqual({ value: 0 });
  });

  it("returns undefined to clear the column", () => {
    expect(toOutputs(null)).toEqual({ value: undefined });
  });
});
