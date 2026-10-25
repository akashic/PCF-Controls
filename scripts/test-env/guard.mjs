// Which Dataverse environments the test-environment scripts may write to.
// The scripts create tables, rows and configuration, so lib.mjs refuses any DATAVERSE_URL
// that isn't in DATAVERSE_TEST_ENVS (comma-separated environment URLs).
// See docs/testing/gridformatter-test-environment.md §2.

export const DEFAULT_TEST_ENVS = "https://lowcode.crm.dynamics.com";

const normalize = (url) => url.trim().replace(/\/+$/, "").toLowerCase();

/** The normalised allow-list from a DATAVERSE_TEST_ENVS value, or the default when it's unset or empty. */
export function testEnvironments(value) {
  const list = (value?.trim() ? value : DEFAULT_TEST_ENVS).split(",").map(normalize).filter(Boolean);
  return [...new Set(list)];
}

/** True when `url` is one of the allowed test environments (ignoring case and trailing slashes). */
export function isTestEnvironment(url, allowList) {
  return Boolean(url?.trim()) && allowList.includes(normalize(url));
}
