import { BLACK, WHITE } from "@wb-pcf/shared";
import {
	DEFAULT_TINT_ALPHA,
	backgroundLayer,
	fluentColorTokens,
	isColourToken,
	lightAppearance,
	optionColour,
	pillSpec,
	resolveColour,
	resolveDefaults,
	resolveStaticColour,
	unpackTokens,
	type ColourContext,
	type ColourDefaults,
} from "../GridFormatter/engine/colours";
import { AMBER, GREEN, RED, UNKNOWN, getter, hex, ragColours } from "./engineHelpers";

const TINT = 0.18;

describe("resolveDefaults", () => {
	it("fills in tintAlpha 0.18 and no fallback colour", () => {
		expect(resolveDefaults(undefined)).toEqual({ tintAlpha: DEFAULT_TINT_ALPHA, fallbackColor: null });
		expect(resolveDefaults({})).toEqual({ tintAlpha: 0.18, fallbackColor: null });
	});

	it("keeps the config's values", () => {
		expect(resolveDefaults({ tintAlpha: 0.25, fallbackColor: "#888" })).toEqual({ tintAlpha: 0.25, fallbackColor: "#888" });
	});
});

describe("tokens", () => {
	it("unpacks shared prefixes, hex values and literal CSS values", () => {
		const tokens = unpackTokens("0NeutralBackground1=ffffff|h2=fafafa|0Overlay=rgba(0,0,0,0.4)|0Transparent=transparent");
		expect([...tokens]).toEqual([
			["colorNeutralBackground1", "#ffffff"],
			["colorNeutralBackground2", "#fafafa"],
			["colorOverlay", "rgba(0,0,0,0.4)"],
			["colorTransparent", "transparent"],
		]);
	});

	it("unpacks the generated allow-list once", () => {
		const tokens = fluentColorTokens();
		expect(tokens.size).toBe(339);
		expect(tokens.get("colorNeutralBackground3")).toBe("#f5f5f5");
		expect(fluentColorTokens()).toBe(tokens);
	});

	it.each([
		["colorNeutralBackground3", true],
		["colorPaletteRedForeground1", true],
		["colorNeutralBackgroundGrey", false],
		["neutralBackground3", false],
		["", false],
		[42, false],
		[undefined, false],
	])("isColourToken(%p) is %p", (name, expected) => {
		expect(isColourToken(name)).toBe(expected);
	});
});

