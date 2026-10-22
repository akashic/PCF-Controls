// Spike renderers for issue #9 (V1, V2, V5, V6, V7). Replaced by the real engine in #13.
import * as React from "react";
import { CellRendererOverrides, CellRendererProps, ColumnDataType, GetRendererParams, RECID } from "../types";
import { countRendererCall, describe, record, setting } from "../spike/probe";
import { pillStyle, ragColour, ragColumn, tint } from "../spike/ragDemo";

const ALL_TYPES: ColumnDataType[] = [
  "Text", "Email", "Phone", "Ticker", "URL", "TextArea", "Lookup", "Customer", "Owner",
  "MultiSelectPicklist", "OptionSet", "TwoOptions", "Duration", "Language", "Multiple", "TimeZone",
  "Integer", "Currency", "Decimal", "FloatingPoint", "AutoNumber", "DateOnly", "DateAndTime",
  "Image", "File", "Persona", "RichText", "UniqueIdentifier",
];

// Types technique 3 ("render") draws itself; everything else keeps the built-in renderer.
const SIMPLE_TYPES = new Set<string>(["Text", "Integer", "Decimal", "FloatingPoint", "Currency", "DateOnly", "DateAndTime", "OptionSet", "TwoOptions"]);
const MANAGED = ["backgroundColor", "color", "fontWeight", "fontStyle", "textDecoration"] as const;
const TINT = "rgba(197, 15, 31, 0.15)";

let onColumns: ((choiceColumns: string[]) => void) | null = null;
/** Lets init() request option metadata once the visible columns are known. */
export function onVisibleChoiceColumns(callback: (choiceColumns: string[]) => void): void {
  onColumns = callback;
}

const rowsLogged = new Set<string>();

/** Every other row (by record id) gets the test style, so styled and unstyled rows sit side by side. */
function isStyledRow(recId: string): boolean {
  let hash = 0;
  for (let i = 0; i < recId.length; i++) hash = (hash * 31 + recId.charCodeAt(i)) | 0;
  return (hash & 1) === 0;
}

function testStyle(): Record<(typeof MANAGED)[number], string> {
  return {
    backgroundColor: setting("bg") === "token" ? "var(--colorNeutralBackground3, #F5F5F5)" : TINT,
    color: "#C50F1F",
    fontWeight: "700",
    fontStyle: "italic",
    textDecoration: "underline",
  };
}

function observe(dataType: ColumnDataType, props: CellRendererProps, params: GetRendererParams): void {
  const column = params.colDefs[params.columnIndex];
  const rowData = params.rowData as unknown as Record<string, unknown> | undefined;
  const recId = rowData ? String(rowData[RECID]) : "(none)";

  record(`V1 colDefs`, params.colDefs);
  record(`V1 props for ${dataType}`, {
    column: column?.name,
    value: props.value,
    valueType: Array.isArray(props.value) ? "array" : typeof props.value,
    formattedValue: props.formattedValue,
    columnDataType: props.columnDataType,
    hasCellContainerElement: Boolean(props.cellContainerElement),
    isRightAligned: props.isRightAligned,
    columnEditable: props.columnEditable,
    rowHeight: props.rowHeight,
  });
  if (column) {
    record(`V1 rowData value for ${dataType} column ${column.name}`, rowData?.[column.name]);
    const value = rowData?.[column.name];
    if (value !== null && value !== undefined && value !== "") record(`V1 non-empty rowData value for ${dataType} column ${column.name}`, value);
  }

  // Sample rows once per view (column set), so switching views captures each layout.
  const colNames = params.colDefs.map((c) => c.name);
  const view = colNames.join(",");
  const viewKey = `${view}|${recId}`;
  if (rowData && !rowsLogged.has(viewKey) && [...rowsLogged].filter((k) => k.startsWith(`${view}|`)).length < 2) {
    rowsLogged.add(viewKey);
    const rowKeys = Object.keys(rowData);
    record(`V1 rowData sample (${colNames.length} columns, ${recId})`, rowData);
    record(`V2 rowData keys vs visible columns (${colNames.length} columns)`, {
      rowKeys,
      visibleColumns: colNames,
      inRowDataButNotVisible: rowKeys.filter((k) => !colNames.includes(k)),
      visibleButNotInRowData: colNames.filter((c) => !rowKeys.includes(c)),
    });
  }
  const choiceColumns = params.colDefs.filter((c) => c.dataType === "OptionSet" || c.dataType === "MultiSelectPicklist").map((c) => c.name);
  onColumns?.(choiceColumns);

  const container = props.cellContainerElement;
  if (container) {
    const style = getComputedStyle(container);
    record(`V7 computed container style for ${dataType} (before)`, {
      backgroundColor: style.backgroundColor,
      color: style.color,
      fontWeight: style.fontWeight,
      colorNeutralBackground3Var: style.getPropertyValue("--colorNeutralBackground3"),
    });
  }
}

