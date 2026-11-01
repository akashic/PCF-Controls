// Dataverse Web API helpers shared by the repo's scripts: the test-environment scripts (scripts/test-env/lib.mjs,
// which adds the test-environment guard) and plug-in registration (plugins/*/scripts/register.mjs, which adds --env).
// No environment checks here: each caller decides where it's allowed to write before it creates a client.

/**
 * Reads `--name value` from the command line. Returns `fallback` when the flag is absent.
 * Throws when the flag is present without a value (or its "value" is another flag), so a forgotten value can't
 * silently turn the next flag into data: `--config --dry-run` would otherwise lose the dry run.
 */
export function arg(name, fallback = undefined, argv = process.argv) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
  return value;
}

/** A Dataverse Label in English (1033). */
export const label = (text) => ({
  "@odata.type": "Microsoft.Dynamics.CRM.Label",
  LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: text, LanguageCode: 1033 }],
});

/** The environment URL without a trailing slash, in lower case, for comparing and building URLs. */
export const normalizeUrl = (url) => url?.trim().replace(/\/+$/, "").toLowerCase();

/** Doubles single quotes for an OData string literal. */
export const odataString = (text) => text.replace(/'/g, "''");

/**
 * A Web API client for one environment.
 * - `call` throws with the response body on failure, and returns `{ json, id }` (id from OData-EntityId).
 *   Pass `solution` to add MSCRM.SolutionUniqueName, so new components land in that unmanaged solution.
 * - `get` returns the parsed body, or null on any failure (for "does this exist?" checks).
 * - `one` returns the first row of a collection query, or null when there are none; it throws on failure.
 * - `publish` publishes tables and web resources.
 */
export function dataverseClient({ url, token, fetchImpl = fetch, retryDelayMs = 2000 }) {
  const api = `${normalizeUrl(url)}/api/data/v9.2`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
  };

  // Connections to Dataverse sometimes time out (ETIMEDOUT) before a request is sent. Reads are retried, up to three
  // attempts; writes aren't, because a write that did reach the server would be repeated (a second row, say).
  async function send(method, url, init) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fetchImpl(url, init);
      } catch (error) {
        if (method !== "GET" || attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }

  async function call(method, path, body, { solution, extraHeaders = {} } = {}) {
    const solutionHeader = solution ? { "MSCRM.SolutionUniqueName": solution } : {};
    const res = await send(method, `${api}/${path}`, {
      method,
      headers: { ...headers, ...solutionHeader, ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 800)}`);
    const entityId = res.headers.get("OData-EntityId");
    return { json: text ? JSON.parse(text) : null, id: entityId?.match(/\(([^)]+)\)$/)?.[1] ?? null };
  }

  async function get(path) {
    const res = await send("GET", `${api}/${path}`, { headers });
    return res.ok ? res.json() : null;
  }

  async function one(path) {
    const { json } = await call("GET", path);
    return json?.value?.[0] ?? null;
  }

  async function publish({ entities = [], webresources = [] }) {
    const xml =
      "<importexportxml>" +
      (entities.length ? `<entities>${entities.map((e) => `<entity>${e}</entity>`).join("")}</entities>` : "") +
      (webresources.length ? `<webresources>${webresources.map((w) => `<webresource>{${w}}</webresource>`).join("")}</webresources>` : "") +
      "</importexportxml>";
    await call("POST", "PublishXml", { ParameterXml: xml });
  }

  return { api, call, get, one, publish };
}
