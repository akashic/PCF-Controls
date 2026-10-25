/**
 * Calendar dates and time-zone conversion for the condition engine.
 *
 * Two kinds of date reach the engine:
 *
 * - **Calendar dates** (`CalendarDate`, `YYYY-MM-DD`): date-only columns, the
 *   user's "today", and date-only operands in config. They have no time zone
 *   and are never shifted.
 * - **Instants** (`Date`): date-and-time columns and operands with a time.
 *   For the day-based operators, an instant is converted to the user's local
 *   calendar date with {@link toLocalDate}.
 *
 * Nothing here throws; malformed input gives `null`.
 */

/** A valid calendar date as `YYYY-MM-DD`, produced only by {@link parseCalendarDate} or {@link toLocalDate}. */
export type CalendarDate = string & { readonly __brand: "CalendarDate" };

/**
 * The user's offset from UTC in minutes, **positive east of UTC** (UTC+10 is
 * `600`), which is the sign `context.userSettings.getTimeZoneOffsetMinutes()`
 * uses. Note that JavaScript's `Date.prototype.getTimezoneOffset()` uses the
 * opposite sign.
 *
 * Pass a function to get daylight saving right for every instant, e.g.
 * `(instant) => context.userSettings.getTimeZoneOffsetMinutes(instant)`.
 * A plain number applies the same offset to every instant.
 */
export type TimeZoneOffset = number | ((instant: Date) => number);

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|([+-])(\d{2}):(\d{2}))?$/;

/** UTC milliseconds for the given wall-clock fields, or `null` if any field is out of range (e.g. 30 Feb). */
function utcMillis(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): number | null {
	// Years 0–99 come back as 1900–1999 from Date.UTC, so they fail the check below too.
	const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
	const valid =
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day &&
		date.getUTCHours() === hour &&
		date.getUTCMinutes() === minute &&
		date.getUTCSeconds() === second;
	return valid ? date.getTime() : null;
}

/** The UTC calendar date of a timestamp. */
function utcCalendarDate(ms: number): CalendarDate {
	return new Date(ms).toISOString().slice(0, 10) as CalendarDate;
}

/** Accepts exactly `YYYY-MM-DD` naming a real calendar date; anything else returns `null`. */
export function parseCalendarDate(input: unknown): CalendarDate | null {
	if (typeof input !== "string") return null;
	const match = CALENDAR_DATE.exec(input);
	if (!match) return null;
	const [, y, m, d] = match.map(Number);
	return utcMillis(y, m, d) === null ? null : (input as CalendarDate);
}

/** Days since 1970-01-01 for a calendar date, for day arithmetic without DST surprises. */
export function dayNumber(date: CalendarDate): number {
	const [y, m, d] = date.split("-").map(Number);
	return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/** The offset in minutes at `instant`, or `null` if the offset source fails or isn't a finite number. */
export function offsetAt(offset: TimeZoneOffset, instant: Date): number | null {
	try {
		const minutes = typeof offset === "function" ? offset(instant) : offset;
		return typeof minutes === "number" && Number.isFinite(minutes) ? minutes : null;
	} catch {
		return null;
	}
}

/**
 * The UTC timestamp of a wall-clock time in the user's time zone, where
 * `wallClock` is that time's fields read as UTC (`Date.UTC(...)`). `null` when
 * the offset can't be read.
 *
 * Two passes, because the offset is only known for an instant: the first guess
 * uses the offset at the wall-clock fields read as UTC, which is up to the
 * offset itself away from the real instant and so can be on the other side of
 * a daylight-saving change; the second uses the offset at that guess. In the
 * hour a change skips or repeats, the result is one of the two readings.
 */
export function fromWallClock(wallClock: number, offset: TimeZoneOffset): number | null {
	const first = offsetAt(offset, new Date(wallClock));
	if (first === null) return null;
	const second = offsetAt(offset, new Date(wallClock - first * MS_PER_MINUTE));
	return second === null ? null : wallClock - second * MS_PER_MINUTE;
}

/**
 * The user's local calendar date at `instant`. This is how the caller works
 * out "today" (`toLocalDate(new Date(), offset)`), and how date-and-time
 * values are compared with calendar dates.
 */
export function toLocalDate(instant: Date, offset: TimeZoneOffset): CalendarDate | null {
	const time = instant instanceof Date ? instant.getTime() : NaN;
	if (Number.isNaN(time)) return null;
	const minutes = offsetAt(offset, instant);
	if (minutes === null) return null;
	const local = time + minutes * MS_PER_MINUTE;
	return Number.isNaN(new Date(local).getTime()) ? null : utcCalendarDate(local);
}

/** A parsed ISO 8601 string: a calendar date, or an instant. */
export type IsoValue = { kind: "date"; date: CalendarDate } | { kind: "instant"; instant: Date };

/**
 * Parses `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm[:ss[.fff]]` with an optional `Z`
 * or `±HH:mm` suffix. A date and time **without** a suffix is wall-clock time
 * in `localOffset` (the user's time zone, for config operands, converted with
 * {@link fromWallClock}), or UTC when `localOffset` is omitted. Impossible
 * dates and times (`2026-02-30`, `T25:00`, `+24:00`) give `null`.
 */
export function parseIso(input: unknown, localOffset: TimeZoneOffset = 0): IsoValue | null {
	const date = parseCalendarDate(input);
	if (date) return { kind: "date", date };
	if (typeof input !== "string") return null;

	const match = ISO_DATE_TIME.exec(input);
	if (!match) return null;
	const [, y, mo, d, h, mi, s = "0", fraction = "", zone, sign, zh, zm] = match;
	const ms = Number(fraction.slice(0, 3).padEnd(3, "0"));
	const wallClock = utcMillis(+y, +mo, +d, +h, +mi, +s, ms);
	if (wallClock === null) return null;

	let instant: number | null;
	if (zone === undefined) {
		instant = fromWallClock(wallClock, localOffset);
	} else if (zone === "Z") {
		instant = wallClock;
	} else if (Number(zh) > 23 || Number(zm) > 59) {
		instant = null;
	} else {
		instant = wallClock - (sign === "-" ? -1 : 1) * (Number(zh) * 60 + Number(zm)) * MS_PER_MINUTE;
	}
	return instant === null ? null : { kind: "instant", instant: new Date(instant) };
}
