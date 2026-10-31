import {
  isAggregateLimitError,
  resolveDisplayState,
  TOO_MANY_ROWS_TOOLTIP,
  UNAVAILABLE_TOOLTIP,
  UNSAVED_TEXT,
} from "../ChoiceCounts/logic/display";
import type { Badge } from "../ChoiceCounts/logic/results";

const badges: Badge[] = [
  { value: 1, label: "Red", count: 2, color: null },
  { value: 2, label: "Amber", count: 5, color: null },
];
const loaded = { status: "loaded", badges } as const;

describe("resolveDisplayState", () => {
  test("unusable configuration is unavailable, whatever else is true", () => {
    expect(resolveDisplayState({ usable: false, waitingForSave: true, load: loaded })).toEqual({ kind: "unavailable", tooltip: UNAVAILABLE_TOOLTIP });
  });

  test("a new record with a relationship waits for its first save", () => {
    expect(resolveDisplayState({ usable: true, waitingForSave: true, load: loaded })).toEqual({ kind: "unsaved" });
    expect(UNSAVED_TEXT).toBe("Available after save");
  });

  test("the first load shows a spinner", () => {
    expect(resolveDisplayState({ usable: true, waitingForSave: false, load: { status: "loading", previous: null } })).toEqual({ kind: "loading" });
  });

  test("a refresh keeps the current badges and marks them refreshing", () => {
    expect(resolveDisplayState({ usable: true, waitingForSave: false, load: { status: "loading", previous: badges } })).toEqual({
      kind: "ready",
      badges,
      refreshing: true,
      accessibleName: "Red 2, Amber 5",
    });
  });

  test("loaded counts are ready", () => {
    expect(resolveDisplayState({ usable: true, waitingForSave: false, load: loaded })).toEqual({
      kind: "ready",
      badges,
      refreshing: false,
      accessibleName: "Red 2, Amber 5",
    });
  });

  test("a failed query is unavailable", () => {
    expect(resolveDisplayState({ usable: true, waitingForSave: false, load: { status: "failed", error: new Error("403") } })).toEqual({
      kind: "unavailable",
      tooltip: UNAVAILABLE_TOOLTIP,
    });
  });

  test("the 50,000-row limit says so", () => {
    const error = { errorCode: -2147164125, message: "AggregateQueryRecordLimit exceeded. Cannot perform this operation." };
    expect(resolveDisplayState({ usable: true, waitingForSave: false, load: { status: "failed", error } })).toEqual({
      kind: "unavailable",
      tooltip: TOO_MANY_ROWS_TOOLTIP,
    });
  });
});

describe("isAggregateLimitError", () => {
  test.each([
    [{ errorCode: -2147164125 }],
    [{ code: -2147164125 }],
    [{ errorCode: "0x8004E023" }],
    [{ code: "8004e023" }],
    [{ message: "The maximum record limit is exceeded. AggregateQueryRecordLimit exceeded." }],
    [new Error("Sql error: 8004E023")],
  ])("recognises %p", (error) => {
    expect(isAggregateLimitError(error)).toBe(true);
  });

  test.each([[null], [undefined], ["8004E023"], [42], [{ errorCode: -2147220891, message: "Principal user is missing prvReadabc_task privilege" }], [{}]])(
    "ignores %p",
    (error) => {
      expect(isAggregateLimitError(error)).toBe(false);
    },
  );
});
