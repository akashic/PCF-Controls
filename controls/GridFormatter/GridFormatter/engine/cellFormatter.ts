/**
 * What the cell renderers do for one cell, as pure decisions (issue #13).
 *
 * The renderer (`customizers/CellRendererOverrides.tsx`) calls
 * `formatter.format(...)` for every cell, then:
 *
 * 1. writes `decision.container` to the cell container with
 *    `applyContainerStyle`, always setting or clearing the three managed
 *    properties, because the grid reuses containers (V6);
 * 2. draws `decision.content`: `"grid"` returns `null` so the grid draws its
 *    own content, `"text"` draws `formattedValue` with a colour or weight
 *    (V7), `"pill"` draws a pill.
 *
 * The formatter wires the engine together: `prepareRules` once per column set,
 * a row-style cache per column set (emptied at the user's local midnight, since
 * date operators depend on "today"), and `evaluate` as the rule matcher. It never
 * throws: a failure draws the plain grid cell with one warning.
 */
import { backgroundLayer, type OptionColours, type PillSpec, type ValueGetter } from "./colours";
import type { TableConfig } from "./configSchema";
import { evaluate } from "./conditions";
import { toLocalDate, type TimeZoneOffset } from "./dates";
import {
	canDrawCell,
	createRowStyleCache,
	prepareRules,
	type CellStyle,
	type GridColumn,
	type PreparedRules,
	type RowStyleCache,
} from "./resolveStyle";
import { NOT_VISIBLE, readColumn, type ColumnValue } from "./rowValues";
import { consoleWarn, type Warn } from "./warnings";

// Container ---------------------------------------------------------------------

/** The cell-container properties the control manages. `""` clears one. Nothing else on the container is touched. */
export interface ContainerStyle {
	readonly backgroundImage: string;
	readonly fontStyle: string;
	readonly textDecoration: string;
}

/** Every managed property cleared. */
export const CLEAR_CONTAINER: ContainerStyle = Object.freeze({ backgroundImage: "", fontStyle: "", textDecoration: "" });

/**
 * The container properties for a cell's style: the background as a
 * `background-image` layer (V6), and font style and decoration, which the
 * grid's content inherits (V7). Missing properties are cleared.
 */
export function containerStyle(cell: CellStyle | undefined): ContainerStyle {
	if (!cell) return CLEAR_CONTAINER;
	return {
		backgroundImage: cell.backgroundColor === undefined ? "" : backgroundLayer(cell.backgroundColor),
		fontStyle: cell.fontStyle ?? "",
		textDecoration: cell.textDecoration ?? "",
	};
}

/** The part of an `HTMLElement` that `applyContainerStyle` writes. */
export interface StylableElement {
	readonly style: { backgroundImage: string; fontStyle: string; textDecoration: string };
}

/** Sets (or clears) exactly the managed properties on the cell container. Does nothing without a container. */
export function applyContainerStyle(element: StylableElement | null | undefined, style: ContainerStyle): void {
	if (!element) return;
	element.style.backgroundImage = style.backgroundImage;
	element.style.fontStyle = style.fontStyle;
	element.style.textDecoration = style.textDecoration;
}

// Content -----------------------------------------------------------------------

/** How to draw the cell's content. */
export type CellContent =
	| { readonly kind: "grid" }
	| { readonly kind: "text"; readonly color?: string; readonly fontWeight?: number }
	| { readonly kind: "pill"; readonly pill: PillSpec; readonly fontWeight?: number };

const GRID_CONTENT: CellContent = Object.freeze({ kind: "grid" });

/**
 * `"pill"` or `"text"` when the cell needs drawing by the control
 * (`customRender`) and may be (`canDrawCell`, so never the primary name);
 * otherwise `"grid"`. An empty cell is always left to the grid.
 */
export function cellContent(cell: CellStyle | undefined, column: GridColumn, formattedValue: string | undefined): CellContent {
	if (!cell?.customRender || !canDrawCell(column) || !formattedValue) return GRID_CONTENT;
	if (cell.pill) return { kind: "pill", pill: cell.pill, fontWeight: cell.fontWeight };
	return { kind: "text", color: cell.color, fontWeight: cell.fontWeight };
}

