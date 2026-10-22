import {
	CONFIG_WEB_RESOURCE_PREFIX,
	configQuery,
	configWebResourceName,
	decodeBase64Utf8,
	readConfigRecord,
} from "../GridFormatter/engine/webResource";

const base64 = (bytes: Uint8Array | string): string => Buffer.from(bytes).toString("base64");

describe("configWebResourceName (ADR-0004)", () => {
	it("names the table's config file", () => {
		expect(CONFIG_WEB_RESOURCE_PREFIX).toBe("wb_/GridFormatter/");
		expect(configWebResourceName("wb_gridspike")).toBe("wb_/GridFormatter/wb_gridspike.json");
		expect(configWebResourceName("Account")).toBe("wb_/GridFormatter/account.json");
	});

	it.each([null, undefined, "", 42, "wb_x'; drop", "a/b", "1abc", "wb x"])("rejects %p", (table) => {
		expect(configWebResourceName(table)).toBeNull();
	});
});

describe("configQuery", () => {
	it("selects the content of the one web resource with that name", () => {
		expect(configQuery("wb_/GridFormatter/wb_gridspike.json")).toBe(
			"?$select=name,content&$filter=name eq 'wb_/GridFormatter/wb_gridspike.json'&$top=1",
		);
	});

	it("escapes quotes in the name", () => {
		expect(configQuery("it's")).toContain("name eq 'it''s'");
	});
});

describe("readConfigRecord", () => {
	it("returns the Base64 content of the first row", () => {
		expect(readConfigRecord({ entities: [{ name: "x", content: "eyJ9" }] })).toEqual({ kind: "content", base64: "eyJ9" });
	});

	it.each([undefined, null, "text", {}, { entities: null }, { entities: [] }, { entities: [null] }, { entities: ["row"] }])(
		"is missing for %p",
		(response) => {
			expect(readConfigRecord(response)).toEqual({ kind: "missing" });
		},
	);

	it.each([{}, { content: null }, { content: "" }, { content: "  " }, { content: 42 }])("is empty for a row %p", (row) => {
		expect(readConfigRecord({ entities: [row] })).toEqual({ kind: "empty" });
	});
});

describe("decodeBase64Utf8", () => {
	it("decodes UTF-8 text, including non-ASCII characters", () => {
		const text = '{"version":1,"rules":[],"description":"Café – naïve ✓ 日本"}';
		expect(decodeBase64Utf8(base64(text))).toBe(text);
	});

	it("ignores whitespace and line breaks in the Base64", () => {
		const encoded = base64('{"version":1}');
		expect(decodeBase64Utf8(`${encoded.slice(0, 4)}\r\n ${encoded.slice(4)}\n`)).toBe('{"version":1}');
	});

	it("drops a UTF-8 byte order mark", () => {
		const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from("{}")]);
		expect(decodeBase64Utf8(base64(bytes))).toBe("{}");
	});

	it("rejects input that isn't Base64", () => {
		expect(decodeBase64Utf8("not base64!")).toBeNull();
	});

	it("rejects bytes that aren't UTF-8 (e.g. a Windows-1252 file)", () => {
		expect(decodeBase64Utf8(base64(new Uint8Array([0x7b, 0x22, 0xe9, 0x22, 0x7d])))).toBeNull();
	});
});
