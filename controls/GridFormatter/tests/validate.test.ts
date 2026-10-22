import type { Rule } from "../GridFormatter/engine/configSchema";
import { resolveDefaults } from "../GridFormatter/engine/colours";
import { contrastWarning, parseConfig, validateConfig } from "../GridFormatter/engine/validate";
import { example, invalidFixture } from "./engineHelpers";

/** Runs validateConfig, collecting warnings. */
function validate(input: unknown) {
	const warnings: string[] = [];
	const config = validateConfig(input, (message) => warnings.push(message));
	return { config, warnings };
}

/** A config holding one rule plus a valid one, to show only the bad rule is skipped. */
const withRule = (rule: unknown) => ({
	version: 1,
	rules: [rule, { id: "good", scope: "row", style: { fontStyle: "italic" } }],
});

describe("validateConfig: valid configs", () => {
	it.each(["combined", "inactive-grey", "over-budget", "overdue-bold-red", "rag-cell", "rag-row"])("accepts examples/%s.json unchanged, with no warnings", (name) => {
		const input = example(name);
		const { config, warnings } = validate(input);
		expect(warnings).toEqual([]);
		expect(config).toEqual({ version: 1, ...(input.defaults && { defaults: input.defaults }), rules: input.rules });
	});

	it("accepts every operator with its operand shape", () => {
		const leaves = [
			{ column: "a", op: "eq", value: 1 },
			{ column: "a", op: "ne", value: { column: "b" } },
			{ column: "a", op: "eq", value: true },
			{ column: "a", op: "in", value: [1, "x", false] },
			{ column: "a", op: "notIn", value: [2] },
			{ column: "a", op: "gt", value: 5 },
			{ column: "a", op: "gte", value: "2026-12-31" },
			{ column: "a", op: "lt", value: "2026-12-31T17:00:00Z" },
			{ column: "a", op: "lte", value: { column: "rel.b" } },
			{ column: "a", op: "between", value: [1, 10] },
			{ column: "a", op: "between", value: ["2026-01-01", "2026-12-31"] },
			{ column: "a", op: "isNull" },
			{ column: "a", op: "isNotNull" },
			{ column: "a", op: "contains", value: "x" },
			{ column: "a", op: "startsWith", value: "x" },
			{ column: "a", op: "endsWith", value: "x" },
			{ column: "a", op: "beforeToday" },
			{ column: "a", op: "onOrAfterToday" },
			{ column: "a", op: "olderThanDays", value: 30 },
			{ column: "a", op: "withinNextDays", value: 0 },
			{ column: "a", op: "containsAny", value: [1, 2] },
			{ column: "a", op: "containsAll", value: [3] },
		];
		const { config, warnings } = validate({
			version: 1,
			rules: leaves.map((when, i) => ({ id: `r${i}`, when, style: { fontStyle: "italic" } })),
		});
		expect(warnings).toEqual([]);
		expect(config?.rules).toHaveLength(leaves.length);
	});

	it("accepts every colour form, style property and rule option", () => {
		const rule = {
			id: "Everything_1.a-b",
			description: "all of it",
			priority: -3,
			when: { any: [{ not: { all: [{ any: [{ column: "a", op: "isNull" }] }] } }] }, // depth 5
			scope: { columns: ["a", "b"] },
			display: "style",
			stop: false,
			style: {
				backgroundColor: { hex: "#abc", alpha: 0 },
				color: { fromOption: "a", alpha: 1 },
				fontWeight: "semibold",
				fontStyle: "normal",
				textDecoration: "none",
			},
		};
		const { config, warnings } = validate({
			$schema: "../grid-format.schema.json",
			version: 1,
			rules: [
				rule,
				{ id: "tint", scope: "row", style: { backgroundColor: { fromOption: "a", alpha: "tint" }, color: { token: "colorNeutralForeground1" } } },
				{ id: "pill", when: { column: "a", op: "isNotNull" }, display: "pill", style: { backgroundColor: { fromOption: "a" } } },
				{ id: "stop-only", when: { column: "a", op: "isNull" }, stop: true },
			],
		});
		expect(warnings).toEqual([]);
		expect(config?.rules.map((r) => r.id)).toEqual(["Everything_1.a-b", "tint", "pill", "stop-only"]);
	});
});

