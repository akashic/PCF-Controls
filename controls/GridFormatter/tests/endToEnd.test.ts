// End to end without the grid: the config web resource (Base64, as Dataverse returns it)
// and spike-shaped metadata go through the real stores and the cell formatter, and every
// cell of the rowData captured in the spike gets its container styles and render decision.
import { BLACK, WHITE } from "@wb-pcf/shared";
import { CLEAR_CONTAINER, applyContainerStyle, createCellFormatter, type CellDecision, type ContainerStyle } from "../GridFormatter/engine/cellFormatter";
import { createWarnOnce } from "../GridFormatter/engine/warnings";
import { createConfigStore } from "../GridFormatter/stores/configStore";
import { createMetadataStore } from "../GridFormatter/stores/metadataStore";
import { loadFormatting } from "../GridFormatter/stores/startup";
import { AMBER, GREEN, RAG_OPTIONS, UNKNOWN, exampleBase64, rowDataFixture, spikeMetadata } from "./engineHelpers";

const fixture = rowDataFixture();
const { colDefs } = fixture;
const [row01, row02] = fixture.rows; // 01: Amber, due 18 Oct, under budget. 02: Green, due 19 Oct, over budget.
const AEST = fixture.user.timeZoneOffsetMinutes; // 600
const NOON_22_OCT = Date.parse("2026-10-22T02:00:00Z"); // the capture date, at UTC+10

const layer = (css: string): string => `linear-gradient(${css}, ${css})`;
const AMBER_TINT = layer("rgba(255, 185, 0, 0.18)");
const GREEN_TINT = layer("rgba(16, 124, 16, 0.18)");
const OVER_BUDGET_TINT = layer("rgba(197, 15, 31, 0.12)");
const GREY_TINT = layer("color-mix(in srgb, var(--colorNeutralForeground3, #616161) 18%, transparent)");
const GREY_TEXT = "var(--colorNeutralForeground3, #616161)";
const OVERDUE_TEXT = "var(--colorPaletteRedForeground1, #bc2f32)";

const tinted = (backgroundImage: string, extra: Partial<ContainerStyle> = {}): ContainerStyle => ({ ...CLEAR_CONTAINER, backgroundImage, ...extra });
const GRID = { kind: "grid" } as const;

/** A page with `wb_/GridFormatter/<table>.json` holding the named example. */
async function page(example: string | null, table = "wb_gridspike") {
	const warnings: string[] = [];
	const infos: string[] = [];
	const debug: string[] = [];
	const warn = createWarnOnce((m) => warnings.push(m));
	const webAPI = {
		retrieveMultipleRecords: (_entity: string, options?: string) =>
			Promise.resolve({
				entities: example && options?.includes(`'wb_/GridFormatter/${table}.json'`) ? [{ name: "x", content: exampleBase64(example) }] : [],
			}),
	};
	const metadataCalls: unknown[] = [];
	const utils = {
		getEntityMetadata: (entity: string, columns?: string[]) => {
			metadataCalls.push([entity, columns]);
			return Promise.resolve(spikeMetadata({ wb_ragstatus: RAG_OPTIONS }));
		},
	};
	const formatting = await loadFormatting(table, {
		configStore: createConfigStore({ warn, info: (m) => infos.push(m) }),
		metadataStore: createMetadataStore({ warn }),
		webAPI,
		utils,
	});
	const formatter = createCellFormatter({ ...formatting, offset: AEST, now: () => NOON_22_OCT, warn, debug: (m) => debug.push(m) });
	return { formatter, warnings, infos, debug, metadataCalls };
}

/** What the grid would show in the cell. */
function formattedValue(row: Record<string, unknown>, column: string): string {
	const value = row[column];
	if (value === null || value === undefined) return "";
	if (column === "wb_ragstatus") return ({ [AMBER]: "Amber", [GREEN]: "Green", [UNKNOWN]: "Unknown" } as Record<string, string>)[String(value)] ?? "Red";
	return fixture.formattedValues[column] ?? String(value);
}

