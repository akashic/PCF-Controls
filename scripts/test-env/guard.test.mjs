// Tests for scripts/test-env/guard.mjs. Run with `npm run test:scripts`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isTestEnvironment, testEnvironments } from "./guard.mjs";

describe("test environment guard", () => {
  test("defaults to LowCode when DATAVERSE_TEST_ENVS is unset or empty", () => {
    assert.deepEqual(testEnvironments(undefined), ["https://lowcode.crm.dynamics.com"]);
    assert.deepEqual(testEnvironments("  "), ["https://lowcode.crm.dynamics.com"]);
  });

  test("reads a comma-separated list, ignoring case, spaces and trailing slashes", () => {
    assert.deepEqual(testEnvironments("https://A.crm6.dynamics.com/, https://b.crm6.dynamics.com,"), [
      "https://a.crm6.dynamics.com",
      "https://b.crm6.dynamics.com",
    ]);
  });

  test("allows only listed environments", () => {
    const allowed = testEnvironments(undefined);
    assert.equal(isTestEnvironment("https://lowcode.crm.dynamics.com", allowed), true);
    assert.equal(isTestEnvironment("https://LowCode.crm.dynamics.com/", allowed), true);
    assert.equal(isTestEnvironment("https://wb-prod.crm6.dynamics.com", allowed), false);
    assert.equal(isTestEnvironment("https://lowcode.crm.dynamics.com.evil.example", allowed), false);
    assert.equal(isTestEnvironment("", allowed), false);
    assert.equal(isTestEnvironment(undefined, allowed), false);
  });

  test("a custom list replaces the default", () => {
    assert.equal(isTestEnvironment("https://lowcode.crm.dynamics.com", testEnvironments("https://other.crm.dynamics.com")), false);
  });
});
