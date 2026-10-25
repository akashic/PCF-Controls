/**
 * Pure logic for the RagChoice control: no React, no PCF context.
 * Every function accepts untrusted platform values and never throws.
 */
import { normalizeHex, type HexColor } from "@wb-pcf/shared";

/** How the colour is shown: a dot before the label, or a bar on the dropdown's left edge. */
export type IndicatorStyle = "dot" | "bar";

/** Placeholder for an empty choice, matching the platform's own text. */
export const PLACEHOLDER = "--Select--";

/** What the platform's read-only choice shows when it's empty. */
export const READ_ONLY_EMPTY = "---";

/** What the platform shows for a field the user can't read (field security). */
export const MASKED_VALUE = "***";

/** Dropdown option key of the blank "clear the value" option. */
export const BLANK_KEY = "";

/** The subset of `ComponentFramework.PropertyHelper.OptionMetadata` this control reads. */
export interface OptionMetadataLike {
  Label?: unknown;
  Value?: unknown;
  Color?: unknown;
  /**
   * The option's **Hidden** property. It isn't in the PCF typings or docs,
   * but the model-driven form host sends it (verified in dev, issue #7).
   */
  IsHidden?: unknown;
}

/** One entry in the dropdown list. */
export interface ChoiceItem {
  /** Dropdown option value: the option's numeric value as a string, or {@link BLANK_KEY}. */
  key: string;
  /** The choice value to write back, or `null` for the blank option. */
  value: number | null;
  label: string;
  /** Indicator colour, or `null` for no indicator. */
  color: HexColor | null;
  /** Listed but not selectable: a hidden option that is the current value. */
  disabled: boolean;
}

/** What the closed dropdown shows. */
export interface DisplayValue {
  /** Text in the closed dropdown; empty means show {@link PLACEHOLDER}. */
  text: string;
  color: HexColor | null;
  /** Key of the selected option, if it's in the list. */
  selectedKey: string | null;
}

/** The subset of the PCF field security and mode objects this control reads. */
export interface FieldStateInput {
  isControlDisabled?: unknown;
  security?: { readable?: unknown; editable?: unknown } | null;
}

export interface FieldState {
  readable: boolean;
  editable: boolean;
}

/** The `indicator` input: anything other than `"bar"` means the default `"dot"`. */
export function parseIndicatorStyle(raw: unknown): IndicatorStyle {
  return raw === "bar" ? "bar" : "dot";
}

/**
 * Validates the `fallbackColor` input. Blank means no fallback. An invalid
 * colour also means no fallback, and `invalid` lets the caller warn once.
 */
export function parseFallbackColor(raw: unknown): { color: HexColor | null; invalid: boolean } {
  if (typeof raw !== "string" || raw.trim() === "") return { color: null, invalid: false };
  const color = normalizeHex(raw);
  return { color, invalid: color === null };
}

/**
 * The colour to show for an option: its own `Color` if valid, otherwise the
 * fallback, otherwise none. Never inferred from the label.
 */
export function resolveIndicatorColor(optionColor: unknown, fallback: HexColor | null): HexColor | null {
  return normalizeHex(optionColor) ?? fallback;
}

