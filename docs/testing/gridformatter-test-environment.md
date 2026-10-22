# GridFormatter test environment: how it was built and how to use it

How the `wb_gridspike` test table was built, populated and wired to GridFormatter, and how it's used to test the control end to end, including from a browser driven by an agent. It's written so a future agent (or developer) can rebuild the environment from nothing, or use the existing one without rediscovering the gotchas.

- **Built:** 22 Oct 2026, for the VERIFY spike (#9) and the manual test matrix (#15). Results are in [`controls/GridFormatter/docs/decisions.md`](../../controls/GridFormatter/docs/decisions.md).
- **Scripts:** [`scripts/test-env/`](../../scripts/test-env/).

> **Test environments only.** Everything here creates tables, rows and configuration. Run it only against a test environment, never a William Buck environment, and ask the developer before writing to any environment that isn't already listed below.

## 1. The environment

| Item | Value |
|---|---|
| Environment | `LowCode`: https://lowcode.crm.dynamics.com/ (environment id `9fe35225-472b-ecb3-9792-25a877aeac19`) |
| Tenant | The developer's **personal** tenant `ggregg.onmicrosoft.com`, **not** the William Buck tenant |
| Publisher | `WilliamBuck` / `wb` / option value prefix `94879` (ADR-0003), publisher id `39150faa-bb06-480f-94d4-0c4a8932de63` |
| Test solution | `WBGridSpikeTest` (unmanaged): holds the table, its columns, views, the grid configuration and the rules web resource |
| Control solution | `WBGridFormatter` (unmanaged import of the repo build): holds `wb_Controls.GridFormatter` |
| Table | `wb_gridspike` (entity set `wb_gridspikes`) |
| Views | "Grid spike - all columns" `c98e5bf5-c2cd-f111-a05b-70a8a59b69e5` (default, all columns, includes inactive rows); "Grid spike - narrow (no RAG, no status)"; plus the system view "Active Grid spikes" `79452fbc-5bad-4400-bf25-a7049fce521a` (Name + Created On only) |
| Grid configuration | `customcontroldefaultconfig` `2680912c-8703-4375-965a-93b8a4b457ab` (`GridCustomizerControlFullName` = `wb_Controls.GridFormatter`, editing off) |
| Rules web resource | `wb_/GridFormatter/wb_gridspike.json` (webresourceid changes if it's deleted and recreated; look it up by name) |
| Data | 260 rows: `Spike row 01`–`30` (rows 25–30 inactive) and `Spike row 031`–`260` (all active) |

IDs are specific to `LowCode`. In a rebuilt environment, look things up by name.

## 2. Prerequisites

| Tool | Why | Setup |
|---|---|---|
| Power Platform CLI (`pac` 2.14.1) | Import solutions, query with FetchXML | `dotnet tool install --global Microsoft.PowerApps.CLI.Tool`; on macOS add `~/.dotnet/tools` to `PATH` in `~/.zprofile` (README → Prerequisites). Sign in: `pac auth create --name wb`; choose the environment: `pac org select --environment https://lowcode.crm.dynamics.com/` |
| Azure CLI (`az`) | A bearer token for direct Web API calls (metadata, rows, configuration), which `pac` doesn't expose | `az login --allow-no-subscriptions --tenant ggregg.onmicrosoft.com` (interactive; the developer runs it with `! az login …`). Then `az account get-access-token --resource https://lowcode.crm.dynamics.com --query accessToken -o tsv` |
| Node 24 | Runs the scripts in `scripts/test-env/` | `.nvmrc` |
| Claude in Chrome (in Edge) | Lets an agent drive the developer's signed-in browser | See [§7](#7-testing-in-the-browser-agents) |

Every script in `scripts/test-env/` reads two environment variables:

```sh
export DATAVERSE_URL=https://lowcode.crm.dynamics.com
export DATAVERSE_TOKEN=$(az account get-access-token --resource $DATAVERSE_URL --query accessToken -o tsv)
```

Tokens last about an hour; re-run the second line when calls start returning 401.

## 3. What the table contains (and why)

`wb_gridspike` has **one column of every type GridFormatter has to handle**, so a single view exercises every renderer path, condition type and the V7 support matrix.

| Column | Type (`colDefs[].dataType`) | Why it's there |
|---|---|---|
| `wb_name` | Text, **primary name** | The link column that must never be custom-drawn (V7) |
| `statecode` / `statuscode` | OptionSet (state/status) | The inactive-grey rule; choice values arrive as strings (V1) |
| `wb_ragstatus` | OptionSet (local choice) | The RAG rules. Options **Red `#D13438`**, **Amber `#FFB900`**, **Green `#107C10`**, and **Unknown with no colour** (to test the no-colour fallback). Values `948790000`–`948790003` |
| `wb_tags` | MultiSelectPicklist | Multi-select conditions; Alpha `#0078D4`, Beta `#8764B8`, Gamma with no colour. Values `948790000`–`948790002` |
| `wb_flagged` | TwoOptions (Yes/No) | Boolean conditions (flagged-name underline rule) |
| `wb_parentid` | Lookup (to `wb_gridspike` itself) | A lookup without needing another table or data; rows 5, 10, 15, 20, 25, 30 point at row 01 |
| `ownerid` | **Persona** (Owner) | The type that ignores italic/underline (V7) |
| `wb_count` | Integer | Number conditions; empty on every 7th row |
| `wb_score` | Decimal | Empty on every 6th row |
| `wb_budget` / `wb_actualcost` | Currency | Column-to-column comparison: even rows have actual cost **over** budget (+250), odd rows under (−250) |
| `wb_duedate` | DateOnly | Overdue rules; values run from **5 days before today to 4 days after** (day = `(i % 10) − 5`), so some are overdue, one is today, some are in the future; empty on every 8th row |
| `wb_reviewedon` | DateAndTime (user local) | Time-zone handling; `now − i × 7 hours`; empty on every 9th row |
| `wb_notes` | Text | A plain non-primary text column; empty on every 4th row |
| `createdon` | DateAndTime (system) | — |

Row `i`'s values come from `rowValues(i)` in [`create-gridspike.mjs`](../../scripts/test-env/create-gridspike.mjs): RAG cycles Red, Amber, Green, Unknown, empty (`i % 5`), tags cycle (`i % 4`), Flagged is Yes on every 3rd row. **Dates are relative to the day the rows were created**, so "overdue" shifts as days pass. Recreate the rows (or edit the due dates) if a test depends on exact overdue rows.

Both views have **no statecode filter**, so inactive rows 25–30 appear. The system view "Active Grid spikes" (Name and Created On only) is the "columns not in view" case: no rule can fire there.

## 4. Building it from scratch

Run these in order, in a test environment.

### 4.1 The publisher

The canonical publisher (ADR-0003) has to exist before anything with the `wb` prefix is created. `pac` has no command for creating a publisher, so import an **empty unmanaged solution** that declares it, then delete that solution. Deleting an unmanaged solution leaves its publisher behind.

```sh
mkdir WBPublisherSeed && cd WBPublisherSeed
pac solution init --publisher-name WilliamBuck --publisher-prefix wb
# Edit src/Other/Solution.xml: publisher display name "William Buck",
# CustomizationOptionValuePrefix 94879 (pac writes a random one every time).
dotnet build -c Release -p:SolutionPackageType=Unmanaged   # the default build is MANAGED; don't import that
unzip -p bin/Release/WBPublisherSeed.zip solution.xml | grep -o "<Managed>[0-9]</Managed>"   # must be <Managed>0</Managed>
pac solution import --path bin/Release/WBPublisherSeed.zip
pac solution delete --solution-name WBPublisherSeed
```

Check it worked: `pac org fetch --xml "<fetch><entity name='publisher'><attribute name='uniquename'/><attribute name='customizationprefix'/><attribute name='customizationoptionvalueprefix'/><filter><condition attribute='customizationprefix' operator='eq' value='wb'/></filter></entity></fetch>"`.

### 4.2 The table, columns, views and 30 rows

```sh
node scripts/test-env/create-gridspike.mjs        # idempotent; prints "exists" for anything already there
```

The script runs these steps against the Web API (`/api/data/v9.2`):

1. **Solution:** creates `WBGridSpikeTest` linked to the `WilliamBuck` publisher (`POST solutions`).
2. **Table:** `POST EntityDefinitions` with the primary name column `wb_Name`. User-owned; no activities or notes.
3. **Columns:** one `POST EntityDefinitions(LogicalName='wb_gridspike')/Attributes` per column, using the typed metadata classes (`PicklistAttributeMetadata`, `MultiSelectPicklistAttributeMetadata`, `BooleanAttributeMetadata`, `IntegerAttributeMetadata`, `DecimalAttributeMetadata`, `MoneyAttributeMetadata`, `DateTimeAttributeMetadata` with `DateTimeBehavior` `DateOnly` or `UserLocal`, `StringAttributeMetadata`).
   - **Option colours are set at creation** through each option's `Color` property.
   - The self-lookup is created through `POST RelationshipDefinitions` (a `OneToManyRelationshipMetadata` with a `Lookup`).
   - Creating a Money column also creates `transactioncurrencyid` and `exchangerate` automatically.
4. **Publish** the table (`POST PublishXml`).
5. **Views:** `POST savedqueries` with hand-written `fetchxml` and `layoutxml` (`querytype` 0, the "all columns" view marked default). Then publish again.
6. **Rows:** 30 `POST wb_gridspikes`. Parent lookups are bound with `"wb_ParentId@odata.bind": "/wb_gridspikes(<row 01 id>)"`. Rows 25–30 are then deactivated with `PATCH { statecode: 1, statuscode: 2 }`.

Every metadata call sends the header **`MSCRM.SolutionUniqueName: WBGridSpikeTest`**, so the components land in the test solution and can be found and removed together. Data calls don't need it.

### 4.3 More rows (volume and paging)

```sh
node scripts/test-env/add-gridspike-rows.mjs --from 31 --to 260
```

This creates rows `Spike row 031`–`260` with the same value pattern, 10 requests at a time. That's 260 rows in total: 6 pages of 50 in the grid, enough for brief §5.9's 250+ rows check.

### 4.4 The control

Build a **clean production** solution and import it **unmanaged**:

```sh
dotnet clean controls/GridFormatter/solution -c Release
rm -rf controls/GridFormatter/out controls/GridFormatter/obj controls/GridFormatter/solution/bin controls/GridFormatter/solution/obj
dotnet build controls/GridFormatter/solution -c Release
unzip -l controls/GridFormatter/solution/bin/Release/WBGridFormatter.zip | grep bundle.js   # ~48 KB production; ~148 KB means a dev bundle slipped in
pac solution import --path controls/GridFormatter/solution/bin/Release/WBGridFormatter.zip --environment https://lowcode.crm.dynamics.com/ --publish-changes
```

`dotnet build` right after `npm run build` reuses the **dev** bundle, which is why the clean step matters. **Bump the manifest version on every redeploy** (three places; CLAUDE.md), or Dataverse may keep serving the cached bundle.

Check: `pac org fetch --xml "<fetch><entity name='customcontrol'><attribute name='name'/><attribute name='version'/><filter><condition attribute='name' operator='like' value='wb_%'/></filter></entity></fetch>"`.

### 4.5 Point the grid at the customizer

```sh
node scripts/test-env/set-grid-customizer.mjs wb_gridspike wb_Controls.GridFormatter            # add --editing yes|no to toggle inline editing
```

This is the scripted equivalent of the classic UI: **Customize the system → Entities → table → Controls → Power Apps grid control → Customizer control**. Details found during the spike:

- A table's grid settings live in its **`customcontroldefaultconfig`** row, as `controldescriptionxml`. There's one `<customControl name="Microsoft.PowerApps.PowerAppsOneGrid">` per form factor (0 web, 1 tablet, 2 phone).
- The customizer is the **`GridCustomizerControlFullName`** parameter. `EnableEditing`, `EnableDropdownColor` ("Enable OptionSet colors"; leave it `no`) and the other grid properties sit alongside it.
- A new table has `<controlDescriptions />`. The script copies a working Power Apps grid configuration from a system table that has one (`mailbox`), then swaps the customizer in.
- `PATCH` the row with `If-Match: *`, then publish the table.
- **The app caches grid settings.** After changing them, **hard-reload** (Cmd+Shift+R). A normal reload or in-app navigation can keep the old settings (seen with `EnableEditing`).

### 4.6 Deploy rules

```sh
node scripts/test-env/upload-web-resource.mjs controls/GridFormatter/config/examples/wb_gridspike.json
```

This creates or updates `wb_/GridFormatter/wb_gridspike.json` and publishes it.
- **Type:** Script (JScript, `webresourcetype` 3), because Dataverse has no JSON type.
- **Content:** the file's Base64.
- **Publishing:** an unpublished web resource isn't what the control reads, so the script always publishes.

GridFormatter caches config per page, so hard-reload the grid afterwards.

### 4.7 A subgrid on the form

```sh
node scripts/test-env/add-gridspike-subgrid.mjs        # after 4.5; idempotent
```

The script adds a **Child rows** subgrid to the table's main form ("Information"). The subgrid lists the rows whose Parent is the open row, using the self-relationship `wb_GridSpike_Parent` and the "Grid spike - all columns" view. It also makes rows 02–04 children of **Spike row 01**. Rows 5, 10, 15… already are, but they're all Red, so with 02–04 the subgrid shows Green, Unknown and empty RAG too. Open Spike row 01 to see nine children: Red, Green, Unknown, empty, and two inactive rows.

Details found doing it:
- **The table-level grid setting (4.5) doesn't reach form subgrids.** A new subgrid renders as the plain read-only grid with no formatting. It needs its own Power Apps grid control, matching the maker steps in the [GridFormatter README](../../controls/GridFormatter/README.md#subgrids-on-forms).
- In the form XML, that's a `<controlDescription forControl="{uniqueid}">` inside `<form><controlDescriptions>`, pointing at the subgrid `<control>`'s `uniqueid` attribute. The subgrid needs one, which the script adds. The script copies the table's `customcontroldefaultconfig` description, so the customizer and grid properties match the main grid. It then swaps each `<data-set name="Items">` for one holding the subgrid's `ViewId`, `TargetEntityType`, `RelationshipName` and `FilteredViewIds`. The `mailbox` main form is a working example in every environment.
- After publishing, **hard-reload the form**. The first plain reload still showed the old form (the Owner field only).
- **Limit:** the subgrid shows the form's own table, so it can't tell whether the control reads the **subgrid's** table name or the form's. Testing that needs a subgrid of a different table, for example an unrelated Users subgrid on this form with GridFormatter, while you watch which `wb_/GridFormatter/<table>.json` the network panel requests. That test hasn't been done (#15).

### 4.8 A RagChoice test form

```sh
node scripts/test-env/add-ragchoice-form.mjs        # after importing WBRagChoice; idempotent
```

The script creates a second main form **"RagChoice test"** on `wb_gridspike` and leaves "Information" alone. It also adds a test choice column **`wb_raghiddentest`** (Red, Amber, Green, and "Retired (hidden)" with **Hidden** set). The form shows `wb_ragstatus` with RagChoice (dot), RagChoice (left bar) and the platform's dropdown, and `wb_raghiddentest` with RagChoice and the platform's dropdown. Open a row with `&formid=<printed form id>` in the URL. Results are in [`controls/RagChoice/docs/decisions.md`](../../controls/RagChoice/docs/decisions.md).

Details found doing it:
- A field control is a `<controlDescription forControl="{uniqueid}">` pointing at the field `<control>`'s `uniqueid`: first `<customControl id="{platform classid}">` with `<datafieldname>`, then one `<customControl formFactor="0|1|2" name="wb_Controls.RagChoice">` per form factor, binding the column as `<value type="OptionSet">wb_ragstatus</value>`.
- An option's **Hidden** flag is set with the `UpdateOptionValue` action (`IsHidden: true`). The `attributepicklistvalue` table can't be queried.
- The PCF context the form passes to a control can be read in the browser from the React props of the `CustomControlHostRoot` component above the control's DOM (`dynamicData.parameters`, `descriptor`). That's how the undocumented `IsHidden` was found.

### 4.9 Open it

- All columns: https://lowcode.crm.dynamics.com/main.aspx?forceUCI=1&pagetype=entitylist&etn=wb_gridspike&viewid=c98e5bf5-c2cd-f111-a05b-70a8a59b69e5&viewType=1039
- Subgrid: open **Spike row 01** (https://lowcode.crm.dynamics.com/main.aspx?forceUCI=1&pagetype=entityrecord&etn=wb_gridspike&id=4c2ddcfb-c2cd-f111-a05b-70a8a59b69e5).
- Dark mode: add `&flags=themeOption%3Ddarkmode` to the URL.
- Debug log of matched rules per row: `sessionStorage.setItem("wb_GridFormatDebug","1")`, then reload. Remove it afterwards.

## 5. Changing data and configuration for a test

| Need | How |
|---|---|
| Edit one row's value | `PATCH /api/data/v9.2/wb_gridspikes(<id>)` with `If-Match: *`, e.g. `{"wb_ragstatus": 948790000}` |
| Deactivate/activate | `PATCH … {"statecode": 1, "statuscode": 2}` / `{"statecode": 0, "statuscode": 1}` |
| Try a different rules file | `node scripts/test-env/upload-web-resource.mjs <file> --name wb_/GridFormatter/wb_gridspike.json`, then hard-reload |
| Inline editing on/off | `node scripts/test-env/set-grid-customizer.mjs wb_gridspike wb_Controls.GridFormatter --editing yes` (then `no`), then hard-reload |
| Find a row id | `GET /api/data/v9.2/wb_gridspikes?$select=wb_name&$filter=wb_name eq 'Spike row 03'` |

Restore anything you change, and re-upload `controls/GridFormatter/config/examples/wb_gridspike.json` at the end of a test session.

## 6. Fail-soft test procedures

| Case | Setup | Expected (verified 22 Oct 2026) |
|---|---|---|
| Invalid JSON | Upload a file containing `{ "version": 1, "rules": [ { "id": "broken" ` | Plain grid: 0 styled cells, no errors |
| One invalid rule | A file with one valid rule (RAG tint) and one rule with an unknown operator | RAG tint applies; the bad rule is skipped |
| Missing file | Delete the web resource (`DELETE webresourceset(<id>)`), then recreate it with the upload script | Plain grid |
| Columns not in view | Open "Active Grid spikes" | Plain grid |
| Empty rules (performance baseline) | `{ "version": 1, "rules": [] }` | Plain grid; use it as the baseline for frame timings |

## 7. Testing in the browser (agents)

### 7.1 Connecting

- **Setup:** the developer installed the Claude in Chrome extension in **Edge** (Chrome Web Store id `fcoeoabgfenejglbffodgkkbkcdhcgfn`), signed in with the same Claude account, and ran `/chrome`.
- **Two browsers were connected.** The session first picked the wrong one, and calls timed out. Use `list_connected_browsers`, ask the developer which one is Edge, then call `select_browser`. Edge tabs report `edge://newtab/`.
- **The first navigation to a site** may need the developer to approve a permission prompt in the extension. Until then the tab stays on the new-tab page. It cleared by itself after a short wait.
- **Closing the last tab in the agent's group closes that window**, including any DevTools the developer opened on it. Ask before closing a tab the developer is inspecting.

### 7.2 What works

- **Navigation and screenshots:** `navigate` and `computer` → `screenshot` / `zoom`. Use `save_to_disk` for screenshots worth keeping.
- **Reading the DOM:** `javascript_tool` reads cell styles: `div[role=row][row-index]` rows, `[role=gridcell][col-id=<column>]` cells. GridFormatter's styling is on `cell.style.backgroundImage` / `fontStyle` / `textDecoration`.
- **Ready-made checks:** paste [`scripts/test-env/browser/grid-checks.js`](../../scripts/test-env/browser/grid-checks.js) into the page and call:
  - `__wbCheck()`: every cell's tint against its expected colour;
  - `await __wbStress()`: scroll stress with frame timings;
  - `__footer()` and `await __nextPage()`: read the footer and page through.
- **Calling the Web API from the page:** `fetch('/api/data/v9.2/…', { credentials: 'same-origin' })` works with the developer's session. It was used to verify the metadata fallback URLs.
- **In-app navigation without a reload:** `Xrm.Navigation.navigateTo({ pageType: 'entitylist', entityName: 'wb_gridspike', viewId: '…' })`.

### 7.3 Gotchas

- **Console capture:**
  - `read_console_messages` only captures from its first call on that page load. A reload resets it, so startup messages are missed.
  - It also doesn't see `console.warn` output when the **React Developer Tools** extension is installed: it wraps `console.warn`/`console.error` (`installHook.js`).
  - `console.info` does come through.
  - To check GridFormatter's warnings, ask the developer to look in DevTools (filter `[GridFormatter]`, Warnings level on, hard-reload). Expected on the full view: four `rule "inactive-grey": color can't be shown…` warnings.
- **One JavaScript call is limited to about 45 seconds.** Paging through 6 pages with stress tests in one call timed out; run one page per call.
- **Double-clicking a cell opens the record,** even when editing is on. In edit mode a single click enters the cell editor.
- **Screenshots on the developer's Desktop** can't be read by the CLI (macOS privacy settings). Ask the developer to paste images into the prompt or save them inside the repo.

### 7.4 Results so far

See #15's comments and [`decisions.md`](../../controls/GridFormatter/docs/decisions.md). Notable ones:
- **Performance:** no measurable scroll cost on 260 rows (identical frame timings with and without rules).
- **Editable grid:** after an inline edit, only the cells the grid redraws pick up new row-wide styling, until a refresh.
- **Dark mode:** fixed hex text colours lose contrast; theme tokens hold up.
- **Form subgrid (same table):** formats correctly once it has its own Power Apps grid control: `__wbCheck()` found 135 cells and no mismatches. A subgrid of a different table is still untested (4.7).

## 8. Cleaning up

Remove things in this order (dependencies first):

1. **Grid configuration:** nothing to do if you delete the table (step 3). To keep the table but drop the customizer, clear **Customizer control** in the classic Controls tab, and on the Child rows subgrid in the main form.
2. **Rules web resource:** `DELETE webresourceset(<id>)`.
3. **Table** (deletes its rows, columns, views and the self-relationship): `DELETE EntityDefinitions(LogicalName='wb_gridspike')`. Check dependencies first with `RetrieveDependenciesForDelete`.
4. **Control:** `DELETE customcontrols(<id>)` for `wb_Controls.GridFormatter`, after checking `RetrieveDependenciesForDelete(ObjectId=<id>,ComponentType=66)` and that no `customcontroldefaultconfig` mentions it. This is how the old `wb_WB.GridFormatter` 0.0.5 was removed.
5. **Solutions:** `pac solution delete --solution-name WBGridSpikeTest` and `WBGridFormatter`. Deleting an unmanaged solution doesn't delete its components, hence steps 1–4.
6. **Publisher:** leave `WilliamBuck` in place; other test work uses it.

## 9. Lessons that cost time

- **Manifest `*-key` attributes can't contain an apostrophe.** The import's XSD (`noAposStringType`) rejects the whole solution. `npm run check:controls` catches it.
- `pac solution init` writes a **random** option value prefix every run. Always set 94879 (`npm run check:controls` catches it in the repo, not in throwaway seed solutions).
- A seed solution built with `dotnet build -c Release` is **managed** by default. Pass `-p:SolutionPackageType=Unmanaged` and check `<Managed>0</Managed>` before importing.
- **JSON environment variables hold at most 2,000 characters** (both default and current value). That's why rules are web resources (ADR-0004).
- The grid theme overrides cell `background-color` with `!important`, which is why tints are a `background-image` layer (decisions.md V6). Check tints in the DOM through `style.backgroundImage`, not `backgroundColor`.
- **Option colours:** `getEntityMetadata` returns them only in the undocumented `attributeDescriptor.OptionSet[].Color`. The documented Web API metadata endpoint (`…/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$filter=LogicalName eq 'x' or …&$expand=OptionSet($select=Options)`) returns them too, and was checked in the browser.
- The auto-mode permission classifier blocked the first direct `PATCH` of `customcontroldefaultconfig`. It went ahead once the developer explicitly approved it. Ask before changing an environment's configuration.
