# ChoiceCounts: VERIFY outcomes and decisions

The platform unknowns in the [brief](../../../docs/briefs/2026-10-31-choice-counts.md) §3, plus C-5 for the drill-through. Tested in `LowCode`, the dev environment, on 1 Nov 2026, with the setup in [docs/testing/choicecounts-test-environment.md](../../../docs/testing/choicecounts-test-environment.md).

## C-1: binding the record ID to the primary key

**Partly confirmed.**
- Through form XML, `recordId` bound to the primary-key column (`<recordId type="SingleLine.Text">wbsuper_smsfmatterid</recordId>`, with no `static`) gives the control the saved record's GUID. The counts are filtered to the open matter.
- **Not yet tested:**
  - whether the **form designer** offers the primary key for binding;
  - what the control gets on an unsaved Create form, and whether `updateView` fires when the first save gives the record its ID.

## C-2: host column types in the form designer

**Not yet tested.** The control is hosted on a text column, `wbsuper_taskrag`, which renders correctly and is never written.

## C-3: the aggregate response

**Works, but the shape isn't captured yet.** `retrieveMultipleRecords(table, "?fetchXml=…")` with the grouped `countcolumn distinct` query returns rows that `readGroupCounts` reads correctly: Red 2 and Amber 3 for matter `00224570-27`, matching the data. Still to do:
- capture the raw response, including any FormattedValue annotations, as a fixture;
- repeat for Status, Status Reason and Yes/No;
- capture the 50,000-row error.

## C-4: metadata from PCF

**Works; the source isn't recorded yet.** The control tries `getEntityMetadata` first and then the Web API metadata endpoint. Labels, colours (from a **global** choice) and the primary ID all came through. Instrument both paths to record which one supplied them.

## C-5: custom events for drill-through (new, 1 Nov 2026)

**Confirmed.** The manifest declares `<event name="OnOptionSelect">`. When a maker sets "When a count is selected" to "Raise OnOptionSelect", the control calls `context.events.OnOptionSelect(payload)`. A form script handler attached with `formContext.getControl("wbsuper_taskrag").addEventHandler("OnOptionSelect", handler)` receives the payload: `{ value: 512340000, label: "Red", count: 2, tableName: "wbsuper_smsftask", groupColumn: "wbsuper_ragstatus" }`.

The example script, [examples/drill-through.js](../examples/drill-through.js), then:
- opens the Tasks tab;
- looks the "Red tasks" view up by name;
- calls `getViewSelector().setCurrentView`.

The subgrid keeps its relationship, so it shows exactly this matter's 2 red tasks.

**Findings:**
- Microsoft documents custom events as **preview**.
- `setCurrentView` needs the subgrid's view selector on, with the target views in its list.
- After the form XML changes, the first load can come from cache without the new script. A fresh load runs it.
