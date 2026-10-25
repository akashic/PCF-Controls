/**
 * Start-up order for the customizer (spike V5): load the table's config, then
 * the option colours its rules need, then hand the customizer to the grid with
 * `fireEvent`. The grid waits for that event, so the first paint is already
 * styled. If loading takes longer than the timeout, the customizer is handed
 * over with no formatting (one warning) and a late result is ignored, so the
 * grid never changes style part-way through.
 */
import type { OptionColours } from "../engine/colours";
import type { TableConfig } from "../engine/configSchema";
import { optionColumns } from "../engine/optionMetadata";
import type { Warn } from "../engine/warnings";
import type { ConfigStore, WebApiLike } from "./configStore";
import type { MetadataStore, UtilsLike } from "./metadataStore";

/** How long `init` waits for config and metadata before showing the plain grid. */
export const LOAD_TIMEOUT_MS = 3000;

export interface Formatting {
	readonly config: TableConfig | null;
	readonly optionColours: OptionColours;
}

export interface LoadDeps {
	readonly configStore: ConfigStore;
	readonly metadataStore: MetadataStore;
	readonly webAPI: WebApiLike;
	readonly utils: UtilsLike;
}

/** The table's config and its option colours. Never rejects; no config means no metadata request. */
export async function loadFormatting(table: string | null | undefined, deps: LoadDeps): Promise<Formatting> {
	const config = await deps.configStore.load(table, deps.webAPI);
	if (!config || typeof table !== "string") return { config: null, optionColours: new Map() };
	const optionColours = await deps.metadataStore.load(table, optionColumns(config), deps.utils);
	return { config, optionColours };
}

export interface StartOptions<T> {
	/** Called exactly once: with the loaded value, or `null` on timeout or failure. */
	readonly onReady: (value: T | null) => void;
	readonly warn: Warn;
	readonly timeoutMs?: number;
	readonly setTimer?: (callback: () => void, ms: number) => unknown;
	readonly clearTimer?: (handle: unknown) => void;
}

/** Stops a start-up that hasn't finished: `onReady` is then never called. Does nothing once it has. */
export type CancelStart = () => void;

/**
 * Waits for `loading`, but no longer than `timeoutMs`, then calls `onReady`
 * once. Returns a function that cancels it, for `destroy()`: a grid removed
 * while loading must not get a late `fireEvent`.
 */
export function startWhenLoaded<T>(loading: Promise<T>, options: StartOptions<T>): CancelStart {
	const {
		onReady,
		warn,
		timeoutMs = LOAD_TIMEOUT_MS,
		setTimer = (callback, ms) => setTimeout(callback, ms),
		clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
	} = options;
	let done = false;
	const finish = (value: T | null): void => {
		if (done) return;
		done = true;
		onReady(value);
	};
	const timer = setTimer(() => {
		if (!done) warn(`config took longer than ${timeoutMs / 1000} s to load; the grid is shown without formatting.`);
		finish(null);
	}, timeoutMs);
	const settle = async (): Promise<void> => {
		let value: T | null;
		try {
			value = await loading;
		} catch {
			value = null;
		}
		clearTimer(timer);
		finish(value);
	};
	void settle();
	return () => {
		if (done) return;
		done = true;
		clearTimer(timer);
	};
}
