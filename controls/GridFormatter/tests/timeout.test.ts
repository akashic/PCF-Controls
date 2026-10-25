import { REQUEST_TIMEOUT_MS, RequestTimeout, withTimeout } from "../GridFormatter/stores/timeout";

describe("withTimeout", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it("settles like the request, and clears its timer", async () => {
		await expect(withTimeout(Promise.resolve("ok"))).resolves.toBe("ok");
		await expect(withTimeout(Promise.reject(new Error("HTTP 500")))).rejects.toThrow("HTTP 500");
		expect(jest.getTimerCount()).toBe(0);
	});

	it("rejects after 3 s when the request hasn't settled", async () => {
		const result = withTimeout(new Promise(() => undefined));
		const settled = jest.fn();
		result.then(settled, settled);
		await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
		expect(settled).not.toHaveBeenCalled();
		await jest.advanceTimersByTimeAsync(1);
		const error: unknown = settled.mock.calls[0][0];
		expect(error).toBeInstanceOf(RequestTimeout);
		expect(String(error)).toBe("Error: timed out after 3 s");
	});

	it("takes another limit", async () => {
		const result = withTimeout(new Promise(() => undefined), 500);
		const assertion = expect(result).rejects.toThrow("timed out after 0.5 s");
		await jest.advanceTimersByTimeAsync(500);
		await assertion;
	});
});
