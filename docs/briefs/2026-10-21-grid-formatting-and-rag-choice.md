# Build brief: conditional grid formatting and RAG choice PCF controls for Dataverse model-driven apps

> **Repo note (22 Oct 2026):** this brief was written for a standalone `wb-grid-formatting` repo. It now lives in the shared William Buck PCF controls repo, so its **§4.2 repo layout** and the **single `WBGridFormatting` solution** in §4.3 / §9 are superseded by the root `README.md` conventions and `docs/adr/`: each control lives in `controls/<ControlName>/` with its own solution (`WBGridFormatter`, `WBRagChoice`), and shared code lives in `packages/shared`. Everything else in the brief still applies.

> **Audience:** an AI coding agent (or developer) building two Power Apps Component Framework (PCF) controls.
> **Author context:** internal Power Platform developer at William Buck (code "WB"), a Microsoft-only accounting firm. Apps are Dataverse model-driven apps on Power Platform, deployed through dev → UAT → prod environments.
> **Date written:** 21 October 2026. Microsoft APIs below were checked against Microsoft Learn and the `microsoft/PowerApps-Samples` repo on that date. Where something could not be confirmed, it is marked **VERIFY** — prove it with a spike before building on it.

---

## 1. What we are building and why

Two needs drive this work:

1. **Conditional row/cell formatting in views and subgrids.** Rows or cells should change appearance based on the row's data. Examples:
   - Inactive records (`statecode = 1`) get a **grey background**.
   - Rows are tinted by their **RAG status** (Red / Amber / Green), using the colour configured on each option of a Dataverse **choice** column.
   - Overdue items show the due date cell in **bold red text**.
2. **A RAG colour indicator on forms.** The RAG choice field on a form should show the selected option's colour.

Out of the box:

- **Views:** the Power Apps grid control has an `Enable OptionSet colors` property. It colours the *choice cell only*, as a pill using the option's colour. There is **no** native conditional formatting for rows or for other column types.
- **Forms:** the standard choice control **ignores** option colours entirely. Option colours are otherwise only used in charts.

So we need **two** PCF controls:

