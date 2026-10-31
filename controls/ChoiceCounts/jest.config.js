const base = require("../../jest.config.base");

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  // The control's tsconfig is the pcf-scripts base (no esModuleInterop), which the tests don't need.
  transform: { "^.+\\.tsx?$": ["ts-jest", { diagnostics: { ignoreCodes: ["TS151001"] } }] },
  // No logic yet. #53 adds logic.ts with its tests, collectCoverageFrom it and sets 100% thresholds like RagChoice.
  passWithNoTests: true,
};
