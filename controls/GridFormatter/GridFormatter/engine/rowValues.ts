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
 * A non-empty value that can't be normalised (malformed, or of a column type
 * this module doesn't read) is {@link UNREADABLE}, not `null`, so it can't
 * pass for an empty cell: no condition matches it, not even `isNull`.
 *
 * Date columns are read by their behaviour (V11), which the grid gives in the
 * undocumented `colDefs[].customizerParams.timeZoneIndependent`; see
 * {@link DateReading}.
 *
 * Every function here is pure and never throws.
 */

import { fromWallClock, parseCalendarDate, parseIso, toLocalDate, type CalendarDate, type TimeZoneOffset } from "./dates";
import type { ColumnName } from "./configSchema";
import { isRecord } from "./guards";

/**
 * A normalised cell value:
 *
 * | Column type (`colDefs[].dataType`) | Value |
 * |---|---|
 * | `OptionSet` (choice, status, status reason), `Integer`, `Decimal`, `FloatingPoint`, `Currency`, `Duration`, `Language`, `TimeZone` | `number` |
 * | `MultiSelectPicklist` | `number[]` (never empty) |
 * | `TwoOptions` | `boolean` |
 * | `Lookup`, `Customer`, `Owner`, `Persona`, `UniqueIdentifier` | lower-case GUID `string` |
 * | `DateOnly` | {@link CalendarDate} (`YYYY-MM-DD`): the date the user sees ({@link DateReading}) |
 * | `DateAndTime` | `Date`: the instant the user's clock shows what the grid shows ({@link DateReading}) |
 * | `Text`, `Email`, `Phone`, `URL`, `Ticker`, `TextArea`, `Multiple`, `RichText`, `AutoNumber` | `string` (never empty) |
 * | Any type, empty (`null`, `undefined`, `""` or `[]`) | `null` |
 *
 * A non-empty value that doesn't fit its type, or a non-empty value of any other
 * type (`Image`, `File`, ...), is {@link UNREADABLE} instead.
 */
export type RowValue = number | number[] | boolean | string | CalendarDate | Date | null;

/** Returned by {@link readColumn} when the column isn't in the view. */
export const NOT_VISIBLE: unique symbol = Symbol("GridFormatter.notVisible");
export type NotVisible = typeof NOT_VISIBLE;

/** A non-empty cell value that can't be read: malformed, or of a column type this module doesn't read. */
export const UNREADABLE: unique symbol = Symbol("GridFormatter.unreadable");
export type Unreadable = typeof UNREADABLE;

/** A cell value, {@link UNREADABLE} or {@link NOT_VISIBLE}. This is what conditions read. */
export type ColumnValue = RowValue | Unreadable | NotVisible;

/** The part of the grid's `colDefs[]` entries this module uses. */
export interface ColumnTypeInfo {
	readonly name: string;
	readonly dataType: string;
	/** Undocumented; `{ timeZoneIndependent: boolean }` on date columns (V11). Read with {@link timeZoneIndependentOf}. */
	readonly customizerParams?: unknown;
}

/** Column types whose values are dates. */
export const DATE_TYPES: ReadonlySet<string> = new Set(["DateOnly", "DateAndTime"]);

/**
 * How to read a date column's raw value (V11). The grid passes the stored
 * value, which means different things per behaviour:
 *
 * | `dataType` | `timeZoneIndependent` | Behaviour | Raw value | Read as |
 * |---|---|---|---|---|
 * | `DateOnly` | `true` | Date Only | the date at UTC midnight | its date part |
 * | `DateOnly` | `false` | User Local | the instant of the user's local midnight | the user's local date at that instant |
 * | `DateAndTime` | `false` | User Local | an instant | that instant |
 * | `DateAndTime` | `true` | Time Zone Independent | the wall-clock time, as UTC | the instant the user's clock shows that time ({@link fromWallClock}) |
 * | either | `undefined` | not known | | as Date Only, or as User Local |
 *
 * `offset` is the user's, as for conditions. A reading that needs it gives
 * {@link UNREADABLE} when it can't be read.
 */
export interface DateReading {
	readonly timeZoneIndependent: boolean | undefined;
	readonly offset: TimeZoneOffset;
}

/** A date column whose behaviour isn't known: read as before V11. */
const UNKNOWN_BEHAVIOUR: DateReading = Object.freeze({ timeZoneIndependent: undefined, offset: 0 });

/** Grid bookkeeping keys in `rowData` that aren't columns. */
const RESERVED_KEYS = new Set(["__rec_id", "params"]);

const GUID = /^\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?$/i;
const INTEGER = /^\s*-?\d+\s*$/;
const NUMBER = /^\s*-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i;

/** Normalises a non-empty raw value; `null` means it doesn't fit the type. Only date types use `dates`. */
type Normaliser = (raw: unknown, dates: DateReading) => RowValue;

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

/** An ISO string (UTC without a zone suffix) or a `Date`, as a new `Date`; `null` if it isn't one. */
function parseInstant(raw: unknown): Date | null {
	if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : new Date(raw.getTime());
	const parsed = parseIso(raw);
	return parsed?.kind === "instant" ? parsed.instant : null;
}

/**
 * Date-only columns. Date Only (or not known) arrives at UTC midnight
 * (`"2026-10-18T00:00:00.000Z"`): the date part is the date, with no shift.
 * User Local arrives as the instant of the user's local midnight
 * (`"2026-10-20T13:00:00.000Z"` at UTC+11 is 21 Oct).
 */