| # | Control | Type | Purpose |
|---|---------|------|---------|
| A | `GridFormatter` | **Grid customizer** (a PCF control plugged into the Power Apps grid's `Customizer control` property) | **Generic, rule-driven conditional formatting** for rows and cells. RAG styling is just one configured rule. |
| B | `RagChoice` | **Field control** bound to a choice column | Editable dropdown with a coloured dot showing the current value's colour |

**Why only one grid control:** Microsoft allows **one customizer per grid**. Separate controls for "RAG" and "inactive grey" could never both apply to the same view. So control A must be a single, general-purpose formatter driven entirely by configuration. Adding a new formatting requirement must mean **editing config, not writing a new control or rebuilding**.

---

## 2. Confirmed requirements (decisions already made by the product owner)

| Topic | Decision |
|---|---|
| Number of grid controls | **One**, generic. All conditional formatting (RAG, inactive, anything future) is configuration. |
| What can be configured per rule | **(a) the colour/style values**, **(b) which style properties change** (background colour, font colour, font weight, plus italic/strikethrough), **(c) the logic (condition) that decides when the rule applies**, and **(d) the scope**: the whole row or specific cells. |
| RAG look in views | Configurable per rule: whole-row tint **or** only the RAG cell coloured (as a pill). |
| RAG colour source | Option `Color` from the choice metadata (single source of truth). Never hard-coded per value. |
| Form look | **Normal editable dropdown + coloured dot** showing the selected value's colour. Each option in the open list also shows its dot. |
| Condition language | **Structured JSON conditions** (column, operator, value, with all/any/not grouping). **No free-text expressions, no `eval`/`new Function`.** This keeps it safe, validatable with a JSON Schema, and editable in VS Code with autocomplete. |

### Assumptions (proceed with these unless told otherwise; list them in your final report)

- **Publisher prefix:** `wb`. **PCF namespace:** `WB`. Full customizer logical name will therefore be `wb_WB.GridFormatter`. **CONFIRM with the product owner before first import**, because the prefix is baked into component names and can't be changed cheaply later.
- **Solution name:** `WBGridFormatting` (unmanaged in dev, exported managed to UAT/prod).
- Control B supports single-select choice only. Multi-select choices (`MultiSelectPicklist`), Yes/No (`TwoOptions`) and Status Reason are **out of scope for control B** in v1. Control A's *conditions* may still read those column types (see §5.3).
- Desktop browser is the primary target. Must not break on the mobile app (degrade gracefully: no formatting is acceptable, a crash is not).
- The app uses the **modern, refreshed look** (Fluent 2) and users may use **dark mode**.

---

## 3. Platform background the agent needs

### 3.1 PCF basics

- PCF controls are TypeScript components described by `ControlManifest.Input.xml`, built with `pcf-scripts`, and packaged into a Dataverse **solution**.
- **Field controls** bind to a single column (`usage="bound"`); **dataset controls** bind to a view. A **grid customizer** is a special case, covered in §3.2.
- **Use "virtual" (React) controls**: set `control-type="virtual"` on the `<control>` element and declare platform libraries. The platform supplies React and Fluent at runtime, so they aren't bundled. This gives smaller bundles, faster load, and automatic modern theming.

  ```xml
  <resources>
    <code path="index.ts" order="1" />
    <platform-library name="React" version="16.14.0" />
    <platform-library name="Fluent" version="9.46.2" />   <!-- or 8.121.1 for Fluent 8 -->
  </resources>
  ```
  - Supported ranges (Microsoft Learn, Oct 2026): React `16.14.0` declared (model-driven apps actually load 17.0.2); Fluent 8 `8.29.0` or `8.121.1`; Fluent 9 `>=9.4.0 <=9.46.2` declared (9.68.0 loaded at runtime).
  - Fluent 8 and Fluent 9 **cannot both be declared in one manifest**. They can differ between the two controls. Microsoft's grid customizer template declares Fluent `8.121.1`. Switching control A to Fluent 9 is preferred for theme tokens (§3.4), but only if it works with the grid. **VERIFY**, and record the outcome.
  - Keep `package.json` dev dependency versions aligned with the declared versions. Do not import APIs newer than the declared version.
  - Rebuild with Power Platform CLI **≥ 1.37** (virtual controls GA requirement).
- In a React control, `init` gets no `div`, and `updateView` **returns a `ReactElement`**.

### 3.2 Grid customizer controls (control A)

Source: Microsoft Learn "Customize the editable grid control" and the template at `PowerApps-Samples/component-framework/resources/GridCustomizerControlTemplate`. **Start from that template.** Copy it rather than writing from scratch.

How it works:

1. The manifest has a single bound property `EventName` (`SingleLine.Text`, required). The grid supplies its value.
2. In `init`, the control calls `context.factory.fireEvent(eventName, customizer)`. The `customizer` object has the shape `PAOneGridCustomizer`:
   ```ts
   interface PAOneGridCustomizer {
     gridCustomizer?: GridCustomizer;            // GetCellRenderer, GetHeaderRenderer, etc.
     cellRendererOverrides?: CellRendererOverrides;  // per data type, read-only cells
     cellEditorOverrides?: CellEditorOverrides;      // per data type, edit mode
   }
   ```
3. `cellRendererOverrides` maps a **column data type** (`"Text"`, `"OptionSet"`, `"Lookup"`, `"Currency"`, `"DateAndTime"`, …, the full list is in the template's `types.ts`) to a function `(props: CellRendererProps, params: GetRendererParams) => ReactElement | null | undefined`.
   - **Returning `null`/`undefined` means "use the built-in renderer".** This matters a lot for row-scope styling (see §5.6).
   - `props` includes `value` (raw), `formattedValue`, `columnDataType`, `rowHeight`, `cellContainerElement` (the cell's HTML container), `columnEditable`, `isRightAligned`, `onCellClicked`, `startEditing`.
   - `params` includes `colDefs` (all visible columns: `name`, `displayName`, `dataType`, `isPrimary`, …), `columnIndex`, and `rowData` (typed only as `{ __rec_id: string }`, see VERIFY below).
4. Only **one customizer per grid**. It is assigned per table under **Settings → Customizations → Customize the system → Entities → [table] → Controls → add "Power Apps grid control" → set `Customizer control` = `{prefix}_{namespace}.{ControlName}`**, then save and publish. The same property also exists on subgrid controls on forms.
5. The template is a **renderer-only** customizer. The editable grid's edit mode (`cellEditorOverrides`) is **not** in scope. Leave editors untouched.

Microsoft's best practices (non-negotiable):

- Renderers are UI only. **Never mutate grid data or metadata.**
- Keep renderers lightweight; they run for every visible cell, on every scroll.
- Renderer functions should be **pure and consistent**, because the grid calls them repeatedly.
- The grid can dispose and recreate elements at any time. **Clean up state on unmount.**
- Don't use renderers to change displayed *values* (server-side sort/filter wouldn't match).
- Follow Fluent design and keep it accessible.

**VERIFY (spike first, before building):**

- **V1 – `rowData` shape.** Log `params.rowData` for a few rows. Confirm that values of *other* columns in the row are present and keyed by column logical name. Record the shape for each data type used in conditions: choice, status (`statecode`/`statuscode`), Yes/No, multi-select, lookup, whole number, decimal, currency, date only, date and time, text. Row-scope rules depend on reading condition columns while rendering a *different* column's cell.
- **V2 – Columns not in the view.** Confirm whether `rowData` includes columns that are **not** in the view's layout. Expect it doesn't. If so, **every column referenced by a rule's condition must be in the view**. Document this as a configuration rule.
- **V3 – `context.webAPI` and `context.utils.getEntityMetadata` inside a grid customizer.** Confirm both are available and work in the customizer's `init` context (they're standard in model-driven field/dataset controls).
- **V4 – Knowing which table (and ideally which view) the grid is showing.** The customizer has no documented table-name or view-id input. Investigate whether either is discoverable (e.g. `context.page`, `context.mode.contextInfo`, `context.parameters`, or the `colDefs`). The config design in §5.2 works without either, but if the view id *is* available, implement the optional `views` filter on a rule set.
- **V5 – Re-render after async load.** Config and metadata load asynchronously, but `fireEvent` happens in `init`. Confirm the pattern in §5.7 causes visible cells to update once data arrives. Also test what happens if `fireEvent` is delayed until data loads. Pick whichever is reliable and say which in the report.
- **V6 – Row-scope styling technique.** See §5.6. Determine which technique applies a style across the **whole cell area** of every column type without breaking built-in rendering (lookup links, primary-name links, currency formatting, etc.).
- **V7 – Font properties on built-in content.** If the chosen technique styles the cell container and leaves built-in rendering in place, check whether `color`, `font-weight`, `font-style` and `text-decoration` set on the container are **inherited** by the built-in content for each data type, or whether the built-in renderers set their own values. Record per data type which properties take effect. Links (lookup, primary name) are expected to keep their link colour. That's acceptable, but document it.
- **V8 – Environment variable size.** Confirm the maximum length of a JSON environment variable value is comfortably larger than a realistic config (aim to support at least ~50 rules).

### 3.3 Field controls (control B)

- Bound property of type `OptionSet`: `context.parameters.<prop>.raw` is the selected numeric value (or `null`). `context.parameters.<prop>.attributes.Options` is an array of `OptionMetadata { Label: string; Value: number; Color: string }` (confirmed in `@types/powerapps-component-framework` 1.3.18).
- Write back with `notifyOutputChanged()` plus `getOutputs()` returning `{ <prop>: value }` (`number | undefined`; `undefined` clears).
- Respect `context.mode.isControlDisabled` (read-only form, inactive record, or business rule lock). Respect field security via `context.parameters.<prop>.security` (`readable`, `editable`). If not readable, show the platform's masked value (`***`) and no colour.
- Required-level and label are rendered by the form, not the control.

### 3.4 Theming and dark mode

- With the Fluent 9 platform library declared, Fluent 9 components automatically pick up the app's theme tokens (light/dark, modern look). Prefer theme tokens over hard-coded colours wherever the colour isn't meaningful data.
- **Config colours can be theme tokens** (see §5.4). For example, "inactive = grey" should be configured as a neutral token such as `colorNeutralBackground3`, not `#E0E0E0`. A hard-coded light grey looks wrong in dark mode, while a token adapts. Resolve tokens at runtime from the platform theme. **VERIFY** how to read the current theme's token values inside the customizer: via Fluent 9 `tokens` CSS variables (`var(--colorNeutralBackground3)`) if the grid renders inside the platform `FluentProvider`, or via the theming API described in Microsoft Learn "Style components with modern theming". Fall back to a sensible light-theme hex if tokens can't be resolved.
- **Option colours from metadata do not adapt to dark mode by themselves.** Hence:
  - **Tints** use the colour at low alpha (default 15–20%), which reads acceptably on light and dark backgrounds.
  - **Solid fills with text** (pills) must compute text colour from the background using WCAG relative luminance (black or white, whichever gives the higher contrast ratio).
  - The form **dot** is a small solid shape with a 1px neutral-token border, so very light colours (e.g. pale yellow) stay visible on white.
- **Config-supplied font colours** (e.g. red text) are used as given. However, the validator (§5.8) warns in the console if the font colour's contrast against the resulting background is below 4.5:1 in either the light or dark theme.

### 3.5 Accessibility

- **Colour must never be the only signal.** For RAG, the label text always stays visible. For other rules (e.g. inactive grey), the underlying data that triggers the rule should be visible or obvious from the view. Document this guidance for config authors in `docs/configuration.md`.
- Dot, tint, and pill decoration is `aria-hidden="true"`. The accessible name comes from the existing text.
- Keyboard behaviour of the form dropdown must match a standard Fluent `Dropdown`.
- Minimum contrast 4.5:1 for any text the control draws on a coloured background (pills).

---

## 4. Repository and tooling

### 4.1 Developer environment

- Developer works on **macOS (Apple Silicon M1, 8 GB RAM)** and also has **Windows 11**. Everything must build on macOS. Avoid Windows-only tooling (no MSBuild-only steps that require Visual Studio; `dotnet build` is fine).
- Editor: **VS Code** with Power Platform Tools extension. Source control: **GitHub**. **Azure DevOps is out of scope.**
- Power Platform CLI on macOS: install as a .NET global tool (`dotnet tool install --global Microsoft.PowerApps.CLI.Tool`), which requires the .NET SDK. The developer previously hit a failed `pac` install, so **document exact install steps and versions** in the README and check `pac --version` works before relying on it.
- Node.js: current LTS.
- The machine is IT-managed. Do not depend on globally installed tools beyond Node, .NET SDK, and `pac`.

### 4.2 Repo layout (single repo, two PCF projects, one solution)

```
wb-grid-formatting/
  README.md                       # setup, build, deploy, configure (see §8)
  config/
    grid-format.schema.json       # JSON Schema for the config (drives VS Code autocomplete + CI validation)
    examples/
      rag-row.json
      rag-cell.json
      inactive-grey.json
      overdue-bold-red.json
      combined.json               # inactive + RAG + overdue on one table
    environments/
      dev.json  uat.json  prod.json   # actual per-environment values (used to generate deployment settings)
  docs/
    configuration.md              # human guide to rules, operators, styles, scopes, precedence
    decisions.md                  # outcomes of the VERIFY spikes
  src/
    GridFormatter/                # copied from Microsoft's GridCustomizerControlTemplate
      GridFormatter/
        ControlManifest.Input.xml
        index.ts
        types.ts                  # from template, untouched except additions
        customizers/CellRendererOverrides.tsx
        customizers/CellEditorOverrides.tsx   # leave as no-op
        engine/configSchema.ts    # TypeScript types mirroring grid-format.schema.json
        engine/validate.ts        # runtime validation (no heavy deps; hand-written or a tiny validator)
        engine/conditions.ts      # pure condition evaluator
        engine/resolveStyle.ts    # pure: rules + row → {rowStyle, cellStyles}
        engine/colours.ts         # hex/alpha/token/fromOption resolution
        stores/configStore.ts
        stores/metadataStore.ts
        components/StyledCell.tsx
        components/Pill.tsx
      package.json
    RagChoice/
      RagChoice/
        ControlManifest.Input.xml
        index.ts
        RagChoiceDropdown.tsx
      package.json
    shared/
      color.ts                    # canonical colour utilities used by both controls
  solution/
    WBGridFormatting/             # `pac solution init`, references both pcfproj
  tests/                          # Jest unit tests for all pure logic
  .github/workflows/build.yml     # CI: install, lint, test, validate config/*.json against schema, build solution
```

Note: PCF projects don't easily share code across project roots. Either copy `shared/color.ts` into each control with a build script, or use a relative import that `pcf-scripts` bundles (test it). Pick one, keep a single source of truth, and document it.

### 4.3 Naming

| Item | Value |
|---|---|
| Publisher prefix | `wb` (**confirm**) |
| Namespace | `WB` |
| Control A constructor | `GridFormatter` → logical name `wb_WB.GridFormatter` |
| Control B constructor | `RagChoice` → logical name `wb_WB.RagChoice` |
| Environment variable | `wb_GridFormatConfig` (type JSON) |
| Solution | `WBGridFormatting` |

---

## 5. Control A — `GridFormatter` (views and subgrids)

### 5.1 Concepts

- A **rule** = *when* (condition) + *what* (style properties and values) + *where* (scope: whole row, or specific cells) + *how it combines* (priority, stop).
- **Rule sets** group rules by table. When a grid renders, the formatter finds the applicable rule set, evaluates rules per row, and produces a **row style** and **per-column cell styles**.
- The RAG requirement is simply a rule whose colour is `fromOption` (read from the choice's metadata). The inactive-grey requirement is a rule on `statecode`. Neither is special-cased in code.

### 5.2 Configuration (environment variable `wb_GridFormatConfig`, type JSON)

Stored as a Dataverse **environment variable** so each environment (dev/UAT/prod) can hold its own value, set through deployment settings. No rebuild is needed to add or change formatting.

Schema v1 (illustrative; `config/grid-format.schema.json` is the source of truth):

```jsonc
{
  "$schema": "./grid-format.schema.json",
  "version": 1,
  "defaults": {
    "tintAlpha": 0.18,          // used when a colour has alpha "tint"
    "fallbackColor": null       // used when fromOption finds no colour; null = rule doesn't style
  },
  "ruleSets": [
    {
      "table": "wb_engagement",
      "views": null,             // optional array of view ids; only honoured if V4 finds the view id
      "rules": [
        {
          "id": "inactive-grey",
          "description": "Inactive records are greyed out",
          "priority": 10,
          "when": { "column": "statecode", "op": "eq", "value": 1 },
          "scope": "row",
          "style": {
            "backgroundColor": { "token": "colorNeutralBackground3" },
            "color": { "token": "colorNeutralForeground3" }
          },
          "stop": true             // no other rule applies to this row
        },
        {
          "id": "rag-row",
          "description": "Tint the row by RAG status",
          "priority": 20,
          "when": { "column": "wb_ragstatus", "op": "isNotNull" },
          "scope": "row",
          "style": {
            "backgroundColor": { "fromOption": "wb_ragstatus", "alpha": "tint" }
          }
        },
        {
          "id": "overdue",
          "description": "Overdue due date in bold red",
          "priority": 30,
          "when": {
            "all": [
              { "column": "wb_duedate", "op": "beforeToday" },
              { "not": { "column": "wb_ragstatus", "op": "eq", "value": 100000002 } }
            ]
          },
          "scope": { "columns": ["wb_duedate"] },
          "style": { "color": "#C50F1F", "fontWeight": "bold" }
        }
      ]
    },
    {
      "table": "wb_task",
      "rules": [
        {
          "id": "rag-pill",
          "when": { "column": "wb_rag", "op": "isNotNull" },
          "scope": { "columns": ["wb_rag"] },
          "display": "pill",
          "style": { "backgroundColor": { "fromOption": "wb_rag" } }
        }
      ]
    }
  ]
}
```

#### 5.2.1 Rule set matching

- A rule set applies to a grid when its `table` matches the grid's table. If V4 shows the table name is **not** discoverable, match by **column presence** instead: a rule set applies when every column referenced by at least one of its rules is in `params.colDefs`. If two rule sets would both match, log a console warning and use the first.
- `views` (optional): only honoured if V4 proves the view id is available. Otherwise ignore it with a one-time warning. Document the practical workaround: **a rule only fires on views that include its condition columns**, so include or exclude those columns to opt a view in or out (pending V2).
- Rules whose condition columns aren't in the current grid are **skipped silently** (not an error; it's how per-view opt-in works).

#### 5.2.2 Conditions (`when`)

A condition is either a **leaf** or a **group**:

- Leaf: `{ "column": "<logical name>", "op": "<operator>", "value": <operand> }`
- Groups: `{ "all": [ ... ] }`, `{ "any": [ ... ] }`, `{ "not": <condition> }`, nestable to any depth (cap at depth 5 in validation).
- Omitting `when` means **always** (useful for styling a column unconditionally).

Operators (v1):

| Operator | Applies to | Operand |
|---|---|---|
| `eq`, `ne` | all scalar types | value |
| `in`, `notIn` | all scalar types | array |
| `gt`, `gte`, `lt`, `lte` | numbers, currency, dates | value |
| `between` | numbers, currency, dates | `[min, max]` inclusive |
| `isNull`, `isNotNull` | all | none |
| `contains`, `startsWith`, `endsWith` | text (case-insensitive) | string |
| `beforeToday`, `onOrAfterToday` | dates | none |
| `olderThanDays`, `withinNextDays` | dates | number of days |
| `containsAny`, `containsAll` | multi-select choice | array of option values |

Operand rules:

- **Choice, status, status reason**: compare by the **numeric option value**, never the label (labels are localisable and editable).
- **Yes/No**: `true` / `false`.
- **Lookup**: compare by **GUID** (`eq`, `in`) or `isNull`. Name matching is not supported, since names change.
- **Dates**: ISO strings (`"2026-12-31"`). "Today" and relative-day operators use the **user's local date**. Date-only columns are compared as dates without time zone shifting. **VERIFY** what `rowData` holds for date-only vs date-and-time (V1) and handle both correctly.
- **Column-to-column comparison**: an operand may be `{ "column": "<other column>" }` (e.g. actual cost `gt` budget). Both columns must be in the view.

Evaluation must be a **pure function** `evaluate(condition, rowAccessor, now): boolean` with exhaustive unit tests. Unknown operators or type mismatches evaluate to `false` (and are caught earlier by validation).

#### 5.2.3 Style properties (`style`)

| Property | Values | Notes |
|---|---|---|
| `backgroundColor` | colour value (§5.4) | |
| `color` | colour value | Font colour. Effectiveness on built-in content depends on V7. |
| `fontWeight` | `"normal"`, `"semibold"`, `"bold"` | Map to Fluent weights (400/600/700). |
| `fontStyle` | `"normal"`, `"italic"` | |
| `textDecoration` | `"none"`, `"line-through"`, `"underline"` | |

Only these properties are allowed. **No raw CSS strings, class names, or arbitrary style keys**, which keeps the config safe and predictable. New properties can be added later with a schema version bump.

#### 5.2.4 Scope and display

- `"scope": "row"` styles **every cell** in the row.
- `"scope": { "columns": [ ... ] }` styles only those columns' cells. If omitted from a leaf-condition rule, the default for `columns` is the condition's column (document this).
- `"display": "pill"` (cell scope only): render the cell's `formattedValue` as a rounded pill with `backgroundColor` as a solid fill and auto-contrast text (ignores `color`). This is how the RAG "cell only" look is done. Default `display` is `"style"` (apply properties, keep built-in rendering).

#### 5.2.5 Combining rules (precedence)

1. Evaluate rules in ascending `priority` (ties: order in the array).
2. Each matching rule contributes its properties. **The first rule to set a given property for a given cell wins.** Later rules can still fill properties that are not yet set. For example, inactive-grey sets the background, so RAG can't override it, but the overdue rule can still make the date bold.
3. Row-scope properties apply to all cells. A cell-scope property from an earlier-priority rule wins over a row-scope property from a later rule, and vice versa. Strictly "first to set wins", whatever the scope.
4. `"stop": true` on a matching rule stops evaluation of any further rules for that row.
5. `display: "pill"` on a cell is set by the first matching pill rule for that cell.

Implement this as a pure `resolveStyles(ruleSet, row, visibleColumns, metadata, now) → { row: StyleProps, cells: Record<column, StyleProps & { pill?: PillSpec }> }` and unit-test the precedence rules thoroughly.

#### 5.2.6 Reading the config

- `context.webAPI.retrieveMultipleRecords("environmentvariabledefinition", "?$select=schemaname,defaultvalue&$filter=schemaname eq 'wb_GridFormatConfig'&$expand=environmentvariabledefinition_environmentvariablevalue($select=value)")`. The current value overrides the default value. **VERIFY** the expand name against the environment.
- Load once per page and cache in module scope so multiple grids on one page share it. Optionally cache in `sessionStorage` keyed by environment (wrap in try/catch).

### 5.3 Reading row values

- Write one accessor `getValue(rowData, column, dataType)` that normalises every shape found in V1 into: `number` (choice, status, numbers, currency), `number[]` (multi-select), `boolean` (Yes/No), `string` GUID (lookup), `Date` or date-only string (dates), `string` (text), or `null`.
- Use `params.colDefs` to know each column's `dataType`.
- Unit-test the accessor against fixtures captured from the real grid during V1 (store the fixtures in `tests/fixtures/`).

### 5.4 Colour values

A colour value in config can be:

| Form | Example | Meaning |
|---|---|---|
| Hex string | `"#C50F1F"` | Fixed colour |
| `{ "hex": "#C50F1F", "alpha": 0.2 }` | | Fixed colour at an alpha |
| `{ "token": "colorNeutralBackground3" }` | | Fluent 9 theme token; adapts to light/dark (§3.4) |
| `{ "fromOption": "<choice column>", "alpha": "tint" \| number }` | | The colour configured on the row's selected option of that column. `"tint"` = `defaults.tintAlpha`. Omit alpha for solid. |

Resolution:

- `fromOption` needs option metadata. In `init`, collect every `(table, column)` referenced by `fromOption` across the config, call `context.utils.getEntityMetadata(table, [column])` once per table, and build `Map<"table.column", Map<optionValue, hex>>`. **VERIFY** the exact path to option colours in the returned `EntityMetadata` (V3).
- Unknown option, missing colour, or invalid hex → `defaults.fallbackColor`. If that's null, the property is **not set** by this rule, so a later rule may set it.
- Validate tokens against a fixed allow-list of Fluent 9 colour token names (generate the list from `@fluentui/react-components` `tokens` at build time).

### 5.5 Behaviour summary

- Grid with no matching rule set: behave exactly like the plain Power Apps grid (all renderers return `null`).
- Row where no rule matches: default appearance.
- Selected and hovered rows: the grid's own selection and hover styling must remain clearly visible. Test this. If a background obscures selection, reduce its effect (e.g. apply alpha) or skip backgrounds on selected rows, and document what was done.
- Editable grids: renderers only. Editing a cell uses the built-in editor unstyled, and styling refreshes after the value changes or saves.

### 5.6 Row-scope and cell styling technique (resolve via spike V6/V7)

The difficulty: overriding a data type's renderer replaces the built-in rendering for that type. For most rules we want built-in content **plus** styling. Candidate approaches, in order of preference:

1. **Style the cell container, keep built-in rendering.** In the renderer, compute the cell's resolved style, apply it to `props.cellContainerElement.style` (`backgroundColor`, `color`, `fontWeight`, `fontStyle`, `textDecoration`), then `return null` so the built-in renderer draws the content. **Always set every managed property, or reset it to `""` when not applicable**, because the grid virtualises and reuses containers. Never touch any other style properties. Pros: full fidelity. Cons: a side effect in a function Microsoft asks to keep pure. It must be idempotent and always reset. Check whether `cellContainerElement` is populated on first call.
2. **`gridCustomizer.GetCellRenderer`**, if it can wrap the default renderer. Investigate whether it receives or can obtain the default element. If it can, wrap it in a full-size styled container.
3. **Render content ourselves for simple types** (`Text`, numbers, dates via `formattedValue`) inside a styled full-size `div`, and fall back to approach 1 (or no styling) for complex types (`Lookup`, `Owner`, `Customer`, primary name column, `File`, `Image`). Least preferred: it loses links and must replicate alignment (`props.isRightAligned`) and click behaviour (`props.onCellClicked`).

Pills (`display: "pill"`) are always rendered by our own `Pill` component, since that is a deliberate replacement of the cell's look.

Whichever is chosen, backgrounds must fill the **whole cell** (no gutters between cells), work at all row heights and densities, and not break keyboard focus outlines. Record the decision and evidence (screenshots) in `docs/decisions.md`.

### 5.7 Async data and re-rendering

- In `init`: start loading config, then option metadata for every `fromOption` reference.
- Renderers that return components (`Pill`, approach 3) subscribe to a tiny module-level store (`subscribe`/`getSnapshot` using `useState` + `useEffect`; React 16 has no `useSyncExternalStore`) and re-render when data arrives. Unsubscribe on unmount.
- With approach 1 (container styling + `return null`), there's no component to re-render. Either **delay `fireEvent` until config and metadata are loaded** (with a timeout, e.g. 3 s, after which fire with no-op renderers), **or** confirm the grid re-invokes renderers and accept that the first paint may be unstyled. Spike V5 decides; document it.
- All loads fail soft: on error, log once and render nothing custom.

### 5.8 Validation and authoring experience

- `config/grid-format.schema.json` (JSON Schema draft 2020-12) fully describes the config: rule sets, conditions (recursive), operators with operand types, style properties and allowed values, colour value forms, scope, display, priority, stop.
- VS Code: `"$schema"` in config files gives autocomplete and inline errors while editing. Document this in `docs/configuration.md`.
- CI validates every file in `config/` against the schema.
- At runtime, `validate.ts` re-checks the loaded config (lightweight; don't bundle a large JSON Schema library unless its size is justified and approved). Behaviour:
  - Invalid JSON or wrong `version`: log one `console.warn` and behave as if there's no config.
  - Individual invalid rules: **skip that rule only**, warn once naming its `id`, and keep the rest working.
  - Contrast check: warn when a rule's `color` against its `backgroundColor` (or the default background) is below 4.5:1.
- **Never throw** inside renderers.
- Optional debug aid: if `sessionStorage['wb_GridFormatDebug'] === '1'`, log which rules matched for each row id (once per row) to help config authors.

### 5.9 Performance budget

- No network calls inside renderers. Precompile the config into evaluator closures and lookup maps in `init`.
- Memoise resolved styles **per row** (keyed by `__rec_id` plus a hash of the values of referenced columns), so one row's rules are evaluated once and not once per cell.
- Test with a 250-row view, three rule sets, and ~10 rules on the target table. Scrolling must stay smooth with no visible jank compared with the plain grid.

---

## 6. Control B — `RagChoice` (form field)

### 6.1 Manifest

```xml
<control namespace="WB" constructor="RagChoice" version="1.0.0"
         display-name-key="RAG Choice (colour)" description-key="Choice dropdown that shows each option's configured colour"
         control-type="virtual">
  <property name="value" display-name-key="Value" description-key="The RAG choice column"
            of-type="OptionSet" usage="bound" required="true" />
  <property name="indicator" display-name-key="Indicator style" description-key="How the colour is shown"
            of-type="Enum" usage="input" default-value="dot">
    <value name="dot" display-name-key="Dot">dot</value>
    <value name="bar" display-name-key="Left bar">bar</value>
  </property>
  <property name="fallbackColor" display-name-key="Fallback colour"
            description-key="Hex colour for options with no colour configured (blank = no indicator)"
            of-type="SingleLine.Text" usage="input" />
  <resources>
    <code path="index.ts" order="1" />
    <platform-library name="React" version="16.14.0" />
    <platform-library name="Fluent" version="9.46.2" />
  </resources>
</control>
```

(`indicator=bar` is a small optional extra: a 4px coloured bar on the left edge of the dropdown. The default and required behaviour is `dot`.) Although it was built for RAG, this control works with **any** single-select choice column that has option colours.

### 6.2 UI

- Fluent 9 `Dropdown` (single select), full width of the field slot, matching the look and height of other form fields in the modern UI.
- **Closed state:** coloured dot (10–12px circle, 1px neutral-token border) before the selected label. With no value, show placeholder `--Select--` (match the platform's empty choice text) and no dot.
- **Open list:** each `Option` shows its own dot + label, plus a blank option at the top to clear the value **unless** the column is business-required. Order options as in metadata.
- **Read-only / disabled:** same visual (dot + label), non-interactive, styled like other read-only fields.
- **Not readable (field security):** show `***`, no dot.

### 6.3 Behaviour

- On selection: update internal state, call `notifyOutputChanged()`. `getOutputs()` returns `{ value: selected ?? undefined }`.
- On `updateView`: re-sync from `context.parameters.value.raw` (value can change from business rules, JS, or a refresh). Don't fire `notifyOutputChanged` for externally driven changes.
- Hidden options: if the choice uses the **Hidden** option property, honour it if the platform exposes it to PCF. **VERIFY**. If it isn't exposed, document the limitation.
- No network calls: everything needed is in `attributes.Options`.

### 6.4 Accessibility

- Dot `aria-hidden`. Dropdown's accessible name comes from the form label. Pass `context.parameters.value.attributes.DisplayName` as `aria-label` if the label association isn't automatic. **VERIFY** with a screen reader or the accessibility tree.

### 6.5 Missing colours

If an option's `Color` is empty or invalid: use `fallbackColor`. If that's also empty, **show no indicator** for that option. Never invent red/amber/green from label text.

---

## 7. Shared colour utilities (`src/shared/color.ts`)

- `normalizeHex(input): string | null`: accepts `#RGB`, `#RRGGBB`, `RRGGBB`. Anything else → `null`.
- `withAlpha(hex, alpha): string` → `rgba(...)`.
- `relativeLuminance(hex)`, `contrastRatio(a, b)`, `bestTextColor(bgHex): "#000000" | "#FFFFFF"` (WCAG 2.x formulas).
- 100% unit-test coverage.

---

## 8. Testing

### 8.1 Automated

- **Jest unit tests** (`tests/`) with high coverage of all pure logic:
  - colour utilities;
  - config validation (valid, invalid JSON, wrong version, unknown operator, wrong operand type, bad colour, unknown token, per-rule skip behaviour);
  - **condition evaluator**: every operator × every relevant data type, null handling, nested groups, column-to-column comparisons, date operators around midnight and across time zones, date-only vs date-and-time;
  - **style resolution and precedence**: first-to-set wins, row vs cell scope interplay, `stop`, priority ties, pill display, `fromOption` fallback behaviour;
  - rule-set matching (by table, and by column presence);
  - `getValue` against real `rowData` fixtures captured in V1.
- Validate every file in `config/` against `grid-format.schema.json` in CI.
- Lint with the template's ESLint config (`@microsoft/eslint-plugin-power-apps`), and `npm run build` for both controls in CI.

### 8.2 Local harness

- `npm start watch` (PCF test harness) for **control B**: test with a fixture of three options with colours, one option without colour, null value, disabled mode.
- The harness can't host the grid customizer meaningfully. Test control A in the dev environment.

### 8.3 Manual test matrix (dev environment), record results in `docs/decisions.md`

| Scenario | Expected |
|---|---|
| Inactive rows (statecode = 1) with `inactive-grey` rule, "All records" view | Inactive rows grey background and muted text; active rows unchanged |
| Same in dark mode | Grey uses the theme token and looks correct in dark mode |
| RAG row tint rule | Every cell tinted by the option colour; links and formatting intact |
| Switch RAG rule to pill on the RAG cell via env var (no rebuild) | Only RAG cell shows a pill with readable text |
| Inactive + RAG + overdue combined | Inactive wins background (stop); overdue date bold red on active rows; precedence as specified |
| Font colour / weight on lookup, text, number, date, currency, primary name cells | Matches V7 findings; documented exceptions only |
| Rule's condition column not in the view | Rule silently doesn't apply |
| Row with empty RAG / option without colour | No RAG styling (or fallback colour if configured) |
| Table with no rule set | Identical to plain grid |
| Invalid JSON | Plain grid + one console warning, no errors |
| One invalid rule among valid rules | Valid rules work; one warning naming the bad rule |
| Row selected / hovered | Selection still clearly visible |
| Subgrid on a form with customizer set | Same behaviour as main view |
| Editable grid: edit a cell that a condition depends on | Editing works; styling updates after the change or save |
| 250+ rows, ~10 rules, scroll | Smooth; no stale styles on recycled rows |
| Form: select each RAG option | Dot colour matches; record saves correct value |
| Form: business rule locks field | Read-only, dot still shown |
| Form: field security, no read | `***`, no dot |
| Form: value changed by JS (`formContext.getAttribute(...).setValue`) | Dot updates |
| Mobile app (phone) | Form control usable; grid degrades gracefully |

### 8.4 Visual evidence

Take screenshots (light and dark) of each scenario and attach them to `docs/decisions.md`.

---

## 9. Deployment and configuration (document in README)

1. Build: `dotnet build solution/WBGridFormatting -c Release` produces managed + unmanaged zips (set `SolutionPackageType` to `Both`).
2. Import the unmanaged solution to **dev**. In dev only, `pac pcf push --publisher-prefix wb` is fine for fast iteration.
3. Create the environment variable `wb_GridFormatConfig` (JSON) **inside the solution** with a safe default value: `{"version":1,"ruleSets":[]}`. Set per-environment current values through deployment settings (`pac solution create-settings`), generated from `config/environments/*.json`.
4. **Per table:** Customize the system → Entities → table → Controls → add **Power Apps grid control** → set `Customizer control` = `wb_WB.GridFormatter`. Leave `Enable OptionSet colors` = **No** on tables using this customizer, to avoid double styling. Save and publish. Repeat on any **subgrid** controls that should be styled. Note: these table/subgrid settings live in the solution containing that table, not in `WBGridFormatting`.
5. **Per form field:** in the modern form designer, select the RAG field → **Components** → add **RAG Choice (colour)** → set for Web (and optionally phone/tablet) → save and publish.
6. Make sure every column a rule's condition references is in each view that should be styled (pending V2), and that RAG choice options have colours set.
7. Promotion dev → UAT → prod: export **managed**, import with deployment settings. CI in GitHub Actions builds the zips. Release automation can be added later; it is not required for v1.

---

## 10. Definition of done

- Both controls build cleanly on macOS with no lint errors. CI is green, including config schema validation.
- Unit tests pass, with full coverage of `shared/color.ts`, the condition evaluator, style resolution, and config validation.
- All VERIFY items resolved, each with a short write-up in `docs/decisions.md` (what was tested, result, chosen approach).
- Manual test matrix in §8.3 completed with results and screenshots.
- `docs/configuration.md` gives config authors everything they need: rule anatomy, every operator with examples, style properties, colour forms (including theme tokens), scope and pill display, precedence with worked examples, the "columns must be in the view" rule, and ready-made recipes (inactive grey, RAG row, RAG pill, overdue bold red).
- README covers prerequisites (exact versions), install of `pac` on macOS, build, dev push, solution build, deployment settings, and per-table/per-field configuration.
- Final report to the product owner lists: assumptions used (§2), VERIFY outcomes, any requirement that couldn't be met and why, and the confirmed publisher prefix.

## 11. Things NOT to do

- Don't hard-code table names, column names, values, or colours in either control. Everything in control A comes from config.
- Don't support free-text expressions, `eval`, `new Function`, raw CSS strings, or class names in config.
- Don't call Web API inside renderers or on every `updateView`.
- Don't bundle React or Fluent (use platform libraries).
- Don't override cell **editors** in the grid customizer.
- Don't mutate grid data or Dataverse metadata.
- Don't use unsupported DOM hacks outside the cell container (e.g. querying the grid's internal class names or injecting global CSS). Approach 1 in §5.6 is limited strictly to `props.cellContainerElement` and the five managed style properties.
- Don't add third-party PCF controls or npm packages beyond what the template uses without listing them for approval. This is a managed corporate environment.

## 12. Future ideas (out of scope for v1, don't build)

- Icons in cells (e.g. warning icon when overdue).
- Rules stored in a Dataverse configuration table with a model-driven admin UI, instead of an environment variable.
- Per-user toggles to switch formatting off.
- Header styling and empty-grid overlays (supported by `GridCustomizer` but not needed now).

## 13. References

- Customize the editable grid control (grid customizer): https://learn.microsoft.com/power-apps/developer/component-framework/customize-editable-grid-control
- Customized editable grid sample: https://learn.microsoft.com/power-apps/developer/component-framework/sample-controls/customized-editable-grid-control
- Template: https://github.com/microsoft/PowerApps-Samples/tree/master/component-framework/resources/GridCustomizerControlTemplate
- Sample: https://github.com/microsoft/PowerApps-Samples/tree/master/component-framework/PowerAppsGridCustomizerControl
- Power Apps grid control properties (Customizer control, Enable OptionSet colors): https://learn.microsoft.com/power-apps/maker/model-driven-apps/the-power-apps-grid-control
- React controls and platform libraries: https://learn.microsoft.com/power-apps/developer/component-framework/react-controls-platform-libraries
- Modern theming for components: https://learn.microsoft.com/power-apps/developer/component-framework/fluent-modern-theming
- `getEntityMetadata` (PCF): https://learn.microsoft.com/power-apps/developer/component-framework/reference/utility/getentitymetadata
- OptionDescriptor / option `Color`: https://learn.microsoft.com/power-apps/developer/component-framework/reference/optiondescriptor
- Create a choice (option colours): https://learn.microsoft.com/power-apps/maker/data-platform/custom-picklists
- `pac pcf push`: https://learn.microsoft.com/power-platform/developer/cli/reference/pcf#pac-pcf-push
