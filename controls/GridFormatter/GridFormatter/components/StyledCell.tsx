import * as React from "react";

export interface StyledCellProps {
	/** The grid's `formattedValue`: exactly the text the grid would show. */
	readonly text: string;
	readonly color?: string;
	readonly fontWeight?: number;
	readonly isRightAligned?: boolean;
	/** The grid's `onCellClicked`, so selecting and editing work as in a normal cell. */
	readonly onClick?: (event: React.MouseEvent<HTMLElement>) => void;
}

/** Full-size box laid out like the grid's own simple cells (the spike's "render" technique, V7). */
export const cellBoxStyle = (isRightAligned: boolean | undefined): React.CSSProperties => ({
	width: "100%",
	height: "100%",
	display: "flex",
	alignItems: "center",
	justifyContent: isRightAligned ? "flex-end" : "flex-start",
	padding: "0 8px",
	boxSizing: "border-box",
	overflow: "hidden",
});

const textStyle: React.CSSProperties = {
	minWidth: 0,
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
};

/**
 * A simple cell's value drawn by the control, for the text colour and weight the
 * grid's own content ignores (V7). Italic and underline come from the container.
 */
export function StyledCell({ text, color, fontWeight, isRightAligned, onClick }: StyledCellProps): React.ReactElement {
	return (
		<div style={cellBoxStyle(isRightAligned)} onClick={onClick}>
			<span style={{ ...textStyle, color, fontWeight }} title={text}>
				{text}
			</span>
		</div>
	);
}
