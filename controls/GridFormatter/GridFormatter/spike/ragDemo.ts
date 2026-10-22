// Temporary RAG colour demo for issue #9: tints each row with its RAG option colour and draws the
// RAG cell as a pill. Proves the metadata → colour → container/pill path end to end before #13.
// The column defaults to wb_ragstatus; override with sessionStorage wb_spike_ragcolumn.
import { HexColor, bestTextColor, normalizeHex, withAlpha } from "@wb-pcf/shared";
import { errorText, record, setting } from "./probe";

let colours: Map<string, HexColor> | null = null;

export const ragColumn = (): string => setting("ragcolumn") ?? "wb_ragstatus";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Reads option colours from attributeDescriptor.OptionSet[].Color (spike V3). Never throws. */
export async function loadRagColours(context: ComponentFramework.Context<unknown>, table: string | null): Promise<void> {
  colours = new Map();
  if (!table) return;
  const column = ragColumn();
  try {
    const metadata: unknown = await context.utils.getEntityMetadata(table, [column]);
    const attributes = isRecord(metadata) ? metadata.Attributes : undefined;
    const attribute = isRecord(attributes) && typeof attributes.get === "function" ? (attributes.get as (name: string) => unknown)(column) : undefined;
    const descriptor = isRecord(attribute) ? attribute.attributeDescriptor : undefined;
    const options = isRecord(descriptor) ? descriptor.OptionSet : undefined;
    if (Array.isArray(options)) {
      for (const option of options as unknown[]) {
        if (!isRecord(option)) continue;
        const hex = normalizeHex(option.Color);
        if (hex && (typeof option.Value === "number" || typeof option.Value === "string")) colours.set(String(option.Value), hex);
      }
    }
    record("RAG demo colours", { table, column, colours: Object.fromEntries(colours) });
  } catch (e) {
    record("RAG demo colours FAILED", errorText(e));
  }
}

/** The row's RAG colour, or null if the column isn't in the view, is empty, or the option has no colour. */
export function ragColour(rowData: Record<string, unknown> | undefined): HexColor | null {
  const value = rowData?.[ragColumn()];
  if (value === null || value === undefined || value === "") return null;
  return colours?.get(String(value as string | number)) ?? null;
}

export const tint = (hex: HexColor): string => withAlpha(hex, 0.18);

export const pillStyle = (hex: HexColor): Record<string, string> => ({
  backgroundColor: hex,
  color: bestTextColor(hex),
  borderRadius: "999px",
  padding: "2px 10px",
  fontWeight: "600",
  lineHeight: "20px",
  whiteSpace: "nowrap",
});
