import {
  BLACK,
  WHITE,
  bestTextColor,
  contrastRatio,
  normalizeHex,
  relativeLuminance,
  withAlpha,
  type HexColor,
} from "../src";

const hex = (value: string): HexColor => {
  const result = normalizeHex(value);
  if (!result) throw new Error(`test fixture ${value} is not a valid hex colour`);
  return result;
};

describe("normalizeHex", () => {
  it.each([
    ["#C50F1F", "#C50F1F"],
    ["#c50f1f", "#C50F1F"],
    ["C50F1F", "#C50F1F"],
    ["#abc", "#AABBCC"],
    ["#ABC", "#AABBCC"],
    ["  #00ff00 ", "#00FF00"],
  ])("normalises %p to %p", (input, expected) => {
    expect(normalizeHex(input)).toBe(expected);
  });

  it.each([
    ["RGB without #", "abc"],
    ["empty string", ""],
    ["whitespace", "   "],
    ["#RGBA", "#abcd"],
    ["#RRGGBBAA", "#C50F1F80"],
    ["five digits", "#C50F1"],
    ["non-hex digit", "#C50F1G"],
    ["double hash", "##C50F1F"],
    ["CSS name", "red"],
    ["rgb()", "rgb(197, 15, 31)"],
  ])("rejects %s (%p)", (_, input) => {
    expect(normalizeHex(input)).toBeNull();
  });

  it.each([null, undefined, 0xc50f1f, {}, ["#C50F1F"]])("rejects non-string %p", (input) => {
    expect(normalizeHex(input)).toBeNull();
  });
});

describe("withAlpha", () => {
  it("formats as rgba", () => {
    expect(withAlpha(hex("#C50F1F"), 0.18)).toBe("rgba(197, 15, 31, 0.18)");
  });

  it("rounds alpha to three decimal places", () => {
    expect(withAlpha(hex("#000"), 0.1 + 0.08)).toBe("rgba(0, 0, 0, 0.18)");
    expect(withAlpha(hex("#000"), 0.12345)).toBe("rgba(0, 0, 0, 0.123)");
  });

  it.each([
    [-0.5, 0],
    [0, 0],
    [1, 1],
    [1.5, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
  ])("clamps alpha %p to %p", (alpha, expected) => {
    expect(withAlpha(hex("#FFFFFF"), alpha)).toBe(`rgba(255, 255, 255, ${expected})`);
  });
});

describe("relativeLuminance", () => {
  it.each([
    ["#000000", 0],
    ["#FFFFFF", 1],
    ["#FF0000", 0.2126],
    ["#00FF00", 0.7152],
    ["#0000FF", 0.0722],
    ["#808080", 0.2158605],
  ])("%p has luminance %p", (input, expected) => {
    expect(relativeLuminance(hex(input))).toBeCloseTo(expected, 6);
  });

  it("uses the linear segment for very dark channels", () => {
    // 10/255 = 0.0392 is below the 0.04045 threshold, so it is divided by 12.92.
    expect(relativeLuminance(hex("#0A0A0A"))).toBeCloseTo(10 / 255 / 12.92, 9);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for identical colours", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 9);
    expect(contrastRatio(hex("#C50F1F"), hex("#C50F1F"))).toBe(1);
  });

  it("doesn't depend on argument order", () => {
    expect(contrastRatio(hex("#C50F1F"), WHITE)).toBe(contrastRatio(WHITE, hex("#C50F1F")));
  });

  it.each([
    // Expected values computed independently with the WCAG 2.x formula.
    ["#777777", "#FFFFFF", 4.48],
    ["#767676", "#FFFFFF", 4.54],
    ["#C50F1F", "#FFFFFF", 6.07],
  ])("%p on %p is %p:1", (a, b, expected) => {
    expect(contrastRatio(hex(a), hex(b))).toBeCloseTo(expected, 2);
  });
});

describe("bestTextColor", () => {
  it.each([
    ["#FFFFFF", BLACK],
    ["#FFF100", BLACK], // pale yellow
    ["#13A10E", BLACK], // Fluent green
    ["#FFB900", BLACK], // amber
    ["#0078D4", BLACK], // Fluent blue: 4.64:1 with black vs 4.53:1 with white
    ["#000000", WHITE],
    ["#C50F1F", WHITE], // Fluent red
    ["#0F6CBD", WHITE], // Fluent 9 brand blue
  ])("picks %p text on %p", (background, expected) => {
    expect(bestTextColor(hex(background))).toBe(expected);
  });

  it("switches from white to black at the equal-contrast point", () => {
    // Luminance sqrt(1.05 * 0.05) - 0.05 ≈ 0.1791 gives equal contrast with black and white.
    // #767676 has luminance 0.1812, the nearest 8-bit grey above the tie point.
    expect(bestTextColor(hex("#767676"))).toBe(BLACK);
    expect(bestTextColor(hex("#757575"))).toBe(WHITE);
  });
});
