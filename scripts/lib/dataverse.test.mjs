import assert from "node:assert/strict";
import { test } from "node:test";
import { arg, dataverseClient, normalizeUrl, odataString } from "./dataverse.mjs";

const argv = (...args) => ["node", "script.mjs", ...args];

test("arg reads a flag's value, or the fallback when the flag is absent", () => {
  assert.equal(arg("config", "default", argv("--config", "a.json")), "a.json");
  assert.equal(arg("config", "default", argv("--dry-run")), "default");
});

test("arg refuses a flag without a value, including one followed by another flag", () => {
  assert.throws(() => arg("config", "default", argv("--config")), /--config needs a value/);
  assert.throws(() => arg("config", "default", argv("--config", "--dry-run")), /--config needs a value/);
});

test("normalizeUrl and odataString", () => {
  assert.equal(normalizeUrl(" https://Org.crm6.dynamics.com// "), "https://org.crm6.dynamics.com");
  assert.equal(normalizeUrl(undefined), undefined);
  assert.equal(odataString("O'Brien"), "O''Brien");
});

/** A fetch stand-in that records requests and answers with `status` and `body`. */
function fakeFetch(status, body, entityId) {
  const requests = [];
  const impl = async (url, init) => {
    requests.push({ url, ...init });
    return {
      ok: status < 300,
      status,
      text: async () => (body === undefined ? "" : JSON.stringify(body)),
      json: async () => body,
      headers: { get: (h) => (h === "OData-EntityId" ? entityId : null) },
    };
  };
  return { impl, requests };
}

test("call adds the solution header only when asked, and returns the new row's id", async () => {
  const { impl, requests } = fakeFetch(204, undefined, "https://org/api/data/v9.2/things(1234)");
  const client = dataverseClient({ url: "https://Org/", token: "t", fetchImpl: impl });
  const { id } = await client.call("POST", "things", { a: 1 }, { solution: "WBX" });
  await client.call("POST", "things", { a: 1 });
  assert.equal(id, "1234");
  assert.equal(requests[0].url, "https://org/api/data/v9.2/things");
  assert.equal(requests[0].headers["MSCRM.SolutionUniqueName"], "WBX");
  assert.equal(requests[1].headers["MSCRM.SolutionUniqueName"], undefined);
});

test("call throws with the response body; get returns null; one returns the first row or null", async () => {
  const failing = dataverseClient({ url: "https://org", token: "t", fetchImpl: fakeFetch(400, { error: "bad" }).impl });
  await assert.rejects(failing.call("GET", "things"), /GET things → 400: \{"error":"bad"\}/);
  assert.equal(await failing.get("things"), null);
  await assert.rejects(failing.one("things"), /400/);
  const rows = dataverseClient({ url: "https://org", token: "t", fetchImpl: fakeFetch(200, { value: [{ n: 1 }, { n: 2 }] }).impl });
  assert.deepEqual(await rows.one("things"), { n: 1 });
  const empty = dataverseClient({ url: "https://org", token: "t", fetchImpl: fakeFetch(200, { value: [] }).impl });
  assert.equal(await empty.one("things"), null);
});