/** Every cell of `row`, as the renderers see it, by column name. */
function formatRow(formatter: ReturnType<typeof createCellFormatter>, row: Record<string, unknown>, defs: readonly { name: string }[] = colDefs) {
	return Object.fromEntries(
		defs.map((def, columnIndex) => [def.name, formatter.format({ colDefs: defs, columnIndex, rowData: row, formattedValue: formattedValue(row, def.name) })]),
	) as Record<string, CellDecision>;
}

const allColumns = colDefs.map((c) => c.name);

describe("wb_gridspike.json on the captured wb_gridspike rows", () => {
	it("loads the web resource and the RAG option colours once", async () => {
		const { warnings, infos, metadataCalls } = await page("wb_gridspike");
		expect(warnings).toEqual([]);
		expect(infos).toEqual([]);
		expect(metadataCalls).toEqual([["wb_gridspike", ["wb_ragstatus"]]]);
	});

	it("row 01 (Amber, overdue): amber tint everywhere, an Amber pill and a bold red due date", async () => {
		const { formatter, debug } = await page("wb_gridspike");
		const cells = formatRow(formatter, row01);
		for (const column of allColumns) expect(cells[column].container).toEqual(tinted(AMBER_TINT));
		expect(cells.wb_ragstatus.content).toEqual({ kind: "pill", pill: { backgroundColor: "#FFB900", color: BLACK } });
		expect(cells.wb_duedate.content).toEqual({ kind: "text", color: OVERDUE_TEXT, fontWeight: 700 });
		const drawn = allColumns.filter((c) => cells[c].content.kind !== "grid");
		expect(drawn).toEqual(["wb_ragstatus", "wb_duedate"]);
		expect(debug).toEqual(["row 4c2ddcfb-c2cd-f111-a05b-70a8a59b69e5: matched rag-row, rag-pill, overdue"]);
	});

	it("row 02 (Green, over budget): green tint, a Green pill, and the over-budget cell wins its own background", async () => {
		const { formatter } = await page("wb_gridspike");
		const cells = formatRow(formatter, row02);
		for (const column of allColumns.filter((c) => c !== "wb_actualcost")) expect(cells[column].container).toEqual(tinted(GREEN_TINT));
		expect(cells.wb_actualcost).toEqual({
			container: tinted(OVER_BUDGET_TINT),
			content: { kind: "text", color: "var(--colorPaletteRedForeground1, #bc2f32)", fontWeight: 600 },
		});
		expect(cells.wb_ragstatus.content).toEqual({ kind: "pill", pill: { backgroundColor: "#107C10", color: WHITE } });
		expect(cells.wb_duedate.content).toEqual(GRID); // Green is never overdue
	});

	it("an inactive row: grey and italic, grey text only where the control may draw, and no other rule (stop)", async () => {
		const { formatter, warnings } = await page("wb_gridspike");
		const cells = formatRow(formatter, { ...row01, statecode: "1", wb_flagged: true });
		for (const column of allColumns) expect(cells[column].container).toEqual(tinted(GREY_TINT, { fontStyle: "italic" }));
		const notDrawn = ["wb_name", "wb_tags", "wb_parentid", "ownerid"]; // primary name, multi-select, lookup, Owner (V7)
		for (const column of allColumns) {
			const expected = notDrawn.includes(column) || formattedValue(row01, column) === "" ? GRID : { kind: "text", color: GREY_TEXT };
			expect([column, cells[column].content]).toEqual([column, expected]);
		}
		expect(warnings).toEqual(
			notDrawn.map((c) => expect.stringContaining(`rule "inactive-grey": color can't be shown on column "${c}"`) as string),
		);
	});

	it("a flagged row: the primary name is underlined on the container, and still drawn by the grid", async () => {
		const { formatter } = await page("wb_gridspike");
		const cells = formatRow(formatter, { ...row02, wb_flagged: true });
		expect(cells.wb_name).toEqual({ container: tinted(GREEN_TINT, { textDecoration: "underline" }), content: GRID });
	});

	it("an option with no colour, or no RAG value, leaves the row plain apart from the overdue date", async () => {
		const { formatter } = await page("wb_gridspike");
		for (const rag of [String(UNKNOWN), null]) {
			const cells = formatRow(formatter, { ...row01, wb_ragstatus: rag });
			for (const column of allColumns.filter((c) => c !== "wb_duedate")) expect(cells[column]).toEqual({ container: CLEAR_CONTAINER, content: GRID });
			expect(cells.wb_duedate).toEqual({ container: CLEAR_CONTAINER, content: { kind: "text", color: OVERDUE_TEXT, fontWeight: 700 } });
		}
	});

	it("a view without the rules' columns is the plain grid (V2)", async () => {
		const { formatter } = await page("wb_gridspike");
		const nameAndCreated = colDefs.filter((c) => c.name === "wb_name" || c.name === "createdon");
		const cells = formatRow(formatter, { __rec_id: row01.__rec_id, wb_name: row01.wb_name, createdon: row01.createdon }, nameAndCreated);
		expect(Object.values(cells)).toEqual([
			{ container: CLEAR_CONTAINER, content: GRID },
			{ container: CLEAR_CONTAINER, content: GRID },
		]);
	});

	it("always sets or clears the container, which the grid reuses between rows", async () => {
		const { formatter } = await page("wb_gridspike");
		const container = { style: { backgroundImage: "", fontStyle: "", textDecoration: "", color: "untouched" } };
		const rows = [{ ...row01, statecode: "1" }, row02, { ...row01, wb_ragstatus: null }];
		const seen = rows.map((row) => {
			applyContainerStyle(container, formatRow(formatter, row).wb_name.container);
			return { ...container.style };
		});
		expect(seen).toEqual([
			{ backgroundImage: GREY_TINT, fontStyle: "italic", textDecoration: "", color: "untouched" },
			{ backgroundImage: GREEN_TINT, fontStyle: "", textDecoration: "", color: "untouched" },
			{ backgroundImage: "", fontStyle: "", textDecoration: "", color: "untouched" },
		]);
	});
});

