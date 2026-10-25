/**
 * A time limit for each Web API and metadata request the stores make. Start-up
 * already stops waiting after 3 s (`startup.ts`), but a request that never
 * settles would otherwise stay in a store's cache, and every later grid of that
 * table would wait for it too. With a limit, it fails, the store drops it, and
 * the next grid asks again.
 */

/** How long one request may take before it counts as failed. */
export const REQUEST_TIMEOUT_MS = 3000;

/** The rejection when a request takes longer than its limit. */
export class RequestTimeout extends Error {
	constructor(ms: number) {
		super(`timed out after ${ms / 1000} s`);
	}
}

/** Settles like `request`, or rejects with {@link RequestTimeout} after `ms`. The timer is cleared either way. */
export function withTimeout<T>(request: Promise<T>, ms: number = REQUEST_TIMEOUT_MS): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => reject(new RequestTimeout(ms)), ms);
	});
	return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
}
