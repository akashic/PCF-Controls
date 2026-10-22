// Shared Jest settings. Each workspace's jest.config.js spreads this and adds
// its own coverage thresholds, so `npm test -w <workspace>` runs on its own.

/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts?(x)"],
  collectCoverage: true,
  collectCoverageFrom: ["<rootDir>/src/**/*.ts?(x)", "<rootDir>/*/**/*.ts?(x)", "!**/generated/**", "!**/*.d.ts"],
  coveragePathIgnorePatterns: ["/node_modules/", "/tests/", "/out/", "/coverage/"],
  coverageReporters: ["text-summary", "lcov"],
};
