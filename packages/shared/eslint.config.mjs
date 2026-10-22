import eslintjs from "@eslint/js";
import microsoftPowerApps from "@microsoft/eslint-plugin-power-apps";
import globals from "globals";
import typescriptEslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ["coverage", "*.config.{js,mjs}"],
  },
  eslintjs.configs.recommended,
  ...typescriptEslint.configs.recommendedTypeChecked,
  ...typescriptEslint.configs.stylisticTypeChecked,
  microsoftPowerApps.configs.paCheckerHosted,
  {
    plugins: {
      "@microsoft/power-apps": microsoftPowerApps,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
