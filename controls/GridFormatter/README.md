# GridFormatter

A **Power Apps grid customizer** that formats rows and cells of a table's views and subgrids from rules you write in JSON: tint a row by its RAG status, grey out inactive records, show a choice as a coloured pill, put an overdue date in bold red. The rules live in a web resource per table, so changing them needs no rebuild of the control. Everything else about the grid (sorting, filtering, links, selection, editing) stays the platform's own.

*What it looks like:* on an engagements view, each row has a faint background in its RAG option's colour (red, amber or green), the RAG column shows a solid rounded pill with the label in black or white, overdue due dates are bold red, and inactive rows are grey and italic. Hovering and selecting rows look as normal through the tints.

| | |
|---|---|
| Logical name | `wb_Controls.GridFormatter` |
| Solution | `WBGridFormatter` (display name "WB Grid Formatter") |
| Works with | The **Power Apps grid control** on main grids and subgrids |
| Configuration | One web resource per table: `wb_/GridFormatter/<table>.json` ([configuration guide](docs/configuration.md)) |
| Version | 0.2.0 |
| Decisions | [ADR-0004](../../docs/adr/0004-gridformatter-config-per-table-web-resource.md) (config per table), [spike results](docs/decisions.md) |
| Spec | [brief §5](../../docs/briefs/2026-10-21-grid-formatting-and-rag-choice.md#5-control-a--gridformatter-views-and-subgrids), superseded where ADR-0004 and the spike results differ |

## What it does

- Loads the grid's table's rules once per page, then hands its cell renderers to the grid. The grid waits for it, so the first paint is already formatted. If loading takes more than **3 seconds**, the grid is shown unformatted, with one console warning.
- No web resource for the table, invalid JSON or a load failure: the grid behaves exactly like the plain Power Apps grid. Invalid rules are skipped one at a time, each with a console warning; the rest still work.
- Backgrounds are a translucent layer on the cell, so hover and selection stay visible. Italic and underline go on the cell too. Text colour and bold are drawn by the control only on plain value columns, never on the primary name, lookups or Owner ([what works where](docs/configuration.md#what-works-on-which-column)).
- Renderers only: it never changes grid data, never overrides cell editors, and never throws into the grid.
- No environment variables. It reads the web resource and option colours through the Web API as the signed-in user, and calls no external service.

React 16.14.0 and Fluent 9.46.2 are platform libraries, so they aren't in the bundle.

## Install

Import the solution into the environment, before any project solution that uses it:

| Environment | Import |
|---|---|
| Dev | `WBGridFormatter.zip` (unmanaged), or `pac pcf push --publisher-prefix wb` from `controls/GridFormatter` while iterating |
| UAT, prod | `WBGridFormatter_managed.zip` from the GitHub Release `GridFormatter-v<version>` |

```sh
pac solution import --path WBGridFormatter_managed.zip
```

Build the zips yourself with `dotnet build controls/GridFormatter/solution -c Release` (they land in `solution/bin/Release`). Then **publish all customisations**.

## Set up a table

Pointing a grid at the control is a customisation of that **table**, so do it in the **project solution that owns the table**, not in `WBGridFormatter`.

### Main grid (every view of the table)

1. In the project solution, open the table in the classic designer: **Settings → Customizations → Customize the system → Entities → *table* → Controls** (from make.powerapps.com: open the table, then **Switch to classic**).
2. **Add Control… → Power Apps grid control → Add**, and select it for **Web** (and Phone and Tablet if wanted).
3. In its properties:
   - **Customizer control:** `wb_Controls.GridFormatter`
   - **Enable OptionSet colors:** **No**, so the grid doesn't colour choice cells as well as the control.
4. **Save** and **Publish**.

### Subgrids on forms

**The main grid setting doesn't reach subgrids.** A subgrid on a form stays the plain read-only grid, with no formatting, until it has its own Power Apps grid control. Set up each subgrid that should be formatted, in the project solution that owns the form:

1. Open the form in the form designer (make.powerapps.com → the solution → the table → **Forms** → the form).
2. Select the subgrid on the form canvas. In the right-hand pane, expand **Components** and select **+ Component → Power Apps grid control**. (If the subgrid doesn't exist yet, add it first: **Components → Subgrid**, pick the table and its **Default view**, and tick **Show related records** to list only rows related to the open record.)
3. In the control's properties, set:
   - **Customizer control:** `wb_Controls.GridFormatter`
   - **Enable OptionSet colors:** **No**
   - **Enable editing** and the other grid properties as the subgrid needs. They're separate from the main grid's settings.
4. Select **Done**, then **Save and publish** the form.

The classic designer works too: open the form, select the subgrid, **Change Properties → Controls → Add Control… → Power Apps grid control**, and set the same properties.

A subgrid uses the rules file of the table it **shows** (`wb_/GridFormatter/<that table>.json`), even on another table's form (from 0.2.0). It needs no other files, but the [view rule](docs/configuration.md#the-view-rule) applies: a rule only formats the subgrid if the subgrid's view includes every column the rule reads. Hard-reload the form (Cmd+Shift+R or Ctrl+Shift+R) after publishing, because the app caches grid settings.

Only one customizer can run on a grid, so a grid using GridFormatter can't use another customizer too.

## Deploy the rules

Each table's rules are a JSON web resource named `wb_/GridFormatter/<table logical name>.json` (type Script (JScript)) in the project solution that owns the table. Save and **publish** it, then reload the app page. The **[configuration guide](docs/configuration.md)** covers writing rules, deploying the file, recipes and troubleshooting. Worked examples are in [`config/examples/`](config/examples/), and [`config/grid-format.schema.json`](config/grid-format.schema.json) is the source of truth for the file format.

Check a file against the schema from the repo root:

```sh
npm run validate:config
```

## Debugging

Every console message starts with `[GridFormatter]`. To log which rules matched each row, run this in the browser console on the app's tab and reload:

```js
sessionStorage.setItem("wb_GridFormatDebug", "1")
```

Turn it off with `sessionStorage.removeItem("wb_GridFormatDebug")`. The [troubleshooting section](docs/configuration.md#troubleshooting) lists every message and what to do about it.

## Develop and test

From the repo root:

```sh
npm run lint -w @wb-pcf/grid-formatter
npm test -w @wb-pcf/grid-formatter              # Jest: engine/** and stores/** at 100% coverage
npm run validate:config -w @wb-pcf/grid-formatter
npm run build -w @wb-pcf/grid-formatter
dotnet build controls/GridFormatter/solution -c Release   # WBGridFormatter.zip + WBGridFormatter_managed.zip
```

The local test harness can't host a grid customizer, so check visual changes in the dev environment.

| Folder | What's in it |
|---|---|
| `GridFormatter/engine/` | Pure logic: row values, conditions, dates, colours, precedence, validation, per-cell decisions |
| `GridFormatter/stores/` | Loading the web resource and option colours, and the 3 s start-up timeout |
| `GridFormatter/customizers/`, `components/` | The cell renderers and the `StyledCell` and `Pill` components |
| `config/` | The JSON Schema and example rule files |
| `scripts/` | `validate-config.mjs`, and generators for the Fluent token list (don't edit their output by hand) |
| `tests/` | Jest tests, with `rowData` captured from a real grid in `tests/fixtures/` |

## Limitations

- **No per-view rules.** Rules apply to every grid of the table. A rule only applies on views that include every column it reads, which is how to opt views in or out.
- **Text colour and bold** only show on plain value columns (text, numbers, currency, dates, choices, Yes/No), never on the primary name, lookups, Owner or multi-select. Owner ignores italic and underline too.
- **Token backgrounds** use CSS `color-mix()`, which needs a current browser.
- **Not yet verified** (issue #15): mobile.
- **Subgrids rely on an undocumented grid property** for their table ([decisions.md V9](docs/decisions.md#v9-a-form-subgrids-table-30)). If a platform update removes it, a subgrid falls back to the form's table's rules, and the console warns `couldn't read this subgrid's table…`.
- **Editable grids: after an inline edit, use Refresh to update row-wide formatting.** Editing a value a row-scope rule depends on (for example RAG from Unknown to Red) restyles the edited cell at once, but the rest of the row keeps its old styling until the grid is refreshed or the page reloaded. The grid only redraws the edited cell, and there's no supported way to repaint the row.
- **Contrast** of text colours is checked in the light theme only, and only within one rule.
- Rules are the same in every environment: they ship with the project solution. An environment that needs different rules needs its own copy of the web resource.
- Rules are cached for the browser tab's lifetime. After publishing new rules, reload the page.

## Changelog

### 0.2.0 (unreleased)

- A subgrid showing a different table from its form's now uses its own table's rules, not the form's (#30; [decisions.md V9](docs/decisions.md#v9-a-form-subgrids-table-30)).

### 0.1.0 (unreleased)

- First version: rules per table from the web resource `wb_/GridFormatter/<table>.json`, with conditions (20 operators, `all`/`any`/`not` groups), row and cell scope, priority and `stop`, colours as hex, hex with alpha, Fluent 9 tokens or the choice option's own colour, translucent backgrounds, pills, console warnings for invalid rules and low contrast, a 3 s load timeout, and a debug log.
