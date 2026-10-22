/**
 * Reads a cell's raw value from the grid's `rowData` and normalises it to one
 * comparable shape per column type. Shapes are from spike V1
 * (`docs/decisions.md`, `tests/fixtures/rowdata.wb_gridspike.json`).
 *
 * `rowData` holds one key per column **in the view** (V2). A missing key means
 * the column isn't in the view; a `null` value means it's empty. Conditions
 * need to tell those apart, so {@link readColumn} returns {@link NOT_VISIBLE}
 * for the first and `null` for the second.
 *
 * Every function here is pure and never throws. Unknown column types and
 * malformed values give `null`.
 */

import { parseCalendarDate, parseIso, type CalendarDate } from "./dates";
import type { ColumnName } from "./configSchema";

/**
 * A normalised cell value:
 *
 * | Column type (`colDefs[].dataType`) | Value |
 * |---|---|
 * | `OptionSet` (choice, status, status reason), `Integer`, `Decimal`, `FloatingPoint`, `Currency`, `Duration`, `Language`, `TimeZone` | `number` |
 * | `MultiSelectPicklist` | `number[]` (never empty) |
 * | `TwoOptions` | `boolean` |
 * | `Lookup`, `Customer`, `Owner`, `Persona`, `UniqueIdentifier` | lower-case GUID `string` |
 * | `DateOnly` | {@link CalendarDate} (`YYYY-MM-DD`) |
 * | `DateAndTime` | `Date` |
 * | `Text`, `Email`, `Phone`, `URL`, `Ticker`, `TextArea`, `Multiple`, `RichText`, `AutoNumber` | `string` (never empty) |
 * | `Image`, `File`, anything else, or an empty or malformed value | `null` |
 */
export type RowValue = number | number[] | boolean | string | CalendarDate | Date | null;

/** Returned by {@link readColumn} when the column isn't in the view. */
export const NOT_VISIBLE: unique symbol = Symbol("GridFormatter.notVisible");
export type NotVisible = typeof NOT_VISIBLE;

/** A cell value, or {@link NOT_VISIBLE}. This is what conditions read. */
export type ColumnValue = RowValue | NotVisible;

/** The part of the grid's `colDefs[]` entries this module uses. */
export interface ColumnTypeInfo {
	readonly name: string;
	readonly dataType: string;
}

/** Grid bookkeeping keys in `rowData` that aren't columns. */
const RESERVED_KEYS = new Set(["__rec_id", "params"]);

const GUID = /^\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?$/i;
const INTEGER = /^\s*-?\d+\s*$/;
const NUMBER = /^\s*-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i;

type Normaliser = (raw: unknown) => RowValue;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toText(raw: unknown): string | null {
	return typeof raw === "string" && raw !== "" ? raw : null;
}

function toNumber(raw: unknown): number | null {
	if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
	return typeof raw === "string" && NUMBER.test(raw) ? Number(raw) : null;
}

/** Option values: the grid gives choices as strings (`"948790001"`); config uses numbers. */
function toOptionValue(raw: unknown): number | null {
	if (typeof raw === "number") return Number.isInteger(raw) ? raw : null;
	return typeof raw === "string" && INTEGER.test(raw) ? Number(raw) : null;
}

function toOptionValues(raw: unknown): number[] | null {
	if (!Array.isArray(raw) || raw.length === 0) return null;
	const values = raw.map(toOptionValue);
	return values.every((v): v is number => v !== null) ? values : null;
}

function toBoolean(raw: unknown): boolean | null {
	if (typeof raw === "boolean") return raw;
	if (raw === 1 || raw === "1" || raw === "true") return true;
	if (raw === 0 || raw === "0" || raw === "false") return false;
	return null;
}

/** Lower-case GUID without braces, or `null`. */
export function normalizeGuid(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const match = GUID.exec(raw.trim());
	return match ? match[1].toLowerCase() : null;
}