/** The bound value as a choice value, or `null` when empty or not a usable number. */
export function normalizeRawValue(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/**
 * `RequiredLevel` from the attribute metadata: 1 = system required,
 * 2 = business required. Both mean the user can't clear the value.
 */
export function isRequired(requiredLevel: unknown): boolean {
  return requiredLevel === 1 || requiredLevel === 2;
}

/**
 * The dropdown's options in metadata order, each with its indicator colour,
 * plus a blank option at the top unless the column is required. Entries
 * without a numeric value, and repeated values, are skipped.
 *
 * Hidden options are left out, as in the platform's own dropdown, unless one
 * is the `selected` value. That one stays in the list, disabled, so the
 * current value still shows but can't be picked again.
 */
export function buildChoiceItems(
  options: unknown,
  fallback: HexColor | null,
  required: boolean,
  selected: number | null = null,
): ChoiceItem[] {
  const items: ChoiceItem[] = required
    ? []
    : [{ key: BLANK_KEY, value: null, label: PLACEHOLDER, color: null, disabled: false }];
  if (!Array.isArray(options)) return items;

  const seen = new Set<number>();
  for (const option of options as unknown[]) {
    if (typeof option !== "object" || option === null) continue;
    const { Label, Value, Color, IsHidden } = option as OptionMetadataLike;
    const value = normalizeRawValue(Value);
    if (value === null || seen.has(value)) continue;
    seen.add(value);
    const hidden = IsHidden === true;
    if (hidden && value !== selected) continue;
    items.push({
      key: String(value),
      value,
      label: typeof Label === "string" && Label !== "" ? Label : String(value),
      color: resolveIndicatorColor(Color, fallback),
      disabled: hidden,
    });
  }
  return items;
}

/** Maps a selected dropdown key back to a choice value (`null` for the blank or an unknown key). */
export function valueForKey(items: readonly ChoiceItem[], key: string | undefined): number | null {
  return items.find((item) => item.key === key)?.value ?? null;
}

/**
 * What the closed dropdown shows. A value that isn't in the options (for
 * example, an option the platform didn't send) shows as its number with no
 * indicator rather than as empty.
 */
export function displayValue(items: readonly ChoiceItem[], value: number | null, readable: boolean): DisplayValue {
  if (!readable) return { text: MASKED_VALUE, color: null, selectedKey: null };
  if (value === null) return { text: "", color: null, selectedKey: null };
  const item = items.find((i) => i.value === value);
  return item
    ? { text: item.label, color: item.color, selectedKey: item.key }
    : { text: String(value), color: null, selectedKey: null };
}

/**
 * Whether the user can see and change the value. Missing security info
 * (for example, in the test harness) means no field security applies.
 */
export function resolveFieldState(input: FieldStateInput): FieldState {
  const readable = input.security?.readable !== false;
  const editable = readable && input.isControlDisabled !== true && input.security?.editable !== false;
  return { readable, editable };
}

/**
 * `aria-label` for the dropdown. The form doesn't associate its field label
 * with a custom control (verified in dev, issue #7), so the control names
 * itself: the form label (`context.mode.label`) first, as the platform's own
 * controls do, then the column's display name. Blank or missing means none.
 */
export function ariaLabelFor(formLabel: unknown, displayName: unknown): string | undefined {
  for (const text of [formLabel, displayName]) {
    if (typeof text === "string" && text.trim() !== "") return text;
  }
  return undefined;
}

/** The control's view of the bound value between `updateView` calls. */
export interface Selection {
  /** What the control shows and returns from `getOutputs()`. */
  selected: number | null;
  /** The bound `raw` value seen in the last `updateView`. */
  lastRaw: number | null;
}

/**
 * Re-syncs the selection from the bound value in `updateView`. Whenever
 * `raw` differs from the last one seen (a business rule, JavaScript, a
 * refresh, or the platform confirming the user's own change), it wins. An
 * unchanged `raw` keeps a user selection that the platform hasn't echoed
 * back yet, so the dropdown doesn't flick back to the old value.
 */
export function syncSelection(current: Selection, raw: unknown): Selection {
  const value = normalizeRawValue(raw);
  return value === current.lastRaw ? current : { selected: value, lastRaw: value };
}

/** What the view renders, apart from the theme and the change handler. */
export interface RenderedData {
  items: readonly ChoiceItem[];
  display: DisplayValue;
  indicator: IndicatorStyle;
  readOnly: boolean;
  required: boolean;
  ariaLabel: string | undefined;
}

/**
 * The rendered data as one string, so the error boundary can tell when it
 * changes (a new value, new options, a lock, a required level change).
 */
export function renderKey(data: RenderedData): string {
  return JSON.stringify(data);
}

/** The error boundary's state: whether rendering failed, and for which data. */
export interface BoundaryState {
  failed: boolean;
  renderKey: string | null;
}

/**
 * The error boundary's `getDerivedStateFromProps`: once rendering has
 * failed, the boundary shows plain text until the data changes, then tries
 * the control again. The same data stays on the text, so a render that
 * always throws doesn't throw on every update.
 */
export function resetBoundary(state: BoundaryState, key: string): BoundaryState | null {
  return state.renderKey === key ? null : { failed: false, renderKey: key };
}

/** `getOutputs()` result: `undefined` clears the column. */
export function toOutputs(selected: number | null): { value: number | undefined } {
  return { value: selected ?? undefined };
}
