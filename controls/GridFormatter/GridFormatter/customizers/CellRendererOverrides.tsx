// Cell renderers for every column type (issue #13). Each call styles the cell
// container (V6) and returns our own content only where a rule needs it (V7);
// everything else returns null so the grid draws its own cell. The decisions
// are made by the pure `engine/cellFormatter.ts`; this file only applies them.
import * as React from "react";
import { applyContainerStyle, type CellFormatter } from "../engine/cellFormatter";
import type { Warn } from "../engine/warnings";
import { Pill } from "../components/Pill";
import { StyledCell } from "../components/StyledCell";
import type { CellRendererOverrides, CellRendererProps, ColumnDataType, GetRendererParams } from "../types";

/** Every `ColumnDataType` in `types.ts`. The check below fails to compile if one is missing. */
const ALL_TYPES = [
	"Text", "Email", "Phone", "Ticker", "URL", "TextArea", "Lookup", "Customer", "Owner",
	"MultiSelectPicklist", "OptionSet", "TwoOptions", "Duration", "Language", "Multiple", "TimeZone",
	"Integer", "Currency", "Decimal", "FloatingPoint", "AutoNumber", "DateOnly", "DateAndTime",
	"Image", "File", "Persona", "RichText", "UniqueIdentifier",
] as const satisfies readonly ColumnDataType[];
const everyTypeOverridden: [Exclude<ColumnDataType, (typeof ALL_TYPES)[number]>] extends [never] ? true : never = true;

function renderCell(formatter: CellFormatter, warn: Warn, props: CellRendererProps, params: GetRendererParams): React.ReactElement | null {
	try {
		const { container, content } = formatter.format({
			colDefs: params.colDefs,
			columnIndex: params.columnIndex,
			rowData: params.rowData,
			formattedValue: props.formattedValue,
		});
		applyContainerStyle(props.cellContainerElement, container);
		const text = props.formattedValue ?? "";
		if (content.kind === "pill") {
			return <Pill text={text} pill={content.pill} fontWeight={content.fontWeight} isRightAligned={props.isRightAligned} onClick={props.onCellClicked} />;
		}
		if (content.kind === "text") {
			return (
				<StyledCell
					text={text}
					color={content.color}
					fontWeight={content.fontWeight}
					isRightAligned={props.isRightAligned}
					onClick={props.onCellClicked}
				/>
			);
		}
		return null;
	} catch (error) {
		warn(`a cell renderer failed, so the cell is drawn as normal (${String(error)}).`);
		return null;
	}
}

/** Renderer overrides for every column type, all backed by one grid's formatter. */
export function createCellRendererOverrides(formatter: CellFormatter, warn: Warn): CellRendererOverrides {
	void everyTypeOverridden;
	const overrides: CellRendererOverrides = {};
	for (const dataType of ALL_TYPES) {
		overrides[dataType] = (props, params) => renderCell(formatter, warn, props, params);
	}
	return overrides;
}
