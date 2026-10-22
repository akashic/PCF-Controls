/** Receives one console-ready warning message. */
export type Warn = (message: string) => void;

/** Every GridFormatter console message starts with this. */
export const WARNING_PREFIX = "[GridFormatter]";

/** Logs to `console.warn` with the GridFormatter prefix. */
export const consoleWarn: Warn = (message) => console.warn(`${WARNING_PREFIX} ${message}`);

/**
 * Wraps `sink` so each distinct message is passed on only once. Create one per
 * page (module scope) and pass it to `validateConfig` and `prepareRules`, so
 * re-preparing rules for another grid or a new column set doesn't repeat warnings.
 */
export function createWarnOnce(sink: Warn = consoleWarn): Warn {
	const seen = new Set<string>();
	return (message) => {
		if (seen.has(message)) return;
		seen.add(message);
		sink(message);
	};
}
