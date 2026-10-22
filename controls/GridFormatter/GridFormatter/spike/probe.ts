// Temporary instrumentation for the VERIFY spikes V1–V8 (issue #9).
// Replaced by the real engine in #13; nothing here is production code.
//
// Every finding is logged once to the console with the prefix below and
// collected on window.__wbSpike. In DevTools, run copy(JSON.stringify(__wbSpike, null, 2))
// to copy everything gathered so far.
//
// Runtime switches (sessionStorage; reload the page after changing):
//   wb_spike_style      "container" (default) | "render" | "off"   (V6/V7 technique)
//   wb_spike_bg         "tint" (default) | "token"                 (token = var(--colorNeutralBackground3))
//   wb_spike_delayFire  milliseconds to delay fireEvent            (V5)

const PREFIX = "[WB GridFormatter spike]";
const store: Record<string, unknown> = {};
const seen = new Set<string>();
const t0 = performance.now();

(window as unknown as { __wbSpike: Record<string, unknown> }).__wbSpike = store;

export const elapsed = (): number => Math.round(performance.now() - t0);

/** Records a finding once per key. */
export function record(key: string, data: unknown): void {
  if (seen.has(key)) return;
  seen.add(key);
  const value = describe(data);
  store[key] = value;
  console.log(`${PREFIX} ${key}`, value);
}

export function setting(name: string): string | null {
  try {
    return sessionStorage.getItem(`wb_spike_${name}`);
  } catch {
    return null;
  }
}

/** JSON-safe copy of a value: depth-limited, functions summarised, cycles cut. */
export function describe(value: unknown, depth = 5, ancestors: unknown[] = []): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "function") return `[function ${(value as { name?: string }).name ?? ""}]`;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return { __date: value.toISOString(), local: value.toString() };
  if (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) {
    return `[${value.tagName.toLowerCase()} class="${value.className}"]`;
  }
  if (ancestors.includes(value)) return "[circular]";
  if (depth <= 0) return `[${Array.isArray(value) ? "array" : "object"}: ${Object.keys(value).length} keys]`;
  const next = [...ancestors, value];
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => describe(v, depth - 1, next));
  if (value instanceof Map) {
    return { __map: [...value.entries()].slice(0, 50).map(([k, v]) => [describe(k, 1), describe(v, depth - 1, next)]) };
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).slice(0, 80)) {
    try {
      out[key] = describe((value as Record<string, unknown>)[key], depth - 1, next);
    } catch (e) {
      out[key] = `[throws: ${String(e)}]`;
    }
  }
  return out;
}

export function errorText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

// V5: how often the grid calls renderers, per second, for the first 30 s.
let calls = 0;
let firstCallAt: number | null = null;
const timeline: { atMs: number; calls: number }[] = [];
store["V5 renderer calls per second"] = timeline;
const timer = setInterval(() => {
  if (calls > 0) {
    timeline.push({ atMs: elapsed(), calls });
    console.log(`${PREFIX} V5 renderer calls in the last second: ${calls} (t=${elapsed()} ms)`);
  }
  calls = 0;
  if (elapsed() > 30_000) clearInterval(timer);
}, 1000);

export function countRendererCall(): void {
  calls++;
  if (firstCallAt === null) {
    firstCallAt = elapsed();
    record("V5 first renderer call", { atMs: firstCallAt });
  }
}