describe("other example configs on the captured rows", () => {
	it("combined.json: same tint and overdue date, no pill", async () => {
		const { formatter, warnings } = await page("combined");
		const one = formatRow(formatter, row01);
		expect(one.wb_ragstatus).toEqual({ container: tinted(AMBER_TINT), content: GRID });
		expect(one.wb_duedate.content).toEqual({ kind: "text", color: OVERDUE_TEXT, fontWeight: 700 });
		const two = formatRow(formatter, row02);
		expect(two.wb_actualcost).toEqual({ container: tinted(GREEN_TINT), content: GRID });
		// Its inactive rule sets a row-wide text colour, which four columns can't show (V7).
		expect(warnings).toHaveLength(4);
	});

	it("rag-cell.json: only the RAG cell, as a pill, with no tint", async () => {
		const { formatter } = await page("rag-cell");
		const cells = formatRow(formatter, row01);
		expect(cells.wb_ragstatus).toEqual({ container: CLEAR_CONTAINER, content: { kind: "pill", pill: { backgroundColor: "#FFB900", color: BLACK } } });
		for (const column of allColumns.filter((c) => c !== "wb_ragstatus")) expect(cells[column]).toEqual({ container: CLEAR_CONTAINER, content: GRID });
	});

	it("over-budget.json: only row 02's actual cost", async () => {
		const { formatter } = await page("over-budget");
		expect(formatRow(formatter, row01).wb_actualcost).toEqual({ container: CLEAR_CONTAINER, content: GRID });
		expect(formatRow(formatter, row02).wb_actualcost).toEqual({
			container: tinted(OVER_BUDGET_TINT),
			content: { kind: "text", color: "var(--colorPaletteRedForeground1, #bc2f32)", fontWeight: 600 },
		});
	});

	it("no web resource for the table: the plain grid, one info line, no warning and no metadata call", async () => {
		const { formatter, warnings, infos, metadataCalls } = await page(null);
		const cells = formatRow(formatter, row01);
		for (const column of allColumns) expect(cells[column]).toEqual({ container: CLEAR_CONTAINER, content: GRID });
		expect(warnings).toEqual([]);
		expect(infos).toEqual(["no config web resource wb_/GridFormatter/wb_gridspike.json; the grid is shown without formatting."]);
		expect(metadataCalls).toEqual([]);
	});
});