describe("resolveStaticColour", () => {
	describe("hex", () => {
		it("is solid as text and in a pill", () => {
			expect(resolveStaticColour("#C50F1F", "text", TINT)).toEqual({ css: "#C50F1F", base: "#C50F1F", alpha: 1 });
			expect(resolveStaticColour("#c50f1f", "pill", TINT)).toEqual({ css: "#C50F1F", base: "#C50F1F", alpha: 1 });
		});

		it("is translucent at tintAlpha as a background (V6)", () => {
			expect(resolveStaticColour("#C50F1F", "background", TINT)).toEqual({ css: "rgba(197, 15, 31, 0.18)", base: "#C50F1F", alpha: 0.18 });
			expect(resolveStaticColour("#abc", "background", 0.3)?.css).toBe("rgba(170, 187, 204, 0.3)");
		});

		it("returns null for an invalid hex", () => {
			expect(resolveStaticColour("red", "text", TINT)).toBeNull();
		});
	});

	describe("hex with alpha", () => {
		it("uses the explicit alpha for text and backgrounds", () => {
			expect(resolveStaticColour({ hex: "#C50F1F", alpha: 0.12 }, "background", TINT)).toEqual({
				css: "rgba(197, 15, 31, 0.12)",
				base: "#C50F1F",
				alpha: 0.12,
			});
			expect(resolveStaticColour({ hex: "#C50F1F", alpha: 0.5 }, "text", TINT)?.css).toBe("rgba(197, 15, 31, 0.5)");
		});

		it("is opaque at alpha 1", () => {
			expect(resolveStaticColour({ hex: "#C50F1F", alpha: 1 }, "background", TINT)?.css).toBe("#C50F1F");
		});

		it("is solid in a pill whatever the alpha", () => {
			expect(resolveStaticColour({ hex: "#C50F1F", alpha: 0.2 }, "pill", TINT)?.css).toBe("#C50F1F");
		});

		it.each([
			[2, 1, "#C50F1F"],
			[-1, 0, "rgba(197, 15, 31, 0)"],
			[Number.NaN, 1, "#C50F1F"],
		])("clamps alpha %p to %p", (alpha, expected, css) => {
			expect(resolveStaticColour({ hex: "#C50F1F", alpha }, "text", TINT)).toMatchObject({ alpha: expected, css });
		});

		it("returns null for an invalid hex", () => {
			expect(resolveStaticColour({ hex: "#C50F1", alpha: 0.5 }, "text", TINT)).toBeNull();
		});
	});

	describe("token", () => {
		it("is a CSS variable with the webLightTheme fallback as text and in a pill", () => {
			const expected = { css: "var(--colorNeutralForeground3, #616161)", base: "#616161", alpha: 1 };
			expect(resolveStaticColour({ token: "colorNeutralForeground3" }, "text", TINT)).toEqual(expected);
			expect(resolveStaticColour({ token: "colorNeutralForeground3" }, "pill", TINT)).toEqual(expected);
		});

		it("is mixed with transparent at tintAlpha as a background (V6)", () => {
			expect(resolveStaticColour({ token: "colorNeutralBackground3" }, "background", TINT)).toEqual({
				css: "color-mix(in srgb, var(--colorNeutralBackground3, #f5f5f5) 18%, transparent)",
				base: "#F5F5F5",
				alpha: 0.18,
			});
			expect(resolveStaticColour({ token: "colorNeutralBackground3" }, "background", 0.125)?.css).toContain(" 12.5%, transparent)");
		});

		it("has no base hex when the light value isn't a hex colour", () => {
			expect(resolveStaticColour({ token: "colorTransparentBackground" }, "text", TINT)).toEqual({
				css: "var(--colorTransparentBackground, transparent)",
				base: null,
				alpha: 1,
			});
		});

		it("returns null for a token that isn't in the allow-list", () => {
			expect(resolveStaticColour({ token: "colorNeutralBackgroundGrey" }, "text", TINT)).toBeNull();
		});
	});
});

describe("optionColour", () => {
	it.each([
		["a number", RED, "#D13438"],
		["a numeric string (raw grid value)", String(AMBER), "#FFB900"],
		["another option", GREEN, "#107C10"],
	])("finds the colour for %s", (_, value, expected) => {
		expect(optionColour("wb_ragstatus", value, ragColours)).toBe(expected);
	});

	it("normalises the metadata colour", () => {
		expect(optionColour("wb_x", 1, new Map([["wb_x", new Map([[1, "#d13438"]])]]))).toBe("#D13438");
	});

	it.each([
		["an option with no colour", UNKNOWN],
		["an empty value", null],
		["undefined", undefined],
		["an empty string", ""],
		["a non-numeric string", "Red"],
		["a multi-select array", [RED]],
	])("returns null for %s", (_, value) => {
		expect(optionColour("wb_ragstatus", value, ragColours)).toBeNull();
	});

	it("returns null for a column with no option colours", () => {
		expect(optionColour("wb_other", RED, ragColours)).toBeNull();
	});

	it("returns null for an invalid metadata colour", () => {
		expect(optionColour("wb_x", 1, new Map([["wb_x", new Map([[1, "red"]])]]))).toBeNull();
	});
});

