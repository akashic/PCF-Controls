// Browser-side checks for GridFormatter on the wb_gridspike grid, run in the page (DevTools console,
// or an agent's javascript tool). Paste the whole file once, then call the functions.
// See docs/testing/gridformatter-test-environment.md.
//
//   __wbCheck()        → { cells, bad }: compares every rendered cell's tint with the row's expected
//                        colour (Red and Amber at 18%, inactive rows the neutral token, Green/Unknown/empty
//                        none). Actual cost is skipped (over-budget layers its own tint there).
//   await __wbStress() → scrolls the grid up and down 15 times, running __wbCheck after each move and
//                        timing every animation frame. Compare with a run using an empty rules file to
//                        see GridFormatter's own cost.
//   __footer()         → the grid footer text, e.g. "Rows: 1 - 50 of 260".
//   await __nextPage() → clicks Next page and waits for the footer to change.
//
// Expected tints match config/examples/wb_gridspike.json at the time of writing. Update EXPECT if the
// RAG option colours or tintAlpha change.

// Green has a pill but no row tint: only Red and Amber need attention.
const EXPECT = { Amber: "rgba(255, 185, 0, 0.18)", Red: "rgba(209, 52, 56, 0.18)" };

window.__wbCheck = () => {
  let cells = 0;
  const bad = [];
  for (const row of document.querySelectorAll("div[role=row][row-index]")) {
    const status = (row.querySelector("[col-id=statecode]")?.textContent || "").trim();
    // The RAG cell's text can appear twice (visible text + tooltip copy).
    const rag = (row.querySelector("[col-id=wb_ragstatus]")?.textContent || "").trim().replace(/(.+)\1$/, "$1");
    const want = status.startsWith("Inactive") ? "color-mix" : EXPECT[rag] || null;
    for (const cell of row.querySelectorAll("[role=gridcell][col-id]:not([col-id=__row_status]):not([col-id=wb_actualcost])")) {
      cells++;
      const bg = cell.style.backgroundImage || "";
      if (want ? !bg.includes(want) : bg !== "") {
        bad.push(`${(row.querySelector("[col-id=wb_name]")?.textContent || "").trim()}:${cell.getAttribute("col-id")}`);
      }
    }
  }
  return { cells, bad };
};

window.__wbStress = async (passes = 3) => {
  const viewport = document.querySelector(".ag-body-viewport");
  const frames = [];
  let last = performance.now();
  let running = true;
  const tick = (t) => {
    frames.push(t - last);
    last = t;
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  let checks = 0;
  let cells = 0;
  const bad = [];
  const max = viewport.scrollHeight - viewport.clientHeight;
  for (let pass = 0; pass < passes; pass++) {
    for (const target of [max, 0, max / 2, max, 0]) {
      const start = viewport.scrollTop;
      for (let step = 1; step <= 8; step++) {
        viewport.scrollTop = start + ((target - start) * step) / 8;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      }
      await new Promise((r) => setTimeout(r, 120));
      const result = window.__wbCheck();
      checks++;
      cells += result.cells;
      bad.push(...result.bad);
    }
  }
  running = false;
  frames.shift();
  frames.sort((a, b) => a - b);
  const pct = (q) => Math.round(frames[Math.floor(frames.length * q)] * 10) / 10;
  return {
    checks,
    cellsChecked: cells,
    mismatches: bad.length,
    sample: bad.slice(0, 5),
    frames: frames.length,
    medianMs: pct(0.5),
    p95Ms: pct(0.95),
    maxMs: Math.round(frames[frames.length - 1]),
    longFramesOver50ms: frames.filter((f) => f > 50).length,
  };
};

window.__footer = () =>
  [...document.querySelectorAll("*")].map((e) => (e.childElementCount === 0 ? e.textContent : "")).find((t) => /^Rows: /.test(t || ""));

window.__nextPage = async () => {
  const next = [...document.querySelectorAll("button")].find((b) => /next page/i.test(b.getAttribute("aria-label") || b.title || ""));
  if (!next) return "no next button";
  const before = window.__footer();
  next.click();
  for (let i = 0; i < 40 && window.__footer() === before; i++) await new Promise((r) => setTimeout(r, 250));
  await new Promise((r) => setTimeout(r, 1500));
  return window.__footer();
};

("grid checks loaded: __wbCheck(), await __wbStress(), __footer(), await __nextPage()");