/** Everything the renderer does to one cell. */
export interface CellDecision {
	readonly container: ContainerStyle;
	readonly content: CellContent;
}

/** The plain grid cell: managed properties cleared, the grid draws the content. */
export const PLAIN_CELL: CellDecision = Object.freeze({ container: CLEAR_CONTAINER, content: GRID_CONTENT });

// Today -------------------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Tracks the user's local date ("today"), recomputing it at local midnight. */
export interface DayTracker {
	/** Today as `YYYY-MM-DD`, or `""` when the time-zone offset can't be read (day operators are then `false`). */
	today(): string;
}

function offsetMinutes(offset: TimeZoneOffset, instant: Date): number | null {
	try {
		const minutes = typeof offset === "function" ? offset(instant) : offset;
		return typeof minutes === "number" && Number.isFinite(minutes) ? minutes : null;
	} catch {
		return null;
	}
}

/** When to work out "today" again: the next local midnight, but at most an hour away (DST changes). */
function nextCheck(nowMs: number, today: string, offset: TimeZoneOffset): number {
	if (today === "") return nowMs + MINUTE;
	const [year, month, day] = today.split("-").map(Number);
	const midnightWallClock = Date.UTC(year, month - 1, day + 1);
	const minutes = offsetMinutes(offset, new Date(midnightWallClock));
	const midnight = minutes === null ? NaN : midnightWallClock - minutes * MINUTE;
	// Already past the estimate but still the same day (an offset change): look again in a minute.
	return midnight > nowMs ? Math.min(midnight, nowMs + HOUR) : nowMs + MINUTE;
}

/** "Today" for `offset` (positive east of UTC), computed with `toLocalDate(new Date(), offset)`. */
export function createDayTracker(offset: TimeZoneOffset, now: () => number = Date.now): DayTracker {
	let today = "";
	let checkAt = -Infinity;
	return {
		today() {
			const nowMs = now();
			if (nowMs >= checkAt) {
				today = toLocalDate(new Date(nowMs), offset) ?? "";
				checkAt = nextCheck(nowMs, today, offset);
			}
			return today;
		},
	};
}

// Formatter ---------------------------------------------------------------------

/** What the renderer passes in for one cell (from its `props` and `rendererParams`). */
export interface CellParams {
	/** `rendererParams.colDefs`. */
	readonly colDefs: readonly unknown[];
	/** `rendererParams.columnIndex`: this cell's index in `colDefs`. */
	readonly columnIndex: number;
	/** `rendererParams.rowData`. Absent for loading rows. */
	readonly rowData?: unknown;
	/** `props.formattedValue`. */
	readonly formattedValue?: string;
}

export interface FormatterOptions {
	/** The validated config, or `null` for the plain grid (no file, invalid file or load timeout). */
	readonly config: TableConfig | null;
	readonly optionColours?: OptionColours;
	/** The user's UTC offset, e.g. `(d) => context.userSettings.getTimeZoneOffsetMinutes(d)`. */
	readonly offset: TimeZoneOffset;
	/** Clock, for tests. */
	readonly now?: () => number;
	/** One `createWarnOnce()` per page. */
	readonly warn?: Warn;
	/** Set to log which rules matched each row (`sessionStorage['wb_GridFormatDebug'] === '1'`). */
	readonly debug?: (message: string) => void;
}

export interface CellFormatter {
	format(params: CellParams): CellDecision;
}

/** Rules prepared for one column set, and its row cache. */
interface PreparedGrid {
	readonly columns: ReadonlyMap<string, GridColumn>;
	/** Column name → `colDefs[].dataType`, for `readColumn`. */
	readonly types: ReadonlyMap<string, string>;
	readonly prepared: PreparedRules;
	readonly cache: RowStyleCache;
}

