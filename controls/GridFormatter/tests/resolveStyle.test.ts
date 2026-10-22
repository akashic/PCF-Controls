import { BLACK, WHITE } from "@wb-pcf/shared";
import type { Rule, TableConfig } from "../GridFormatter/engine/configSchema";
import {
	FONT_WEIGHTS,
	canDrawCell,
	createRowStyleCache,
	prepareRules,
	resolveStyles,
	rowStyleKey,
	ruleColumns,
	sortRules,
	type GridColumn,
	type PrepareOptions,
	type RowStyles,
} from "../GridFormatter/engine/resolveStyle";
import { AMBER, GREEN, RED, UNKNOWN, column, columns, example, getter, matchIds, ragColours, rowMatcher } from "./engineHelpers";

const config = (rules: Rule[], defaults?: TableConfig["defaults"]): TableConfig => ({ version: 1, defaults, rules });

/** Prepares `rules` for the test grid with RAG option colours, collecting warnings. */
function prepare(rules: Rule[], options: Partial<PrepareOptions> & { defaults?: TableConfig["defaults"] } = {}) {
	const warnings: string[] = [];
	const prepared = prepareRules({
		config: config(rules, options.defaults),
		columns: options.columns ?? columns,
		optionColours: options.optionColours ?? ragColours,
		warn: (message) => warnings.push(message),
	});
	return { prepared, warnings };
}

/** Cells as a plain object, for readable expectations. */
const cellsOf = (styles: RowStyles) => Object.fromEntries(styles.cells);

const RED_TINT = "rgba(209, 52, 56, 0.18)";
const GREY_TINT = "color-mix(in srgb, var(--colorNeutralBackground3, #f5f5f5) 18%, transparent)";
const GREY_TEXT = "var(--colorNeutralForeground3, #616161)";

describe("sortRules", () => {
	it("orders by ascending priority, defaulting to 0, ties in file order", () => {
		const rules: Rule[] = [
			{ id: "a", priority: 10, style: {} },
			{ id: "b", style: {} },
			{ id: "c", priority: -5, style: {} },
			{ id: "d", priority: 0, style: {} },
			{ id: "e", priority: 10, style: {} },
		];
		expect(sortRules(rules).map((r) => r.id)).toEqual(["c", "b", "d", "a", "e"]);
	});
});

describe("ruleColumns", () => {
	it("collects leaf, nested group and { column } operand columns", () => {
		const rule: Rule = {
			id: "r",
			when: {
				all: [
					{ column: "wb_budget", op: "isNotNull" },
					{ any: [{ column: "wb_actualcost", op: "gt", value: { column: "wb_budget" } }, { not: { column: "a.wb_x", op: "eq", value: 1 } }] },
					{ column: "wb_tags", op: "containsAny", value: [1, 2] },
				],
			},
			scope: "row",
			style: { fontStyle: "italic" },
		};
		expect(ruleColumns(rule)).toEqual(["wb_budget", "wb_actualcost", "a.wb_x", "wb_tags"]);
	});

	it("collects fromOption colours", () => {
		const rule: Rule = { id: "r", scope: "row", style: { backgroundColor: { fromOption: "wb_ragstatus" }, color: { fromOption: "wb_other" } } };
		expect(ruleColumns(rule)).toEqual(["wb_ragstatus", "wb_other"]);
	});

	it("is empty for an unconditional rule with static colours", () => {
		expect(ruleColumns({ id: "r", scope: "row", style: { color: "#000" } })).toEqual([]);
		expect(ruleColumns({ id: "r", scope: "row", stop: true })).toEqual([]);
	});
});