describe("resolveColour", () => {
	const context = (row: Record<string, unknown>, defaults: Partial<ColourDefaults> = {}): ColourContext => ({
		defaults: { tintAlpha: TINT, fallbackColor: null, ...defaults },
		optionColours: ragColours,
		getValue: getter(row),
	});
	const red = { wb_ragstatus: RED };

	it("passes static colours through", () => {
		expect(resolveColour("#C50F1F", "text", context({}))?.css).toBe("#C50F1F");
		expect(resolveColour({ token: "colorNeutralBackground3" }, "background", context({}))?.alpha).toBe(TINT);
	});

	describe("fromOption", () => {
		it("is solid as text without an alpha", () => {
			expect(resolveColour({ fromOption: "wb_ragstatus" }, "text", context(red))).toEqual({ css: "#D13438", base: "#D13438", alpha: 1 });
		});

		it("is translucent at tintAlpha as a background without an alpha", () => {
			expect(resolveColour({ fromOption: "wb_ragstatus" }, "background", context(red))?.css).toBe("rgba(209, 52, 56, 0.18)");
		});

		it('uses tintAlpha for "tint" in any usage but a pill', () => {
			const tint = { fromOption: "wb_ragstatus", alpha: "tint" } as const;
			expect(resolveColour(tint, "background", context(red, { tintAlpha: 0.2 }))?.css).toBe("rgba(209, 52, 56, 0.2)");
			expect(resolveColour(tint, "text", context(red, { tintAlpha: 0.2 }))?.css).toBe("rgba(209, 52, 56, 0.2)");
			expect(resolveColour(tint, "pill", context(red))?.css).toBe("#D13438");
		});

		it("uses an explicit numeric alpha", () => {
			expect(resolveColour({ fromOption: "wb_ragstatus", alpha: 0.4 }, "background", context(red))?.css).toBe("rgba(209, 52, 56, 0.4)");
		});

		it("returns null when there's no colour and no fallback", () => {
			expect(resolveColour({ fromOption: "wb_ragstatus" }, "background", context({ wb_ragstatus: UNKNOWN }))).toBeNull();
			expect(resolveColour({ fromOption: "wb_ragstatus" }, "background", context({ wb_ragstatus: null }))).toBeNull();
		});

		it("uses defaults.fallbackColor, resolved as written, when there's no colour", () => {
			const unknown = { wb_ragstatus: UNKNOWN };
			expect(resolveColour({ fromOption: "wb_ragstatus" }, "pill", context(unknown, { fallbackColor: "#888888" }))?.css).toBe("#888888");
			expect(resolveColour({ fromOption: "wb_ragstatus" }, "background", context(unknown, { fallbackColor: "#888888" }))?.css).toBe(
				"rgba(136, 136, 136, 0.18)",
			);
			expect(
				resolveColour({ fromOption: "wb_ragstatus", alpha: 0.5 }, "text", context(unknown, { fallbackColor: { token: "colorNeutralForeground3" } }))
					?.css,
			).toBe("var(--colorNeutralForeground3, #616161)");
		});
	});
});

describe("pillSpec", () => {
	it.each([
		["#D13438", WHITE], // Red
		["#FFB900", BLACK], // Amber
		["#107C10", WHITE], // Green
	])("draws %p with %p text", (fill, text) => {
		expect(pillSpec({ css: fill, base: hex(fill), alpha: 1 })).toEqual({ backgroundColor: fill, color: text });
	});

	it("uses black text when the fill has no hex base", () => {
		expect(pillSpec({ css: "var(--colorTransparentBackground, transparent)", base: null, alpha: 1 }).color).toBe(BLACK);
	});
});

describe("lightAppearance", () => {
	it("composites the colour at its alpha over white", () => {
		expect(lightAppearance({ css: "", base: hex("#C50F1F"), alpha: 0.18 })).toBe("#F5D4D7");
		expect(lightAppearance({ css: "", base: hex("#C50F1F"), alpha: 1 })).toBe("#C50F1F");
	});

	it("composites over another colour", () => {
		expect(lightAppearance({ css: "", base: WHITE, alpha: 0.5 }, BLACK)).toBe("#808080");
	});

	it("is null without a hex base", () => {
		expect(lightAppearance({ css: "transparent", base: null, alpha: 1 })).toBeNull();
	});

	it("shows the inactive-grey recipe's background as a visible grey, unlike colorNeutralBackground3 (configuration.md)", () => {
		const seen = (token: string) => lightAppearance(resolveStaticColour({ token }, "background", TINT)!);
		expect(seen("colorNeutralForeground3")).toBe("#E3E3E3");
		expect(seen("colorNeutralBackground3")).toBe("#FDFDFD");
		expect(seen("colorNeutralBackground5")).toBe("#FBFBFB");
	});
});

describe("backgroundLayer", () => {
	it("is a one-colour gradient for background-image (V6)", () => {
		expect(backgroundLayer("rgba(209, 52, 56, 0.18)")).toBe("linear-gradient(rgba(209, 52, 56, 0.18), rgba(209, 52, 56, 0.18))");
	});
});