function toCalendarDate(raw: unknown, dates: DateReading): CalendarDate | null {
	if (dates.timeZoneIndependent === false) {
		const instant = parseInstant(raw);
		return instant && toLocalDate(instant, dates.offset);
	}
	if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : (raw.toISOString().slice(0, 10) as CalendarDate);
	return typeof raw === "string" ? parseCalendarDate(raw.slice(0, 10)) : null;
}

/**
 * Date-and-time columns arrive as ISO UTC strings. User Local (or not known)
 * is that instant. Time Zone Independent is the wall-clock time every user
 * sees (`"2026-10-21T21:00:00.000Z"` is 9:00 PM), read as the moment the user's
 * clock shows it.
 */
function toInstant(raw: unknown, dates: DateReading): Date | null {
	const instant = parseInstant(raw);
	if (!instant || dates.timeZoneIndependent !== true) return instant;
	const time = fromWallClock(instant.getTime(), dates.offset);
	return time === null ? null : new Date(time);
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

/** An empty cell: `null` as the grid gives it (V1), or `undefined`, `""` or `[]`, which no type reads as a value. */
function isEmpty(raw: unknown): boolean {
	return raw === null || raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0);
}

/** True when `column` is in the view, i.e. `rowData` has a key for it (even if its value is `null`). */
export function isInView(rowData: unknown, column: ColumnName): boolean {
	return isRecord(rowData) && !RESERVED_KEYS.has(column) && Object.prototype.hasOwnProperty.call(rowData, column);
}

/**
 * The normalised value of `column` in `rowData`, read as `dataType`
 * (`colDefs[].dataType`). `null` when the column is empty or not in the view;
 * {@link UNREADABLE} when it has a value that's malformed or of a type this
 * module doesn't read. Use {@link isInView} or {@link readColumn} to tell
 * "not in the view" apart from "empty". A date column is read by `dates`
 * (from {@link dateReadings}); without it, as a column whose behaviour isn't known.
 */
export function getValue(rowData: unknown, column: ColumnName, dataType: string, dates: DateReading = UNKNOWN_BEHAVIOUR): RowValue | Unreadable {
	if (!isInView(rowData, column)) return null;
	const raw = (rowData as Record<string, unknown>)[column];
	if (isEmpty(raw)) return null;
	const normalise = Object.prototype.hasOwnProperty.call(NORMALISERS, dataType) ? NORMALISERS[dataType] : undefined;
	return normalise?.(raw, dates) ?? UNREADABLE;
}

/**
 * Like {@link getValue}, but returns {@link NOT_VISIBLE} when the column isn't
 * in the view, or its data type isn't known (`undefined`, because it isn't in
 * `colDefs`).
 */
export function readColumn(rowData: unknown, column: ColumnName, dataType: string | undefined, dates?: DateReading): ColumnValue {
	if (dataType === undefined || !isInView(rowData, column)) return NOT_VISIBLE;
	return getValue(rowData, column, dataType, dates);
}

/**
 * A colDef's `customizerParams.timeZoneIndependent` (V11), or `undefined` when
 * it isn't a boolean. It isn't documented, so every step is checked, and a
 * throwing property gives `undefined` too.
 */
export function timeZoneIndependentOf(def: unknown): boolean | undefined {
	try {
		if (!isRecord(def)) return undefined;
		const params = def.customizerParams;
		if (!isRecord(params)) return undefined;
		const value = params.timeZoneIndependent;
		return typeof value === "boolean" ? value : undefined;
	} catch {
		return undefined;
	}
}

/**
 * How to read each date column in `colDefs` (V11), with the user's `offset`.
 * Only date columns are in the map; malformed entries are skipped.
 */
export function dateReadings(colDefs: readonly unknown[], offset: TimeZoneOffset): Map<ColumnName, DateReading> {
	const readings = new Map<ColumnName, DateReading>();
	if (Array.isArray(colDefs)) {
		for (const def of colDefs) {
			if (isRecord(def) && typeof def.name === "string" && typeof def.dataType === "string" && DATE_TYPES.has(def.dataType)) {
				readings.set(def.name, { timeZoneIndependent: timeZoneIndependentOf(def), offset });
			}
		}
	}
	return readings;
}

/**
 * Each column's `dataType` from the grid's `colDefs`, for `evaluate`'s
 * `columnType`: `undefined` for a column that isn't in `colDefs`. Malformed
 * entries are skipped.
 */
export function columnTypes(colDefs: readonly ColumnTypeInfo[]): (column: ColumnName) => string | undefined {
	const types = new Map<string, string>();
	if (Array.isArray(colDefs)) {
		for (const def of colDefs) {
			if (isRecord(def) && typeof def.name === "string" && typeof def.dataType === "string") {
				types.set(def.name, def.dataType);
			}
		}
	}
	return (column) => types.get(column);
}

/**
 * A column reader for one row, for `evaluate`'s `getColumn`. Types and date
 * behaviours come from the grid's `colDefs`, and `offset` is the user's (UTC
 * when left out); a column missing from `colDefs` or `rowData` is
 * {@link NOT_VISIBLE}.
 */
export function columnReader(
	rowData: unknown,
	colDefs: readonly ColumnTypeInfo[],
	offset: TimeZoneOffset = 0,
): (column: ColumnName) => ColumnValue {
	const typeOf = columnTypes(colDefs);
	const dates = dateReadings(colDefs, offset);
	return (column) => readColumn(rowData, column, typeOf(column), dates.get(column));
}
