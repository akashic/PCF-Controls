/**
 * Maps the control's situation to what it shows (brief §5.4). Every failure becomes
 * the same neutral "—" with a short tooltip; the cause goes to one console.warn.
 */
import { accessibleName, type Badge } from "./results";

export const UNAVAILABLE_TOOLTIP = "Counts unavailable";
export const TOO_MANY_ROWS_TOOLTIP = "Too many rows to count";
export const UNSAVED_TEXT = "Available after save";

/** Where the query is. `previous` keeps the last badges on screen while refreshing. */
export type LoadState =
  | { readonly status: "loading"; readonly previous: readonly Badge[] | null }
  | { readonly status: "loaded"; readonly badges: readonly Badge[] }
  | { readonly status: "failed"; readonly error: unknown };

export type DisplayState =
  | { readonly kind: "loading" }
  | { readonly kind: "unsaved" }
  | { readonly kind: "ready"; readonly badges: readonly Badge[]; readonly refreshing: boolean; readonly accessibleName: string }
  | { readonly kind: "unavailable"; readonly tooltip: string };

export interface DisplayInputs {
  /** False when the configuration, the record ID or the grouped column's metadata is unusable. */
  readonly usable: boolean;
  /** A relationship column is set but the record hasn't been saved, so there's nothing to filter by. */
  readonly waitingForSave: boolean;
  readonly load: LoadState;
}

export function resolveDisplayState({ usable, waitingForSave, load }: DisplayInputs): DisplayState {
  if (!usable) return { kind: "unavailable", tooltip: UNAVAILABLE_TOOLTIP };
  if (waitingForSave) return { kind: "unsaved" };
  switch (load.status) {
    case "loading":
      return load.previous ? ready(load.previous, true) : { kind: "loading" };
    case "loaded":
      return ready(load.badges, false);
    case "failed":
      return { kind: "unavailable", tooltip: isAggregateLimitError(load.error) ? TOO_MANY_ROWS_TOOLTIP : UNAVAILABLE_TOOLTIP };
  }
}

const ready = (badges: readonly Badge[], refreshing: boolean): DisplayState => ({
  kind: "ready",
  badges,
  refreshing,
  accessibleName: accessibleName(badges),
});

/** -2147164125 = 0x8004E023, "AggregateQueryRecordLimit exceeded" (more than 50,000 rows). */
const AGGREGATE_LIMIT_CODE = -2147164125;

/**
 * Whether a failed query hit Dataverse's 50,000-row aggregate limit. The PCF Web API
 * rejects with an object carrying `errorCode` and `message`; the exact shape is VERIFY
 * C-3, so the code is matched in decimal or hex, and in the message too.
 */
export function isAggregateLimitError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { errorCode, code, message } = error as Record<string, unknown>;
  if (errorCode === AGGREGATE_LIMIT_CODE || code === AGGREGATE_LIMIT_CODE) return true;
  const text = [errorCode, code, message].filter((part) => typeof part === "string").join(" ");
  return /8004E023|AggregateQueryRecordLimit/i.test(text);
}