/**
 * Technique 1 (V6): style the cell container, return null so the built-in renderer draws the content.
 * The grid theme sets .ag-cell background-color with !important, so a plain inline background loses.
 * wb_spike_bgmode picks how to get past it:
 *   "gradient" (default) paints the tint as a background-image layer, which the theme rules don't touch,
 *              so hover/selection colours still show through a translucent tint;
 *   "important" sets background-color inline with !important (beats the theme, but hides hover/selection);
 *   "plain"     the original inline background-color (shown to lose).
 */
function styleContainer(props: CellRendererProps, styled: boolean): void {
  const container = props.cellContainerElement;
  if (!container) return;
  const style = testStyle();
  const bgMode = setting("bgmode") ?? "gradient";
  record("V6 background mode", bgMode);
  // Always set or reset every managed property: the grid virtualises and reuses containers.
  for (const property of MANAGED) {
    if (property !== "backgroundColor") container.style[property] = styled ? style[property] : "";
  }
  container.style.removeProperty("background-color");
  container.style.backgroundImage = "";
  if (!styled) return;
  if (bgMode === "gradient") container.style.backgroundImage = `linear-gradient(${style.backgroundColor}, ${style.backgroundColor})`;
  else if (bgMode === "important") container.style.setProperty("background-color", style.backgroundColor, "important");
  else container.style.backgroundColor = style.backgroundColor;
}

function render(dataType: ColumnDataType, props: CellRendererProps, params: GetRendererParams): React.ReactElement | null {
  countRendererCall();
  try {
    observe(dataType, props, params);
    const rowData = params.rowData as unknown as Record<string, unknown> | undefined;
    const styled = rowData ? isStyledRow(String(rowData[RECID])) : false;
    const mode = setting("style") ?? "rag";
    record("V6 technique in use", { mode, bg: setting("bg") ?? "tint" });

    if (mode === "rag") {
      // RAG demo: whole-row tint in the row's option colour, RAG cell drawn as a pill.
      styleContainer(props, false);
      const colour = ragColour(rowData);
      const container = props.cellContainerElement;
      if (container && colour) container.style.backgroundImage = `linear-gradient(${tint(colour)}, ${tint(colour)})`;
      const column = params.colDefs[params.columnIndex];
      if (colour && column?.name === ragColumn()) {
        return (
          <div
            style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 8px", boxSizing: "border-box" }}
            onClick={props.onCellClicked}
          >
            <span style={pillStyle(colour)}>{props.formattedValue}</span>
          </div>
        );
      }
      return null;
    }
    if (mode === "container") {
      styleContainer(props, styled);
      return null;
    }
    if (mode === "render" && SIMPLE_TYPES.has(dataType)) {
      // Technique 3: draw simple types ourselves inside a full-size styled box.
      styleContainer(props, false);
      return (
        <div
          style={{
            ...(styled ? testStyle() : {}),
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: props.isRightAligned ? "flex-end" : "flex-start",
            padding: "0 8px",
            boxSizing: "border-box",
          }}
          onClick={props.onCellClicked}
        >
          {props.formattedValue}
        </div>
      );
    }
    styleContainer(props, false);
    return null;
  } catch (e) {
    record(`Renderer error for ${dataType}`, describe(e));
    return null;
  }
}

export const cellRendererOverrides: CellRendererOverrides = Object.fromEntries(
  ALL_TYPES.map((dataType) => [dataType, (props: CellRendererProps, params: GetRendererParams) => render(dataType, props, params)])
) as CellRendererOverrides;