describe("canDrawCell (V7)", () => {
	it.each([
		["Text", false, true],
		["Text", true, false], // primary name: drawing it would remove the record link
		["Integer", false, true],
		["Decimal", false, true],
		["FloatingPoint", false, true],
		["Currency", false, true],
		["DateOnly", false, true],
		["DateAndTime", false, true],
		["OptionSet", false, true],
		["TwoOptions", false, true],
		["Lookup", false, false],
		["Customer", false, false],
		["Owner", false, false],
		["Persona", false, false],
		["MultiSelectPicklist", false, false],
		["File", false, false],
		["Image", false, false],
		["Email", false, false], // not in V7's list
	])("%s (primary: %p) → %p", (dataType, isPrimary, expected) => {
		expect(canDrawCell({ name: "c", dataType, isPrimary })).toBe(expected);
	});
});

describe("prepareRules", () => {
	describe("skips rules whose columns aren't all in the view, silently (V2)", () => {
		const visible: GridColumn[] = [column("wb_name"), column("wb_duedate"), column("wb_actualcost")];

		it.each<[string, Rule]>([
			["a condition column", { id: "r", when: { column: "statecode", op: "eq", value: 1 }, scope: "row", style: { fontStyle: "italic" } }],
			[
				"a { column } operand",
				{ id: "r", when: { column: "wb_actualcost", op: "gt", value: { column: "wb_budget" } }, style: { fontStyle: "italic" } },
			],
			["a nested condition column", { id: "r", when: { not: { all: [{ column: "wb_ragstatus", op: "isNull" }] } }, scope: "row", style: { fontStyle: "italic" } }],
			["a fromOption column", { id: "r", scope: "row", style: { backgroundColor: { fromOption: "wb_ragstatus" } } }],
		])("%s", (_, rule) => {
			const { prepared, warnings } = prepare([rule], { columns: visible });
			expect(prepared.rules).toHaveLength(0);
			expect(warnings).toEqual([]);
		});

		it("keeps a rule whose scope lists a missing column, styling only the visible ones", () => {
			const { prepared } = prepare([{ id: "r", scope: { columns: ["wb_duedate", "wb_budget"] }, style: { fontStyle: "italic" } }], { columns: visible });
			const styles = resolveStyles(prepared, getter({}), matchIds());
			expect([...styles.cells.keys()]).toEqual(["wb_duedate"]);
		});
	});

	it("lists every column the kept rules read, for memo keys", () => {
		const { prepared } = prepare(example("combined").rules);
		expect(prepared.referencedColumns).toEqual(["statecode", "wb_ragstatus", "wb_duedate"]);
	});

	describe("drops properties a column type can't show (V7)", () => {
		const rowRule: Rule = {
			id: "loud-row",
			scope: "row",
			style: { backgroundColor: "#C50F1F", color: "#C50F1F", fontWeight: "bold", fontStyle: "italic", textDecoration: "underline" },
		};

		it("keeps container properties on every column and color/fontWeight only where the control can draw", () => {
			const { prepared } = prepare([rowRule]);
			const cells = cellsOf(resolveStyles(prepared, getter({}), matchIds()));
			const container = { backgroundColor: RED_TINT.replace("209, 52, 56", "197, 15, 31"), fontStyle: "italic", textDecoration: "underline" };
			const drawn = { ...container, color: "#C50F1F", fontWeight: 700, customRender: true };
			expect(cells).toEqual({
				wb_name: { ...container, customRender: false },
				statecode: drawn,
				wb_ragstatus: drawn,
				wb_duedate: drawn,
				wb_budget: drawn,
				wb_actualcost: drawn,
				ownerid: { ...container, customRender: false },
				wb_account: { ...container, customRender: false },
				wb_tags: { ...container, customRender: false },
				wb_notes: drawn,
			});
		});

		it("warns once per unsupported column, naming the rule", () => {
			const { warnings } = prepare([rowRule]);
			expect(warnings).toEqual([
				'rule "loud-row": color, fontWeight can\'t be shown on column "wb_name" (Text, primary name); ignored there.',
				'rule "loud-row": color, fontWeight can\'t be shown on column "ownerid" (Persona); ignored there.',
				'rule "loud-row": color, fontWeight can\'t be shown on column "wb_account" (Lookup); ignored there.',
				'rule "loud-row": color, fontWeight can\'t be shown on column "wb_tags" (MultiSelectPicklist); ignored there.',
			]);
		});

		it("doesn't warn when a rule only sets container properties", () => {
			const { warnings } = prepare([{ id: "r", scope: "row", style: { backgroundColor: "#C50F1F", fontStyle: "italic" } }]);
			expect(warnings).toEqual([]);
		});

		it("drops a pill on a column it can't draw, keeping its container properties", () => {
			const { prepared, warnings } = prepare([
				{ id: "pill", scope: { columns: ["wb_account", "wb_ragstatus"] }, display: "pill", style: { backgroundColor: "#107C10", fontStyle: "italic" } },
			]);
			expect(warnings).toEqual(['rule "pill": display: pill can\'t be shown on column "wb_account" (Lookup); ignored there.']);
			expect(cellsOf(resolveStyles(prepared, getter({}), matchIds()))).toEqual({
				wb_account: { fontStyle: "italic", customRender: false },
				wb_ragstatus: { fontStyle: "italic", pill: { backgroundColor: "#107C10", color: WHITE }, customRender: true },
			});
		});
	});

	it("logs to the console and treats option colours as empty by default", () => {
		const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
		const prepared = prepareRules({
			config: config([
				{ id: "r", scope: { columns: ["wb_account"] }, style: { color: "#000" } },
				{ id: "rag", scope: "row", style: { backgroundColor: { fromOption: "wb_ragstatus" } } },
			]),
			columns,
		});
		expect(warn).toHaveBeenCalledWith('[GridFormatter] rule "r": color can\'t be shown on column "wb_account" (Lookup); ignored there.');
		expect(resolveStyles(prepared, getter({ wb_ragstatus: RED }), matchIds()).cells.size).toBe(0);
		warn.mockRestore();
	});
});

