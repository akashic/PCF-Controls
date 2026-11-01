# ChoiceCounts: VERIFY outcomes and decisions

The platform unknowns in the [brief](../../../docs/briefs/2026-10-31-choice-counts.md) §3, plus C-5 for the drill-through. Tested in `LowCode`, the dev environment, on 1 Nov 2026, with the setup in [docs/testing/choicecounts-test-environment.md](../../../docs/testing/choicecounts-test-environment.md).

## C-1: binding the record ID to the primary key

**Confirmed** (1 Nov 2026, 0.1.3).
- **In the form designer**, Record ID's "Bind to table column" lists the form table's primary key as **"<Table name> (Text)"**, here "SMSF Matter (Text)", alongside the table's text columns. Makers can bind it there, so the form-XML route isn't needed.
- **On a new record**, before the first save, the bound value is empty. With a relationship column set, the control shows "Available after save". Both instances on the form did.
- **After the first save**, `updateView` delivers the new GUID, and the control queries **without a reload**. A marker set on the page survived the save, so it was the same page. Both instances changed to counts.
- With the relationship and Record ID set, the counts are filtered to the open record. A second matter's tasks never appear.

## C-2: host column types in the form designer

**Confirmed for text and lookup.** "Add component" offers **Choice counts** on a single line of text column (Task RAG, Stage) and on a **lookup** (WBCode). The test form has no number, date, Yes/No or choice column, so those types rest on the manifest's `hostColumn` type-group. Both test instances are hosted on text columns and are never written.

**Found: "Error loading control" in the designer's preview.** In the form designer's canvas, both instances show "Error loading control". On the running form they work. RagChoice renders in its designer preview, so this is specific to ChoiceCounts.
- Making every input read optional (`p.x?.raw ?? null`, 0.1.4) didn't fix it.
- The preview runs in a frame whose console messages aren't captured, so the cause isn't known.
- Suspects: features only ChoiceCounts uses, namely the `<event>` element (a preview feature), the type-group host, and Enum inputs.
- It doesn't stop makers configuring the control: the component's properties panel works. Tracked as a follow-up issue.

## C-3: the aggregate response

**Confirmed for all four column types.** These are real responses to the control's query, captured from `LowCode` with all annotations. Each is a test fixture with a test:

| Grouped column | Fixture | What the group value is |
|---|---|---|
| Choice (`wbsuper_ragstatus`, a global choice) | [aggregate-choice.json](../tests/fixtures/aggregate-choice.json) | the option value |
| Status Reason (`statuscode`) | [aggregate-status-reason.json](../tests/fixtures/aggregate-status-reason.json) | the option value, e.g. `1`, `2` |
| Status (`statecode`) | [aggregate-status.json](../tests/fixtures/aggregate-status.json) | `0`, `1` |
| Yes/No (`wbsuper_urgent`) | [aggregate-yes-no.json](../tests/fixtures/aggregate-yes-no.json) | **`false`/`true`**, which the reader maps to `0`/`1` |

In every case:
- the count is a number;
- both values carry `FormattedValue` and `AttributeName` annotations;
- **the blank group has no group key at all**;
- rows are ordered by label, not value.

**The 50,000-row error isn't confirmed.** `aggregatelimit` can't stand in for it:
- With the control's distinct grouped count, `aggregatelimit="1"` fails with a generic SQL error (`0x80044150`), not `8004E023`.
- With a plain count, it quietly counts a subset, as the brief warned.

So the only real test is more than 50,000 matching rows. That was left alone rather than creating them in `LowCode`. `isAggregateLimitError` matches Microsoft's documented code (`-2147164125` / `8004E023`) and message (`AggregateQueryRecordLimit`). Whatever else fails shows the generic "Counts unavailable", so the worst case is the wrong tooltip.

## C-4: metadata from PCF

**Confirmed: `getEntityMetadata` alone is enough** for Choice (including a global choice), Status Reason, Status and Yes/No. Read on the form through `Xrm.Utility.getEntityMetadata`, the same service as `context.utils`:
- `PrimaryIdAttribute` is present (`wbsuper_smsftaskid`).
- `Attributes.get(column).attributeDescriptor.Type` is the kind, **in lower case**: `picklist`, `status`, `state`, `boolean`. There's no `AttributeType`, so 0.1.2 couldn't tell the kind and fell back to the Web API for it. 0.1.3 reads `Type` and matches type names in any case.
- `attributeDescriptor.OptionSet` is a **list** for every kind, Yes/No included (No then Yes): `{ Value, Label, Color, IsHidden }`, with `State` and `DefaultStatus` on status options.
- **Columns created after the page loaded aren't in its metadata** (`Attributes.get` returns `null`) until the page is reloaded. That only matters while a table is being changed.

With the real shape (tested in `tests/metadata.test.ts`), the loader finds everything it needs and makes no Web API metadata calls. The Web API path stays as a fallback.

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

## Test matrix (brief §6.2), 1 Nov 2026

| Case | Result |
|---|---|
| 0, 1 and many child rows per option | **Pass.** Red 2 · Amber 3; Red 1 · Amber 0; Red 0 · Amber 0 on a new matter |
| Inactive rows excluded by a `statecode` filter | **Pass.** The inactive red task isn't counted |
| Other parents' rows excluded by the relationship | **Pass** |
| One-to-many `link-entity` in the filter | Not run. The query counts distinct primary IDs, so a link can't double-count by construction |
| New record, then first save | **Pass**, no reload (C-1) |
| Add a child, then refresh | **Pass.** Red 0 → Red 1 after refresh |
| Group by Choice, Status Reason, Status and Yes/No | **Pass** for the response and metadata (C-3, C-4). Rendered on the form for Choice and Status Reason |
| `optionValues` subset | **Pass.** Red then Amber, Green left out |
| Colours: overrides and neutral zero counts | **Pass.** Amber 0 grey, Red 1 red (0.1.2) |
| Invalid configuration | Unit-tested (config, filter, colours). Shows "—" with a warning |
| Hosted on text and lookup | **Pass** in the designer (C-2); the host is never written |
| Light and dark mode | **Pass.** Coloured badges keep readable text, and neutral badges and the refresh icon follow the dark theme |
| Several instances on one form | **Pass.** Task RAG and Task status side by side, each with its own query and settings |
| Drill-through | **Pass** (C-5) |
| Mobile app | **Not run.** No mobile device in this setup. In UAT (deployment guide §7) |
| Least-privileged user | **Not run.** `LowCode` has a single user. In UAT (deployment guide §7) |
| More than 50,000 rows | **Not run** (C-3) |
