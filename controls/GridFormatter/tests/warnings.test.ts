import { WARNING_PREFIX, consoleWarn, createWarnOnce } from "../GridFormatter/engine/warnings";

describe("warnings", () => {
	it("consoleWarn prefixes messages", () => {
		const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
		consoleWarn("hello");
		expect(warn).toHaveBeenCalledWith(`${WARNING_PREFIX} hello`);
		warn.mockRestore();
	});

	it("createWarnOnce passes each distinct message on once", () => {
		const sink = jest.fn();
		const warn = createWarnOnce(sink);
		warn("a");
		warn("b");
		warn("a");
		expect(sink.mock.calls).toEqual([["a"], ["b"]]);
	});

	it("createWarnOnce logs to the console by default", () => {
		const spy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
		const warn = createWarnOnce();
		warn("once");
		warn("once");
		expect(spy).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	});
});