describe("resolveStyles precedence (§5.2.5)", () => {
	it("the first rule to set a property for a cell wins; later rules fill the rest", () => {
		const { prepared } = prepare([
			{ id: "first", priority: 1, scope: { columns: ["wb_duedate"] }, style: { backgroundColor: "#C50F1F" } },
			{ id: "second", priority: 2, scope: { columns: ["wb_duedate"] }, style: { backgroundColor: "#107C10", fontWeight: "bold" } },
		]);
		const styles = resolveStyles(prepared, getter({}), matchIds("first", "second"));
		expect(cellsOf(styles)).toEqual({
			wb_duedate: { backgroundColor: "rgba(197, 15, 31, 0.18)", fontWeight: 700, customRender: true },
		});
		expect(styles.matchedRuleIds).toEqual(["first", "second"]);
	});

	it("an earlier cell-scope property beats a later row-scope one, only in that cell", () => {
		const { prepared } = prepare(
			[
				{ id: "cell", priority: 1, scope: { columns: ["wb_duedate"] }, style: { textDecoration: "underline" } },
				{ id: "row", priority: 2, scope: "row", style: { textDecoration: "line-through" } },
			],
			{ columns: [column("wb_duedate"), column("wb_notes")] },
		);
		expect(cellsOf(resolveStyles(prepared, getter({}), matchIds("cell", "row")))).toEqual({
			wb_duedate: { textDecoration: "underline", customRender: false },
			wb_notes: { textDecoration: "line-through", customRender: false },
		});
	});

	it("an earlier row-scope property beats a later cell-scope one", () => {
		const { prepared } = prepare(
			[
				{ id: "row", priority: 1, scope: "row", style: { textDecoration: "line-through" } },
				{ id: "cell", priority: 2, scope: { columns: ["wb_duedate"] }, style: { textDecoration: "underline", fontStyle: "italic" } },
			],
			{ columns: [column("wb_duedate"), column("wb_notes")] },
		);
		expect(cellsOf(resolveStyles(prepared, getter({}), matchIds("cell", "row")))).toEqual({
			wb_duedate: { textDecoration: "line-through", fontStyle: "italic", customRender: false },
			wb_notes: { textDecoration: "line-through", customRender: false },
		});
	});

	it("priority ties keep file order, and an omitted priority is 0", () => {
		const { prepared } = prepare([
			{ id: "tie-a", priority: 0, scope: "row", style: { fontStyle: "italic" } },
			{ id: "late", priority: 1, scope: "row", style: { fontStyle: "normal" } },
			{ id: "tie-b", scope: "row", style: { fontStyle: "normal", textDecoration: "underline" } },
			{ id: "early", priority: -1, scope: "row", style: { textDecoration: "line-through" } },
		], { columns: [column("wb_notes")] });
		const styles = resolveStyles(prepared, getter({}), matchIds("tie-a", "tie-b", "late", "early"));
		expect(styles.matchedRuleIds).toEqual(["early", "tie-a", "tie-b", "late"]);
		expect(cellsOf(styles)).toEqual({ wb_notes: { fontStyle: "italic", textDecoration: "line-through", customRender: false } });
	});

	it("rules that don't match contribute nothing", () => {
		const { prepared } = prepare([
			{ id: "no", when: { column: "statecode", op: "eq", value: 1 }, scope: "row", style: { fontStyle: "italic" } },
			{ id: "yes", when: { column: "statecode", op: "eq", value: 0 }, scope: "row", style: { textDecoration: "underline" } },
		], { columns: [column("statecode")] });
		const styles = resolveStyles(prepared, getter({}), matchIds("yes"));
		expect(styles.matchedRuleIds).toEqual(["yes"]);
		expect(cellsOf(styles)).toEqual({ statecode: { textDecoration: "underline", customRender: false } });
	});

	it("a rule without when always matches, without calling the matcher", () => {
		const matcher = jest.fn(() => false);
		const { prepared } = prepare([{ id: "always", scope: { columns: ["wb_notes"] }, style: { fontStyle: "italic" } }]);
		expect(resolveStyles(prepared, getter({}), matcher).matchedRuleIds).toEqual(["always"]);
		expect(matcher).not.toHaveBeenCalled();
	});

	it("passes each rule with a when to the matcher", () => {
		const matcher = jest.fn(() => true);
		const rule: Rule = { id: "r", when: { column: "statecode", op: "eq", value: 1 }, style: { fontStyle: "italic" } };
		resolveStyles(prepare([rule]).prepared, getter({}), matcher);
		expect(matcher).toHaveBeenCalledWith(rule);
	});

	it("a leaf rule without a scope styles its condition's column", () => {
		const { prepared } = prepare([{ id: "r", when: { column: "wb_duedate", op: "beforeToday" }, style: { fontStyle: "italic" } }]);
		expect([...resolveStyles(prepared, getter({}), matchIds("r")).cells.keys()]).toEqual(["wb_duedate"]);
	});

	it("a group rule without a scope (rejected by validation) styles nothing", () => {
		const { prepared } = prepare([{ id: "r", when: { not: { column: "wb_duedate", op: "isNull" } }, style: { fontStyle: "italic" } }]);
		expect(resolveStyles(prepared, getter({}), matchIds("r")).cells.size).toBe(0);
	});

	describe("stop", () => {
		const rules: Rule[] = [
			{ id: "before", priority: 1, scope: "row", style: { fontStyle: "italic" } },
			{ id: "stopper", priority: 2, when: { column: "statecode", op: "eq", value: 1 }, scope: "row", style: { textDecoration: "line-through" }, stop: true },
			{ id: "after", priority: 3, scope: "row", style: { textDecoration: "underline", fontWeight: "bold" } },
		];
		const visible = [column("statecode")];

		it("ends evaluation for the row after applying the stopping rule", () => {
			const styles = resolveStyles(prepare(rules, { columns: visible }).prepared, getter({}), matchIds("stopper"));
			expect(styles.matchedRuleIds).toEqual(["before", "stopper"]);
			expect(cellsOf(styles)).toEqual({ statecode: { fontStyle: "italic", textDecoration: "line-through", customRender: false } });
		});

		it("only stops when the rule matches", () => {
			const styles = resolveStyles(prepare(rules, { columns: visible }).prepared, getter({}), matchIds());
			expect(styles.matchedRuleIds).toEqual(["before", "after"]);
			expect(cellsOf(styles)).toEqual({ statecode: { fontStyle: "italic", textDecoration: "underline", fontWeight: 700, customRender: true } });
		});

		it("a stop rule without a style stops formatting without styling", () => {
			const { prepared } = prepare([{ id: "halt", scope: "row", stop: true }, ...rules], { columns: visible });
			const styles = resolveStyles(prepared, getter({}), matchIds("stopper"));
			expect(styles.matchedRuleIds).toEqual(["halt"]);
			expect(styles.cells.size).toBe(0);
		});
	});

	describe("fromOption with no colour", () => {
		const rules: Rule[] = [
			{ id: "rag", priority: 1, scope: "row", style: { backgroundColor: { fromOption: "wb_ragstatus", alpha: "tint" } } },
			{ id: "grey", priority: 2, scope: "row", style: { backgroundColor: { token: "colorNeutralBackground3" } } },
		];
		const visible = [column("wb_ragstatus")];

		it("doesn't set the property, so a later rule may", () => {
			const { prepared } = prepare(rules, { columns: visible });
			expect(cellsOf(resolveStyles(prepared, getter({ wb_ragstatus: UNKNOWN }), matchIds()))).toEqual({
				wb_ragstatus: { backgroundColor: GREY_TINT, customRender: false },
			});
			expect(cellsOf(resolveStyles(prepared, getter({ wb_ragstatus: RED }), matchIds()))).toEqual({
				wb_ragstatus: { backgroundColor: RED_TINT, customRender: false },
			});
		});

		it("uses defaults.fallbackColor when there is one", () => {
			const { prepared } = prepare(rules, { columns: visible, defaults: { fallbackColor: "#808080" } });
			expect(cellsOf(resolveStyles(prepared, getter({ wb_ragstatus: UNKNOWN }), matchIds()))).toEqual({
				wb_ragstatus: { backgroundColor: "rgba(128, 128, 128, 0.18)", customRender: false },
			});
		});

		it("leaves no cell at all when nothing else styles it", () => {
			const { prepared } = prepare([rules[0]], { columns: visible });
			expect(resolveStyles(prepared, getter({ wb_ragstatus: null }), matchIds()).cells.size).toBe(0);
		});
	});

	describe("pills", () => {
		const pill = (id: string, backgroundColor: NonNullable<Rule["style"]>["backgroundColor"], priority = 0): Rule => ({
			id,
			priority,
			when: { column: "wb_ragstatus", op: "isNotNull" },
			display: "pill",
			style: { backgroundColor },
		});
		const visible = [column("wb_ragstatus"), column("wb_notes")];

		it("draws the cell as a solid pill with contrasting text, even for a tint", () => {
			const { prepared } = prepare([pill("p", { fromOption: "wb_ragstatus", alpha: "tint" })], { columns: visible });
			expect(cellsOf(resolveStyles(prepared, getter({ wb_ragstatus: AMBER }), matchIds("p")))).toEqual({
				wb_ragstatus: { pill: { backgroundColor: "#FFB900", color: BLACK }, customRender: true },
			});
		});

		it("the first matching pill wins for a cell", () => {
			const { prepared } = prepare([pill("second", "#107C10", 2), pill("first", "#D13438", 1)], { columns: visible });
			expect(cellsOf(resolveStyles(prepared, getter({}), matchIds("first", "second")))).toEqual({
				wb_ragstatus: { pill: { backgroundColor: "#D13438", color: WHITE }, customRender: true },
			});
		});

		it("a pill with no colour lets a later pill rule set it", () => {
			const { prepared } = prepare([pill("rag", { fromOption: "wb_ragstatus" }, 1), pill("grey", { token: "colorNeutralBackground5" }, 2)], {
				columns: visible,
			});
			expect(cellsOf(resolveStyles(prepared, getter({ wb_ragstatus: UNKNOWN }), matchIds("rag", "grey")))).toEqual({
				wb_ragstatus: { pill: { backgroundColor: "var(--colorNeutralBackground5, #ebebeb)", color: BLACK }, customRender: true },
			});
		});

		it("doesn't count as the cell's background, so a row tint still shows around it", () => {
			const { prepared } = prepare(
				[pill("p", { fromOption: "wb_ragstatus" }, 1), { id: "tint", priority: 2, scope: "row", style: { backgroundColor: { fromOption: "wb_ragstatus" } } }],
				{ columns: visible },
			);
			expect(cellsOf(resolveStyles(prepared, getter({ wb_ragstatus: RED }), matchIds("p")))).toEqual({
				wb_ragstatus: { backgroundColor: RED_TINT, pill: { backgroundColor: "#D13438", color: WHITE }, customRender: true },
				wb_notes: { backgroundColor: RED_TINT, customRender: false },
			});
		});

		it("ignores its own color and drops a color set by another rule", () => {
			const { prepared } = prepare(
				[
					{ ...pill("p", "#107C10", 1), style: { backgroundColor: "#107C10", color: "#000000", fontWeight: "bold" } },
					{ id: "red-text", priority: 2, scope: "row", style: { color: "#C50F1F" } },
				],
				{ columns: visible },
			);
			expect(cellsOf(resolveStyles(prepared, getter({}), matchIds("p")))).toEqual({
				wb_ragstatus: { fontWeight: FONT_WEIGHTS.bold, pill: { backgroundColor: "#107C10", color: WHITE }, customRender: true },
				wb_notes: { color: "#C50F1F", customRender: true },
			});
		});
	});

	it("maps font weights to 400, 600 and 700", () => {
		const weights = (["normal", "semibold", "bold"] as const).map((fontWeight) => {
			const { prepared } = prepare([{ id: "r", scope: "row", style: { fontWeight } }], { columns: [column("wb_notes")] });
			return resolveStyles(prepared, getter({}), matchIds()).cells.get("wb_notes")?.fontWeight;
		});
		expect(weights).toEqual([400, 600, 700]);
	});
});

