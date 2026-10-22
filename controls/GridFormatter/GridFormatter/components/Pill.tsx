import * as React from "react";
import type { PillSpec } from "../engine/colours";
import { cellBoxStyle } from "./StyledCell";

export interface PillProps {
	/** The grid's `formattedValue`, e.g. the option label. */
	readonly text: string;
	/** Solid fill and its black or white text colour (`bestTextColor`). */
	readonly pill: PillSpec;
	/** A rule's `fontWeight`; semibold by default. */
	readonly fontWeight?: number;
	readonly isRightAligned?: boolean;
	readonly onClick?: (event: React.MouseEvent<HTMLElement>) => void;
}

/**
 * A `display: "pill"` cell. The label stays real text, so screen readers and
 * copying work as in a normal cell, and colour is never the only signal.
 */
export function Pill({ text, pill, fontWeight = 600, isRightAligned, onClick }: PillProps): React.ReactElement {
	return (
		<div style={cellBoxStyle(isRightAligned)} onClick={onClick}>
			<span
				title={text}
				style={{
					backgroundColor: pill.backgroundColor,
					color: pill.color,
					borderRadius: "999px",
					padding: "2px 10px",
					fontWeight,
					lineHeight: "20px",
					maxWidth: "100%",
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
				}}
			>
				{text}
			</span>
		</div>
	);
}