/** Column sets kept prepared at once (a view switch changes the column set). */
const MAX_COLUMN_SETS = 8;
/** Debug log keys kept before starting again. */
const MAX_LOGGED_ROWS = 5000;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** The grid's columns from `colDefs`, skipping malformed entries. */
export function gridColumns(colDefs: readonly unknown[]): GridColumn[] {
	if (!Array.isArray(colDefs)) return [];
	return colDefs.flatMap((def): GridColumn[] =>
		isRecord(def) && typeof def.name === "string" && typeof def.dataType === "string"
			? [{ name: def.name, dataType: def.dataType, isPrimary: def.isPrimary === true }]
			: [],
	);
}

const signatureOf = (columns: readonly GridColumn[]): string =>
	columns.map((c) => `${c.name}:${c.dataType}:${c.isPrimary === true ? 1 : 0}`).join("|");

/** A cell formatter for one grid. With no config (or no rules) every cell is {@link PLAIN_CELL}. */
export function createCellFormatter(options: FormatterOptions): CellFormatter {
	const { config, optionColours = new Map(), offset, now = Date.now, warn = consoleWarn, debug } = options;
	if (!config || config.rules.length === 0) return { format: () => PLAIN_CELL };
	const tableConfig: TableConfig = config;

	const day = createDayTracker(offset, now);
	const grids = new Map<string, PreparedGrid>();
	let lastColDefs: unknown = null;
	let lastGrid: PreparedGrid | null = null;
	let cacheDay: string | null = null;
	const logged = new Set<string>();

	function gridFor(colDefs: readonly unknown[]): PreparedGrid {
		if (colDefs === lastColDefs && lastGrid) return lastGrid;
		const columns = gridColumns(colDefs);
		const signature = signatureOf(columns);
		let grid = grids.get(signature);
		if (!grid) {
			if (grids.size >= MAX_COLUMN_SETS) grids.clear();
			const prepared = prepareRules({ config: tableConfig, columns, optionColours, warn });
			grid = {
				columns: new Map(columns.map((c) => [c.name, c])),
				types: new Map(columns.map((c) => [c.name, c.dataType])),
				prepared,
				cache: createRowStyleCache(prepared),
			};
			grids.set(signature, grid);
		}
		lastColDefs = colDefs;
		lastGrid = grid;
		return grid;
	}

	function logMatches(log: (message: string) => void, recordId: string, ruleIds: readonly string[]): void {
		const key = `${recordId}\u0000${ruleIds.join(",")}`;
		if (logged.has(key)) return;
		if (logged.size >= MAX_LOGGED_ROWS) logged.clear();
		logged.add(key);
		log(`row ${recordId}: ${ruleIds.length > 0 ? `matched ${ruleIds.join(", ")}` : "no rules matched"}`);
	}

	function format({ colDefs, columnIndex, rowData, formattedValue }: CellParams): CellDecision {
		const today = day.today();
		if (today !== cacheDay) {
			// A new day: date operators may give different results, so start every row cache again.
			cacheDay = today;
			grids.forEach((grid) => grid.cache.clear());
		}
		const grid = gridFor(colDefs);
		const def: unknown = Array.isArray(colDefs) ? colDefs[columnIndex] : undefined;
		const column = isRecord(def) && typeof def.name === "string" ? grid.columns.get(def.name) : undefined;
		if (!column || !isRecord(rowData) || grid.prepared.rules.length === 0) return PLAIN_CELL;

		const getColumn = (name: string): ColumnValue => readColumn(rowData, name, grid.types.get(name));
		const getValue: ValueGetter = (name) => {
			const value = getColumn(name);
			return value === NOT_VISIBLE ? undefined : value;
		};
		const rawId = rowData.__rec_id;
		const recordId = typeof rawId === "string" ? rawId : "";
		const styles = grid.cache.get(recordId, getValue, (rule) => rule.when !== undefined && evaluate(rule.when, getColumn, today, offset));
		if (debug) logMatches(debug, recordId, styles.matchedRuleIds);

		const cell = styles.cells.get(column.name);
		return { container: containerStyle(cell), content: cellContent(cell, column, formattedValue) };
	}

	return {
		format(params) {
			try {
				return format(params);
			} catch (error) {
				warn(`a cell couldn't be formatted, so it's drawn as normal (${String(error)}).`);
				return PLAIN_CELL;
			}
		},
	};
}
