// Smoke test of the renderers and components (outside the coverage gate; checked in dev too).
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CLEAR_CONTAINER, type CellDecision, type CellFormatter } from "../GridFormatter/engine/cellFormatter";
import { createCellRendererOverrides } from "../GridFormatter/customizers/CellRendererOverrides";
import type { CellRendererProps, GetRendererParams } from "../GridFormatter/types";

const params: GetRendererParams = { colDefs: [{ name: "wb_duedate", dataType: "DateOnly", isPrimary: false }], columnIndex: 0 };

function render(decision: CellDecision | Error, props: Partial<CellRendererProps> = {}) {
	const warnings: string[] = [];
	const formatter: CellFormatter = {
		format: () => {
			if (decision instanceof Error) throw decision;
			return decision;
		},
	};
	const container = { style: { backgroundImage: "x", fontStyle: "x", textDecoration: "x" } };
	const overrides = createCellRendererOverrides(formatter, (m) => warnings.push(m));
	const element = overrides.DateOnly?.({ value: null, formattedValue: "18/10/2026", cellContainerElement: container as unknown as HTMLElement, ...props }, params);
	return { overrides, element, container, warnings, html: element ? renderToStaticMarkup(element) : null };
}

describe("cell renderers", () => {
	it("override every column type", () => {
		expect(Object.keys(render({ container: CLEAR_CONTAINER, content: { kind: "grid" } }).overrides)).toHaveLength(28);
	});

	it("style the container and return null when the grid draws the content", () => {
		const { element, container } = render({ container: { backgroundImage: "linear-gradient(red, red)", fontStyle: "italic", textDecoration: "" }, content: { kind: "grid" } });
		expect(element).toBeNull();
		expect(container.style).toEqual({ backgroundImage: "linear-gradient(red, red)", fontStyle: "italic", textDecoration: "" });
	});

	it("draw text with colour and weight, right-aligned when the grid says so", () => {
		const { html } = render({ container: CLEAR_CONTAINER, content: { kind: "text", color: "#C50F1F", fontWeight: 700 } }, { isRightAligned: true });
		expect(html).toContain("justify-content:flex-end");
		expect(html).toContain('<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#C50F1F;font-weight:700" title="18/10/2026">18/10/2026</span>');
	});

	it("draw a pill with its fill, text colour and the label as text", () => {
		const { html } = render({ container: CLEAR_CONTAINER, content: { kind: "pill", pill: { backgroundColor: "#FFB900", color: "#000000" } as never } });
		expect(html).toContain("background-color:#FFB900;color:#000000");
		expect(html).toContain("font-weight:600");
		expect(html).toContain(">18/10/2026</span>");
	});

	it("forward clicks to the grid", () => {
		const onCellClicked = jest.fn();
		const { element } = render({ container: CLEAR_CONTAINER, content: { kind: "text" } }, { onCellClicked });
		(element as React.ReactElement<{ onClick: () => void }>).props.onClick();
		expect(onCellClicked).toHaveBeenCalled();
	});

	it("never throw: a failure returns null with a warning, and clears the reused container", () => {
		const { element, warnings, container } = render(new Error("boom"));
		expect(element).toBeNull();
		expect(warnings).toEqual(["a cell renderer failed, so the cell is drawn as normal (Error: boom)."]);
		expect(container.style).toEqual({ backgroundImage: "", fontStyle: "", textDecoration: "" });
	});

	it("still returns null when the container can't be cleared either", () => {
		const style = {
			set backgroundImage(_value: string) {
				throw new Error("read-only");
			},
		};
		const { element, warnings } = render(new Error("boom"), { cellContainerElement: { style } as unknown as HTMLElement });
		expect(element).toBeNull();
		expect(warnings).toHaveLength(1);
	});
});
