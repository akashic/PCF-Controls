// Checks the committed token table (engine/fluentTokens.ts) matches the schema's
// allow-list and Fluent's webLightTheme. If this fails, run
// `node scripts/generate-token-fallbacks.mjs` and commit the result.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { webLightTheme } from "@fluentui/react-components";
import { fluentColorTokens } from "../GridFormatter/engine/colours";

const schema = JSON.parse(readFileSync(join(__dirname, "..", "config", "grid-format.schema.json"), "utf8")) as {
	$defs: { fluentColorToken: { enum: string[] } };
};
const allowList = schema.$defs.fluentColorToken.enum;
const theme = webLightTheme as unknown as Record<string, string>;

describe("fluentTokens.ts", () => {
	it("has exactly the schema's token allow-list", () => {
		expect([...fluentColorTokens().keys()].sort()).toEqual([...allowList].sort());
	});

	it("has each token's webLightTheme value as its fallback", () => {
		for (const name of allowList) {
			expect([name, fluentColorTokens().get(name)]).toEqual([name, theme[name].replace(/\s+/g, "")]);
		}
	});
});