/** Lookups arrive as `{ id: { guid }, etn, name }`; a bare GUID or `{ id: "<guid>" }` is accepted too. */
function toLookupId(raw: unknown): string | null {
	if (!isRecord(raw)) return normalizeGuid(raw);
	const id = raw.id;
	return normalizeGuid(isRecord(id) ? id.guid : id);
}

/** Date-only columns arrive at UTC midnight (`"2026-10-18T00:00:00.000Z"`). The date part is the date; no shift. */
function toCalendarDate(raw: unknown): CalendarDate | null {
	if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : (raw.toISOString().slice(0, 10) as CalendarDate);
	return typeof raw === "string" ? parseCalendarDate(raw.slice(0, 10)) : null;
}

/** Date-and-time columns arrive as ISO UTC strings. A string without a zone suffix is read as UTC. */
function toInstant(raw: unknown): Date | null {
	if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : new Date(raw.getTime());
	const parsed = parseIso(raw);
	return parsed?.kind === "instant" ? parsed.instant : null;
}

const NORMALISERS: Readonly<Record<string, Normaliser>> = {
	Text: toText,
	Email: toText,
	Phone: toText,
	URL: toText,
	Ticker: toText,
	TextArea: toText,
	Multiple: toText,
	RichText: toText,
	AutoNumber: toText,
	OptionSet: toOptionValue,
	MultiSelectPicklist: toOptionValues,
	TwoOptions: toBoolean,
	Integer: toNumber,
	Decimal: toNumber,
	FloatingPoint: toNumber,
	Currency: toNumber,
	Duration: toNumber,
	Language: toNumber,
	TimeZone: toNumber,
	Lookup: toLookupId,
	Customer: toLookupId,
	Owner: toLookupId,
	Persona: toLookupId,
	UniqueIdentifier: normalizeGuid,
	DateOnly: toCalendarDate,
	DateAndTime: toInstant,
};

/** True when `column` is in the view, i.e. `rowData` has a key for it (even if its value is `null`). */
export function isInView(rowData: unknown, column: ColumnName): boolean {
	return isRecord(rowData) && !RESERVED_KEYS.has(column) && Object.prototype.hasOwnProperty.call(rowData, column);
}

/**
 * The normalised value of `column` in `rowData`, read as `dataType`
 * (`colDefs[].dataType`). `null` when the column is empty, not in the view,
 * of an unsupported type, or malformed. Use {@link isInView} or
 * {@link readColumn} to tell "not in the view" apart from "empty".
 */
export function getValue(rowData: unknown, column: ColumnName, dataType: string): RowValue {
	if (!isInView(rowData, column) || !Object.prototype.hasOwnProperty.call(NORMALISERS, dataType)) return null;
	return NORMALISERS[dataType]((rowData as Record<string, unknown>)[column]);
}

/**
 * Like {@link getValue}, but returns {@link NOT_VISIBLE} when the column isn't
 * in the view, or its data type isn't known (`undefined`, because it isn't in
 * `colDefs`).
 */
export function readColumn(rowData: unknown, column: ColumnName, dataType: string | undefined): ColumnValue {
	if (dataType === undefined || !isInView(rowData, column)) return NOT_VISIBLE;
	return getValue(rowData, column, dataType);
}

/**
 * A column reader for one row, for {@link evaluate}'s `getColumn`. Types come
 * from the grid's `colDefs`; a column missing from `colDefs` or `rowData` is
 * {@link NOT_VISIBLE}.
 */
export function columnReader(
	rowData: unknown,
	colDefs: readonly ColumnTypeInfo[],
): (column: ColumnName) => ColumnValue {
	const types = new Map<string, string>();
	if (Array.isArray(colDefs)) {
		for (const def of colDefs) {
			if (isRecord(def) && typeof def.name === "string" && typeof def.dataType === "string") {
				types.set(def.name, def.dataType);
			}
		}
	}
	return (column) => readColumn(rowData, column, types.get(column));
}
