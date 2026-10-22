const base = require("../../jest.config.base");

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  // The control's tsconfig is the pcf-scripts base (no esModuleInterop), which the tests don't need.
  transform: { "^.+\\.tsx?$": ["ts-jest", { diagnostics: { ignoreCodes: ["TS151001"] } }] },
  // Renderers, stores and the PCF class are checked in dev; the pure engine must be fully covered.
  collectCoverageFrom: ["<rootDir>/GridFormatter/engine/**/*.ts"],
  coverageThreshold: {
    global: { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
};
