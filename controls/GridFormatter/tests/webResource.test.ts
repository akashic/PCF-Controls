import {
	CONFIG_NAME_MARKER,
	configNamePattern,
	configQuery,
	configTable,
	decodeBase64Utf8,
	isConfigName,
	readConfigRecord,
} from "../GridFormatter/engine/webResource";

const base64 = (bytes: Uint8Array | string): string => Buffer.from(bytes).toString("base64");

describe("configTable", () => {
	it("is the table's logical name in lower case", () => {
		expect(configTable("wb_gridspike")).toBe("wb_gridspike");
		expect(configTable("Account")).toBe("account");
	});

	it.each([null, undefined, "", 42, "wb_x'; drop", "a/b", "a.b", "1abc", "wb x"])("rejects %p", (table) => {
		expect(configTable(table)).toBeNull();
	});
});

describe("configNamePattern (ADR-0005)", () => {
	it("names the file under any prefix", () => {
		expect(CONFIG_NAME_MARKER).toBe("_GridFormatter.");
		expect(configNamePattern("abc_project")).toBe("<prefix>_GridFormatter.abc_project.json");
	});
});

describe("isConfigName", () => {
	it.each(["abc_GridFormatter.account.json", "wb_GridFormatter.account.json", "ABC_gridformatter.ACCOUNT.JSON", "cr65e_GridFormatter.account.json"])(
		"accepts %p for account",
		(name) => {
			expect(isConfigName(name, "account")).toBe(true);
		},
	);

	it.each([
		["the old name", "wb_/GridFormatter/account.json"],
		["another table", "abc_GridFormatter.contact.json"],
		["a table that only ends the same", "abc_GridFormatter.x_account.json"],
		["no prefix", "_GridFormatter.account.json"],
		["a prefix with an underscore", "abc_x_GridFormatter.account.json"],
		["a folder", "abc_/x/abc_GridFormatter.account.json"],
		["another extension", "abc_GridFormatter.account.js"],
		["a wildcard match", "abcXGridFormatter.account.json"],
		["not a string", 42],
	])("rejects %s", (_label, name) => {
		expect(isConfigName(name, "account")).toBe(false);
	});

	it("matches the table's underscores literally", () => {
		expect(isConfigName("abc_GridFormatter.abc_project.json", "abc_project")).toBe(true);
		expect(isConfigName("abc_GridFormatter.abcXproject.json", "abc_project")).toBe(false);
	});
});

describe("configQuery", () => {
	it("finds the table's files under any prefix, with each _ escaped as [_]", () => {
		expect(configQuery("wb_gridspike")).toBe(
			"?$select=name,content&$filter=endswith(name,'[_]GridFormatter.wb[_]gridspike.json')&$orderby=name&$top=10",
		);
	});
});

describe("readConfigRecord", () => {
	const row = (name: string, content: unknown = "eyJ9") => ({ name, content });

	it("returns the Base64 content of the matching row", () => {
		expect(readConfigRecord({ entities: [row("abc_GridFormatter.t.json")] }, "t")).toEqual({
			kind: "content",
			name: "abc_GridFormatter.t.json",
			base64: "eyJ9",
			others: [],
		});
	});

	it("uses the first matching name in alphabetical order, ignoring case, and lists the others", () => {
		const response = { entities: [row("xyz_GridFormatter.t.json", "eA=="), row("Abc_GridFormatter.t.json", "YQ=="), row("lc_GridFormatter.t.json")] };
		expect(readConfigRecord(response, "t")).toEqual({
			kind: "content",
			name: "Abc_GridFormatter.t.json",
			base64: "YQ==",
			others: ["lc_GridFormatter.t.json", "xyz_GridFormatter.t.json"],
		});
	});

	it("ignores rows whose name only matched the wildcard query", () => {
		const response = { entities: [row("a_x_GridFormatter.t.json"), row("b_GridFormatter.t.json", "Yg=="), row("c_/GridFormatter.t.json")] };
		expect(readConfigRecord(response, "t")).toMatchObject({ kind: "content", name: "b_GridFormatter.t.json", others: [] });
	});

	it.each([
		undefined,
		null,
		"text",
		{},
		{ entities: null },
		{ entities: [] },
		{ entities: [null] },
		{ entities: ["row"] },
		{ entities: [{ content: "eyJ9" }] },
		{ entities: [{ name: "x_GridFormatter.other.json", content: "eyJ9" }] },
	])("is missing for %p", (response) => {
		expect(readConfigRecord(response, "t")).toEqual({ kind: "missing" });
	});

	it.each([{}, { content: null }, { content: "" }, { content: "  " }, { content: 42 }])("is empty for a row %p", (fields) => {
		expect(readConfigRecord({ entities: [{ name: "abc_GridFormatter.t.json", ...fields }] }, "t")).toEqual({
			kind: "empty",
			name: "abc_GridFormatter.t.json",
			others: [],
		});
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