describe("validateConfig: unusable files", () => {
	it.each([
		["an array", [], "config ignored: it isn't a JSON object."],
		["null", null, "config ignored: it isn't a JSON object."],
		["a string", "config", "config ignored: it isn't a JSON object."],
		["version 2", { version: 2, rules: [] }, "config ignored: version 2 isn't supported (expected 1)."],
		["no version", { rules: [] }, "config ignored: version undefined isn't supported (expected 1)."],
		["the brief's old ruleSets shape", { version: 1, ruleSets: [] }, "config ignored: rules must be an array."],
	])("ignores %s with one warning", (_, input, warning) => {
		expect(validate(input)).toEqual({ config: null, warnings: [warning] });
	});

	it("never throws, even on hostile input", () => {
		const input = Object.defineProperty({}, "version", {
			get() {
				throw new Error("boom");
			},
		});
		expect(validate(input)).toEqual({ config: null, warnings: ["config ignored: it couldn't be validated (Error: boom)."] });
	});

	it("warns about and ignores unknown top-level properties", () => {
		expect(validate({ version: 1, rules: [], extra: true })).toEqual({
			config: { version: 1, rules: [] },
			warnings: ['config has an unknown property "extra"; ignored.'],
		});
	});

	it("logs to the console by default", () => {
		const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
		expect(validateConfig({ version: 3, rules: [] })).toBeNull();
		expect(warn).toHaveBeenCalledWith("[GridFormatter] config ignored: version 3 isn't supported (expected 1).");
		warn.mockRestore();
	});
});

