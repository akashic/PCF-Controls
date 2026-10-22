const base = require("../../jest.config.base");

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  coverageThreshold: {
    global: { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
};
