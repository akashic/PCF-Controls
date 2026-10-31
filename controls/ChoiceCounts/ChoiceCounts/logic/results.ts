/**
 * Turns the grouped response into one badge per option (brief §5.2): blank values
 * dropped, every option shown in metadata order with zeros filled in, then the
 * maker's subset applied in the order they gave.
 */
import { normalizeHex, type HexColor } from "@wb-pcf/shared";
import { COUNT_ALIAS, GROUP_ALIAS } from "./fetchXml";

/** One option of the grouped column, in metadata order. Read from metadata in #54. */
export interface ChoiceOption {
  readonly value: number;
  readonly label: string;
  /** As written in metadata; validated here. */
  readonly color: string | null;
  readonly hidden: boolean;
}

export interface Badge {
  readonly value: number;
  readonly label: string;
  readonly count: number;
  /** `null` when the option has no valid colour: the badge then uses theme colours. */
  readonly color: HexColor | null;
}

export interface MergedCounts {
  readonly badges: readonly Badge[];
  /** Values in `optionValues` that aren't options of the column (worth a warning). */
  readonly unknownOptionValues: readonly number[];
  /** Values the query returned that aren't options of the column, e.g. a deleted option still in use. */
  readonly unlistedValues: readonly number[];
}

/** The kinds of column that can be grouped (brief §2). Multi-select choices can't. */
export type GroupColumnKind = "choice" | "status" | "state" | "yesNo";

/**
 * The kind of a grouped column from its metadata type: an `AttributeType` code or an
 * `AttributeTypeName` such as "PicklistType". The shape getEntityMetadata returns from
 * PCF is VERIFY C-4. `null` means the column can't be grouped (including multi-select).
 */
export function groupColumnKind(attributeType: unknown): GroupColumnKind | null {
  switch (attributeType) {
    case 11:
    case "PicklistType":
      return "choice";
    case 13:
    case "StatusType":
      return "status";
    case 12:
    case "StateType":
      return "state";
    case 0:
    case "BooleanType":
      return "yesNo";
    default:
      return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** A grouped value as an option value: whole numbers as they are, Yes/No as 1/0, `null` for blank. */
function groupValue(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (raw === true) return 1;
  if (raw === false) return 0;
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

/**
 * Option value → count from the response's entities (one per group). Blank groups are
 * dropped. `null` if the response isn't the expected shape, which the control treats
 * as a failed query.
 */
export function readGroupCounts(entities: unknown): Map<number, number> | null {
  if (!Array.isArray(entities)) return null;
  const counts = new Map<number, number>();
  for (const row of entities as unknown[]) {
    if (!isRecord(row)) return null;
    const count = groupValue(row[COUNT_ALIAS]);
    const value = groupValue(row[GROUP_ALIAS]);
    if (typeof count !== "number" || count < 0 || value === undefined) return null;
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + count);
  }
  return counts;
}

/**
 * The badges to show. Without `optionValues`: every option in metadata order, except
 * hidden options that have no rows (RagChoice's rule). With `optionValues`: exactly
 * those options, in that order, hidden or not.
 */
export function mergeCounts(
  options: readonly ChoiceOption[],
  counts: ReadonlyMap<number, number>,
  optionValues: readonly number[] | null,
): MergedCounts {
  const byValue = new Map(options.map((option) => [option.value, option]));
  const badge = (option: ChoiceOption): Badge => ({
    value: option.value,
    label: option.label,
    count: counts.get(option.value) ?? 0,
    color: normalizeHex(option.color),
  });

  const unknownOptionValues: number[] = [];
  let shown: ChoiceOption[];
  if (optionValues === null) {
    shown = options.filter((option) => !option.hidden || (counts.get(option.value) ?? 0) > 0);
  } else {
    shown = [];
    for (const value of optionValues) {
      const option = byValue.get(value);
      if (option) shown.push(option);
      else unknownOptionValues.push(value);
    }
  }

  return {
    badges: shown.map(badge),
    unknownOptionValues,
    unlistedValues: [...counts.keys()].filter((value) => !byValue.has(value)),
  };
}

/** What a screen reader hears for the whole control, e.g. "Red 2, Amber 5, Green 11". */
export function accessibleName(badges: readonly Badge[]): string {
  return badges.map((badge) => `${badge.label} ${badge.count}`).join(", ");
}