describe("parseConfig", () => {
	it("parses and validates JSON text", () => {
		const warnings: string[] = [];
		expect(parseConfig('{ "version": 1, "rules": [] }', (m) => warnings.push(m))).toEqual({ version: 1, rules: [] });
		expect(warnings).toEqual([]);
	});

	it("ignores invalid JSON with one warning", () => {
		const warnings: string[] = [];
		expect(parseConfig('{ "version": 1, rules: [] }', (m) => warnings.push(m))).toBeNull();
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(/^config ignored: it isn't valid JSON \(SyntaxError: /);
	});

	it("logs to the console by default", () => {
		const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
		expect(parseConfig("")).toBeNull();
		expect(warn).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});
});

describe("validateConfig: defaults", () => {
	const withDefaults = (defaults: unknown) => validate({ version: 1, defaults, rules: [] });

	it("keeps valid defaults", () => {
		expect(withDefaults({ tintAlpha: 0.25, fallbackColor: { token: "colorNeutralBackground5" } }).config?.defaults).toEqual({
			tintAlpha: 0.25,
			fallbackColor: { token: "colorNeutralBackground5" },
		});
		expect(withDefaults({ fallbackColor: null }).config?.defaults).toEqual({ fallbackColor: null });
		expect(withDefaults({ tintAlpha: 1, fallbackColor: { hex: "#888", alpha: 0.5 } }).warnings).toEqual([]);
	});

	it.each([
		["not an object", "grey", undefined, "config: /defaults must be an object; ignored."],
		["an unknown property", { tint: 0.2 }, {}, 'config: /defaults has an unknown property "tint"; ignored.'],
		["tintAlpha 0", { tintAlpha: 0 }, {}, "config: /defaults/tintAlpha must be a number above 0 and up to 1; using the default."],
		["tintAlpha above 1", { tintAlpha: 18 }, {}, "config: /defaults/tintAlpha must be a number above 0 and up to 1; using the default."],
		["tintAlpha as text", { tintAlpha: "0.2" }, {}, "config: /defaults/tintAlpha must be a number above 0 and up to 1; using the default."],
		[
			"a fromOption fallback",
			{ fallbackColor: { fromOption: "a" } },
			{},
			'config: /defaults/fallbackColor must be a colour: "#RRGGBB", { hex, alpha }, { token }; no fallback colour is used.',
		],
		[
			"a bad fallback hex",
			{ fallbackColor: "grey" },
			{},
			'config: /defaults/fallbackColor "grey" isn\'t a #RGB or #RRGGBB colour; no fallback colour is used.',
		],
	])("ignores %s with a warning, keeping the rules", (_, defaults, expected, warning) => {
		const { config, warnings } = withDefaults(defaults);
		expect(config).toEqual(expected === undefined ? { version: 1, rules: [] } : { version: 1, defaults: expected, rules: [] });
		expect(warnings).toEqual([warning]);
	});
});

describe("validateConfig: invalid rules are skipped one at a time", () => {
	it.each([
		["unknown-operator", 'rule "unknown-operator" skipped: /rules/0/when/op "equals" isn\'t a known operator.'],
		["wrong-operand-type", 'rule "wrong-operand-type" skipped: /rules/0/when/value "30" isn\'t a valid operand for "olderThanDays".'],
		["raw-css-style-key", 'rule "raw-css-style-key" skipped: /rules/0/style: "border" isn\'t an allowed style property (raw CSS isn\'t supported).'],
		[
			"unknown-token",
			'rule "unknown-token" skipped: /rules/0/style/backgroundColor/token "colorNeutralBackgroundGrey" isn\'t a known Fluent 9 colour token.',
		],
		["bad-hex", 'rule "bad-hex" skipped: /rules/0/style/color "#C50F1" isn\'t a #RGB or #RRGGBB colour.'],
		["value-on-no-operand-operator", 'rule "value-on-no-operand-operator" skipped: /rules/0/when/value: "isNull" takes no value.'],
		[
			"condition-too-deep",
			'rule "condition-too-deep" skipped: /rules/0/when/all/0/all/0/all/0/all/0: conditions nest at most 5 levels deep.',
		],
		["pill-with-row-scope", 'rule "pill-with-row-scope" skipped: /rules/0/scope: a pill needs cell scope, not "row".'],
	])("tests/fixtures/invalid-config/%s.json", (name, warning) => {
		const { config, warnings } = validate(invalidFixture(name));
		expect(warnings).toEqual([warning]);
		expect(config).toEqual({ version: 1, rules: [] });
	});

	it("tests/fixtures/invalid-config/duplicate-rule-id.json keeps the first rule with that id", () => {
		const { config, warnings } = validate(invalidFixture("duplicate-rule-id"));
		expect(warnings).toEqual(['rule "rag" skipped: /rules/1/id is a duplicate.']);
		expect(config?.rules).toEqual([expect.objectContaining({ id: "rag", style: { fontWeight: "bold" } })]);
	});

	const leaf = { column: "a", op: "isNull" };
	it.each<[string, unknown, string]>([
		// Rule shape
		["a non-object rule", "rule", "at /rules/0 skipped: /rules/0 must be an object."],
		["an unknown rule property", { id: "r", when: leaf, style: { fontStyle: "italic" }, view: "x" }, '"r" skipped: /rules/0 has an unknown property "view".'],
		["a missing id", { when: leaf, style: { fontStyle: "italic" } }, "at /rules/0 skipped: /rules/0/id must be up to 64"],
		["an id with spaces", { id: "my rule", when: leaf, style: { fontStyle: "italic" } }, '"my rule" skipped: /rules/0/id must be'],
		["an id over 64 characters", { id: "r".repeat(65), when: leaf, style: { fontStyle: "italic" } }, "skipped: /rules/0/id must be"],
		["a non-text description", { id: "r", description: 1, when: leaf, style: { fontStyle: "italic" } }, "/rules/0/description must be text."],
		["a fractional priority", { id: "r", priority: 1.5, when: leaf, style: { fontStyle: "italic" } }, "/rules/0/priority must be a whole number."],
		["a bad display", { id: "r", when: leaf, display: "badge", style: { fontStyle: "italic" } }, '/rules/0/display must be "style" or "pill".'],
		["a non-boolean stop", { id: "r", when: leaf, stop: "yes", style: { fontStyle: "italic" } }, "/rules/0/stop must be true or false."],
		["no style and no stop", { id: "r", when: leaf }, "/rules/0: style is required unless stop is true."],
		["no style with stop false", { id: "r", when: leaf, stop: false }, "/rules/0: style is required unless stop is true."],
		["no scope without a leaf when", { id: "r", when: { not: leaf }, style: { fontStyle: "italic" } }, "/rules/0: scope is required unless when is a single leaf condition."],
		["no scope and no when", { id: "r", style: { fontStyle: "italic" } }, "/rules/0: scope is required unless when is a single leaf condition."],
		["a pill without a backgroundColor", { id: "r", when: leaf, display: "pill", style: { fontWeight: "bold" } }, "/rules/0/style: a pill needs a backgroundColor."],
		["a stop-only pill", { id: "r", when: leaf, display: "pill", stop: true }, "/rules/0/style: a pill needs a backgroundColor."],
		// Scope
		["a scope string other than row", { id: "r", scope: "cell", style: { fontStyle: "italic" } }, '/rules/0/scope must be "row" or { "columns": [...] }.'],
		["a scope with extra keys", { id: "r", scope: { columns: ["a"], view: 1 }, style: { fontStyle: "italic" } }, '/rules/0/scope has an unknown property "view".'],
		["empty scope columns", { id: "r", scope: { columns: [] }, style: { fontStyle: "italic" } }, "/rules/0/scope/columns must be a non-empty list"],
		["duplicate scope columns", { id: "r", scope: { columns: ["a", "a"] }, style: { fontStyle: "italic" } }, "/rules/0/scope/columns must be"],
		["an upper-case scope column", { id: "r", scope: { columns: ["WB_Name"] }, style: { fontStyle: "italic" } }, "/rules/0/scope/columns must be"],
		// Conditions
		["a non-object condition", { id: "r", when: [leaf], scope: "row", style: { fontStyle: "italic" } }, "/rules/0/when must be a condition object."],
		["a null condition", { id: "r", when: null, scope: "row", style: { fontStyle: "italic" } }, "/rules/0/when must be a condition object."],
		["a group with two keys", { id: "r", when: { all: [leaf], any: [leaf] }, scope: "row", style: { fontStyle: "italic" } }, "/rules/0/when must be a leaf"],
		["an empty condition", { id: "r", when: {}, scope: "row", style: { fontStyle: "italic" } }, "/rules/0/when must be a leaf"],
		["an unknown group", { id: "r", when: { none: [leaf] }, scope: "row", style: { fontStyle: "italic" } }, '/rules/0/when has an unknown property "none".'],
		["an empty all", { id: "r", when: { all: [] }, scope: "row", style: { fontStyle: "italic" } }, "/rules/0/when/all must be a non-empty array."],
		["a non-array any", { id: "r", when: { any: leaf }, scope: "row", style: { fontStyle: "italic" } }, "/rules/0/when/any must be a non-empty array."],
		["a bad nested leaf", { id: "r", when: { any: [leaf, { not: { column: "a", op: "like" } }] }, scope: "row", style: { fontStyle: "italic" } }, '/rules/0/when/any/1/not/op "like" isn\'t a known operator.'],
		["a not nested too deep", { id: "r", when: { not: { not: { not: { not: { not: leaf } } } } }, scope: "row", style: { fontStyle: "italic" } }, "/rules/0/when/not/not/not/not: conditions nest at most 5 levels deep."],
		["an unknown leaf property", { id: "r", when: { ...leaf, values: [] }, style: { fontStyle: "italic" } }, '/rules/0/when has an unknown property "values".'],
		["a leaf without column", { id: "r", when: { op: "isNull" }, scope: "row", style: { fontStyle: "italic" } }, "/rules/0/when/column must be a column logical name."],
		["a leaf with a display name column", { id: "r", when: { column: "Due Date", op: "isNull" }, style: { fontStyle: "italic" } }, "/rules/0/when/column must be"],
		["a missing operator", { id: "r", when: { column: "a" }, style: { fontStyle: "italic" } }, "/rules/0/when/op undefined isn't a known operator."],
		["an inherited property as operator", { id: "r", when: { column: "a", op: "toString" }, style: { fontStyle: "italic" } }, '/rules/0/when/op "toString" isn\'t'],
		// Operands
		...(
			[
				["eq", undefined],
				["eq", null],
				["eq", [1]],
				["eq", { column: "a", other: 1 }],
				["eq", { column: "Bad" }],
				["in", []],
				["in", 1],
				["in", [{ column: "a" }]],
				["gt", true],
				["gt", "31/12/2026"],
				["between", [1]],
				["between", [1, "2026-01-01"]],
				["between", "1,2"],
				["contains", ""],
				["contains", 1],
				["olderThanDays", -1],
				["withinNextDays", 1.5],
				["containsAny", [1, 1]],
				["containsAll", [1.5]],
				["containsAny", []],
			] as [string, unknown][]
		).map(([op, value]): [string, unknown, string] => [
			`${op} with ${JSON.stringify(value)}`,
			{ id: "r", when: { column: "a", op, value }, style: { fontStyle: "italic" } },
			`isn't a valid operand for "${op}".`,
		]),
		// Styles and colours
		["a non-object style", { id: "r", when: leaf, style: "bold" }, "/rules/0/style must be an object with at least one property."],
		["an empty style", { id: "r", when: leaf, style: {} }, "/rules/0/style must be an object with at least one property."],
		["a bad fontWeight", { id: "r", when: leaf, style: { fontWeight: 700 } }, "/rules/0/style/fontWeight must be one of normal, semibold, bold."],
		["a bad fontStyle", { id: "r", when: leaf, style: { fontStyle: "oblique" } }, "/rules/0/style/fontStyle must be one of normal, italic."],
		["a bad textDecoration", { id: "r", when: leaf, style: { textDecoration: "overline" } }, "/rules/0/style/textDecoration must be one of none, line-through, underline."],
		["a CSS colour name", { id: "r", when: leaf, style: { color: "red" } }, '/rules/0/style/color "red" isn\'t a #RGB or #RRGGBB colour.'],
		["hex without #", { id: "r", when: leaf, style: { color: "C50F1F" } }, "isn't a #RGB or #RRGGBB colour."],
		["a numeric colour", { id: "r", when: leaf, style: { color: 0xc50f1f } }, "/rules/0/style/color must be a colour."],
		["an unknown colour object", { id: "r", when: leaf, style: { color: { rgb: "1,2,3" } } }, '/rules/0/style/color must be a colour: "#RRGGBB", { hex, alpha }, { token } or { fromOption }.'],
		["a token with extra keys", { id: "r", when: leaf, style: { color: { token: "colorNeutralForeground1", alpha: 0.5 } } }, '/rules/0/style/color has an unknown property "alpha".'],
		["a non-string token", { id: "r", when: leaf, style: { color: { token: 1 } } }, "/rules/0/style/color/token 1 isn't a known Fluent 9 colour token."],
		["a token mixed with hex", { id: "r", when: leaf, style: { color: { hex: "#000", alpha: 1, token: "x" } } }, '/rules/0/style/color has an unknown property "hex".'],
		["hex alpha with extra keys (no token)", { id: "r", when: leaf, style: { color: { hex: "#000", alpha: 1, x: 1 } } }, '/rules/0/style/color has an unknown property "x".'],
		["hex alpha with a bad hex", { id: "r", when: leaf, style: { color: { hex: "#00", alpha: 1 } } }, '/rules/0/style/color/hex "#00" isn\'t a #RGB or #RRGGBB colour.'],
		["hex alpha with a numeric hex", { id: "r", when: leaf, style: { color: { hex: 0, alpha: 1 } } }, "/rules/0/style/color/hex 0 isn't"],
		["hex alpha without alpha", { id: "r", when: leaf, style: { color: { hex: "#000" } } }, "/rules/0/style/color/alpha must be a number from 0 to 1."],
		["hex alpha above 1", { id: "r", when: leaf, style: { color: { hex: "#000", alpha: 1.5 } } }, "/rules/0/style/color/alpha must be a number from 0 to 1."],
		["fromOption with extra keys", { id: "r", when: leaf, style: { color: { fromOption: "a", hex: "#000" } } }, '/rules/0/style/color has an unknown property "fromOption".'],
		["fromOption with extra keys (no hex)", { id: "r", when: leaf, style: { color: { fromOption: "a", x: 1 } } }, '/rules/0/style/color has an unknown property "x".'],
		["fromOption with a bad column", { id: "r", when: leaf, style: { color: { fromOption: "Status" } } }, "/rules/0/style/color/fromOption must be a column logical name."],
		["fromOption with a bad alpha", { id: "r", when: leaf, style: { color: { fromOption: "a", alpha: "half" } } }, '/rules/0/style/color/alpha must be "tint" or a number from 0 to 1.'],
		["a bad backgroundColor", { id: "r", when: leaf, style: { backgroundColor: "#GGG" } }, '/rules/0/style/backgroundColor "#GGG" isn\'t'],
	])("skips %s", (_, rule, warning) => {
		const { config, warnings } = validate(withRule(rule));
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain(warning);
		expect(config?.rules.map((r) => r.id)).toEqual(["good"]);
	});
});

describe("contrast warnings", () => {
	const defaults = resolveDefaults(undefined);
	const rule = (style: Rule["style"], extra: Partial<Rule> = {}): Rule => ({ id: "r", scope: "row", style, ...extra });

	it("warns, and keeps the rule, when text contrast is below 4.5:1", () => {
		const { config, warnings } = validate({ version: 1, rules: [rule({ color: "#777777" })] });
		expect(warnings).toEqual(['rule "r": text colour contrast is 4.48:1 against its background in the light theme, below 4.5:1.']);
		expect(config?.rules).toHaveLength(1);
	});

	it.each<[string, Rule["style"], string | null]>([
		["dark text on white", { color: "#767676" }, null],
		["amber text on white", { color: "#FFB900" }, "1.72:1"],
		// #C50F1F is 5.9:1 on white but 4.41:1 on its own 18% tint (#F5D4D7).
		["red text on its own tint", { color: "#C50F1F", backgroundColor: "#C50F1F" }, "4.41:1"],
		["a token on a token (inactive grey)", { color: { token: "colorNeutralForeground3" }, backgroundColor: { token: "colorNeutralBackground3" } }, null],
		["white text on a solid dark grey", { color: "#FFFFFF", backgroundColor: { hex: "#555555", alpha: 1 } }, null],
		["light grey text on a solid dark grey", { color: "#BBBBBB", backgroundColor: { hex: "#555555", alpha: 1 } }, "3.88:1"],
		["translucent text (black at 40% shows as #999999)", { color: { hex: "#000000", alpha: 0.4 } }, "2.85:1"],
		["a token with a non-hex light value", { color: { token: "colorTransparentBackground" } }, null],
		["a background token with a non-hex light value", { color: "#FFFFFF", backgroundColor: { token: "colorTransparentBackground" } }, null],
		["a fromOption text colour", { color: { fromOption: "a" } }, null],
		["a fromOption background", { color: "#FFFFFF", backgroundColor: { fromOption: "a" } }, null],
		["no text colour", { backgroundColor: "#000000" }, null],
		["an invalid text colour (unvalidated rule)", { color: "red" }, null],
		["an invalid background (unvalidated rule)", { color: "#FFFFFF", backgroundColor: "red" }, null],
	])("%s", (_, style, ratio) => {
		const warning = contrastWarning(rule(style), defaults);
		if (ratio === null) expect(warning).toBeNull();
		else expect(warning).toContain(` ${ratio} `);
	});

	it("uses the config's tintAlpha for translucent backgrounds", () => {
		const style = { color: "#FFFFFF", backgroundColor: "#C50F1F" };
		expect(contrastWarning(rule(style), defaults)).not.toBeNull();
		expect(contrastWarning(rule(style), resolveDefaults({ tintAlpha: 1 }))).toBeNull();
	});

	it("skips pills, which pick their own text colour", () => {
		expect(contrastWarning(rule({ color: "#FFFF00", backgroundColor: "#FFFFFF" }, { display: "pill" }), defaults)).toBeNull();
	});

	it("skips stop-only rules", () => {
		expect(contrastWarning({ id: "r", scope: "row", stop: true }, defaults)).toBeNull();
	});
});