describe("resolveStyles with the example configs", () => {
	const resolve = (name: string, row: Record<string, unknown>) => {
		const { prepared, warnings } = prepare(example(name).rules);
		const getValue = getter(row);
		return { styles: resolveStyles(prepared, getValue, rowMatcher(getValue)), warnings };
	};

	describe("combined.json", () => {
		it("greys an inactive row and stops, so RAG and overdue don't apply", () => {
			const { styles, warnings } = resolve("combined", { statecode: 1, wb_ragstatus: RED, wb_duedate: "2026-01-01" });
			expect(styles.matchedRuleIds).toEqual(["inactive-grey"]);
			expect(styles.cells.get("wb_duedate")).toEqual({ backgroundColor: GREY_TINT, color: GREY_TEXT, customRender: true });
			// The primary name, Owner and Lookup keep the grey background but not the grey text (V7).
			expect(styles.cells.get("wb_name")).toEqual({ backgroundColor: GREY_TINT, customRender: false });
			expect(warnings).toEqual(expect.arrayContaining([expect.stringContaining('rule "inactive-grey": color can\'t be shown on column "wb_name"')]));
		});

		it("tints an active row by RAG and makes an overdue date bold red", () => {
			const { styles } = resolve("combined", { statecode: 0, wb_ragstatus: RED, wb_duedate: "2026-01-01" });
			expect(styles.matchedRuleIds).toEqual(["rag-row", "overdue"]);
			expect(styles.cells.get("wb_duedate")).toEqual({ backgroundColor: RED_TINT, color: "#C50F1F", fontWeight: 700, customRender: true });
			expect(styles.cells.get("wb_notes")).toEqual({ backgroundColor: RED_TINT, customRender: false });
		});

		it("doesn't flag an overdue date when RAG is Green", () => {
			const { styles } = resolve("combined", { statecode: 0, wb_ragstatus: GREEN, wb_duedate: "2026-01-01" });
			expect(styles.matchedRuleIds).toEqual(["rag-row"]);
			expect(styles.cells.get("wb_duedate")).toEqual({ backgroundColor: "rgba(16, 124, 16, 0.18)", customRender: false });
		});

		it("leaves an active row with an Unknown RAG and a future date plain", () => {
			const { styles } = resolve("combined", { statecode: 0, wb_ragstatus: UNKNOWN, wb_duedate: "2027-01-01" });
			expect(styles.matchedRuleIds).toEqual(["rag-row"]);
			expect(styles.cells.size).toBe(0);
		});
	});

	it("rag-cell.json draws the RAG cell as a pill", () => {
		expect(cellsOf(resolve("rag-cell", { wb_ragstatus: GREEN }).styles)).toEqual({
			wb_ragstatus: { pill: { backgroundColor: "#107C10", color: WHITE }, customRender: true },
		});
		expect(resolve("rag-cell", { wb_ragstatus: null }).styles.cells.size).toBe(0);
	});

	it("over-budget.json compares two columns", () => {
		expect(cellsOf(resolve("over-budget", { wb_budget: 100, wb_actualcost: 150 }).styles)).toEqual({
			wb_actualcost: {
				backgroundColor: "rgba(197, 15, 31, 0.12)",
				color: "var(--colorPaletteRedForeground1, #bc2f32)",
				fontWeight: 600,
				customRender: true,
			},
		});
		expect(resolve("over-budget", { wb_budget: 100, wb_actualcost: 50 }).styles.cells.size).toBe(0);
	});

	it("rag-row.json and inactive-grey.json skip silently on a view without their columns", () => {
		const nameOnly = [column("wb_name")];
		for (const name of ["rag-row", "inactive-grey", "overdue-bold-red"]) {
			const { prepared, warnings } = prepare(example(name).rules, { columns: nameOnly });
			expect([name, prepared.rules.length, warnings]).toEqual([name, 0, []]);
		}
	});
});

describe("row memoisation (§5.9)", () => {
	const { prepared } = prepare(example("combined").rules);

	it("keys a row by __rec_id and the values of the columns the rules read", () => {
		const row = { statecode: 0, wb_ragstatus: RED, wb_duedate: "2026-01-01", wb_notes: "ignored" };
		expect(rowStyleKey(prepared, "rec-1", getter(row))).toBe('rec-1\u0000[0,948790000,"2026-01-01"]');
		expect(rowStyleKey(prepared, "rec-1", getter({}))).toBe("rec-1\u0000[null,null,null]");
	});

	it("resolves a row once while its referenced values are unchanged", () => {
		const cache = createRowStyleCache(prepared);
		const row: Record<string, unknown> = { statecode: 0, wb_ragstatus: RED, wb_duedate: "2026-01-01" };
		const matcher = jest.fn(rowMatcher(getter(row)));

		const first = cache.get("rec-1", getter(row), matcher);
		const calls = matcher.mock.calls.length;
		expect(cache.get("rec-1", getter({ ...row, wb_notes: "edited" }), matcher)).toBe(first);
		expect(matcher).toHaveBeenCalledTimes(calls);

		const changed = { ...row, wb_ragstatus: GREEN };
		expect(cache.get("rec-1", getter(changed), rowMatcher(getter(changed)))).not.toBe(first);
		expect(cache.get("rec-2", getter(row), matcher)).not.toBe(first);
		expect(cache.size).toBe(3);

		cache.clear();
		expect(cache.size).toBe(0);
	});

	it("starts again when it reaches maxEntries", () => {
		const cache = createRowStyleCache(prepared, 2);
		for (const id of ["a", "b", "c"]) cache.get(id, getter({}), matchIds());
		expect(cache.size).toBe(1);
	});
});
