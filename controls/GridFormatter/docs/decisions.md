# GridFormatter: spike decisions (VERIFY V1–V8)

Results of the VERIFY spikes in the brief (`docs/briefs/2026-10-21-grid-formatting-and-rag-choice.md` §3.2), issue #9.

- **Environment:** `LowCode` (https://lowcode.crm.dynamics.com/), a personal test tenant, **not** the William Buck tenant.
- **Test data:** table `wb_gridspike` (unmanaged solution `WBGridSpikeTest`; delete after testing) with every column type, a RAG choice coloured Red `#D13438`, Amber `#FFB900` and Green `#107C10`, an "Unknown" option with no colour, and 30 rows (6 inactive).
- **Spike build:** `wb_WB.GridFormatter` 0.0.1–0.0.4, with instrumentation in `GridFormatter/spike/`, which #13 replaces.
- **Customizer setup:** the grid's `Customizer control` was set by writing `GridCustomizerControlFullName` into the table's `customcontroldefaultconfig`. That's the same change the classic Controls tab makes.
- **Dates:** checked 22 Oct 2026, in light mode, desktop Chrome, locale en-AU (UTC+10).

## Summary

| Item | Result | Decision |
|---|---|---|
| V1 `rowData` shape | Keyed by column logical name; types listed below | `getValue` normalises using these shapes; fixtures in `tests/fixtures/rowdata.wb_gridspike.json` |
| V2 Columns not in the view | **Not present** in `rowData` | A rule only fires on views that include its condition columns. This is documented for config authors |
| V3 `webAPI` and `getEntityMetadata` | Both available and working in the customizer's `init` | Use them; option colours from `attributeDescriptor.OptionSet` (see V3) |
| V4 Table and view | Table: `context.page.entityTypeName` ✅. View id: only in the URL or internal fields ❌ | Rules are keyed by table (ADR-0004). Filtering by view is **not supported** |
| V5 Async load vs `fireEvent` | Delaying `fireEvent` by 2 s still applies the customizer | Load config and metadata in `init`, then `fireEvent`, with a ~3 s timeout that fires anyway with no styling |
| V6 Row styling technique | Container `background-image` layer fills the whole cell for every type, and hover and selection stay visible | Backgrounds: container + translucent `background-image` |
| V7 Font properties | Italic and underline inherit; colour and bold do not | Colour and bold only by drawing simple types ourselves (see V7) |
| V8 Environment variable size | **Max 2,000 characters** | The environment variable is dropped; one JSON web resource per table (ADR-0004) |
| Theme tokens | `var(--colorNeutralBackground3)` resolves inside grid cells (`#f5f5f5`), not on `:root` | Theme tokens in config are emitted as CSS `var(--token, fallback)` on the cell |
| Fluent 9 declaration | 0.0.4 declares Fluent 9.46.2 (still being checked, see open items) | Follow PR #18: Fluent 9.46.2 |

## V1: `rowData` shape

`params.rowData` holds `__rec_id`, `params` (grid functions: `navigation`, `cellImageInfo`), and one key per **visible** column, keyed by logical name. The raw values per column type, as captured:

| Column type (`colDefs[].dataType`) | Raw value in `rowData` | Example | Normalised by `getValue` to |
|---|---|---|---|
| `Text` | string | `"Spike row 01"` | string |
| `OptionSet` (choice, `statecode`, `statuscode`) | **string** of the option value | `"948790001"`, `"0"` | number |
| `MultiSelectPicklist` | number[] | `[948790000, 948790001]` | number[] |
| `TwoOptions` | boolean | `false` | boolean |
| `Lookup` | `{ id: { guid }, etn, name }` or `null` | `{ "id": { "guid": "4c2d…" }, "etn": "wb_gridspike", "name": "Spike row 01" }` | GUID string |
| `Persona` (**Owner**; the type is not `Owner`) | `{ id: { guid }, etn, name }` | `etn: "systemuser"` | GUID string |
| `Integer`, `Decimal`, `Currency` | number | `10`, `3.14`, `1000` | number |
| `DateOnly` | ISO string at UTC midnight | `"2026-10-18T00:00:00.000Z"` | date-only string `2026-10-18` (take the UTC date part; no time-zone shift) |
| `DateAndTime` (user local) | ISO UTC string | `"2026-10-21T19:48:00.000Z"` (shown as 22/10/2026 6:48 AM at UTC+10) | `Date` |

Empty values are `null`, except multi-select, which is also `null` when empty. `props.formattedValue` matches what the grid shows; multi-select joins with `"; "`.

For choice columns, `colDefs[].customizerParams.dropDownOptions` lists each option's `key` and `text`, but this isn't documented. Use metadata (V3).

## V2: Columns not in the view

On the system "Active Grid spikes" view (Name and Created On only), `rowData` held only `wb_name` and `createdon`. `statecode`, `wb_ragstatus` and the others were absent.

**Rule for config authors:** a rule only applies on views that contain every column its condition and `fromOption` colour use. To opt a view out, leave those columns out of it. Rules whose columns are missing are skipped silently.

## V3: Web API and metadata

- `context.webAPI.retrieveMultipleRecords("environmentvariabledefinition", "?$select=…&$expand=environmentvariabledefinition_environmentvariablevalue($select=value)")` worked. The expand name is valid. This no longer matters for config (ADR-0004).
- `context.utils.getEntityMetadata(table, [columns])` works in `init` and returns `XrmAttributeMetadata` objects. For choice, status and multi-select columns, the options are an array in `attributeDescriptor.OptionSet`: 4 for `wb_ragstatus`, 2 each for `statecode` and `statuscode`, and 3 for `wb_tags`. **The exact field name for each option's colour is still being confirmed** (open items).

## V4: Table and view

| Source | Table | View id |
|---|---|---|
| `context.page.entityTypeName` | `wb_gridspike` ✅ | — |
| `context.mode.contextInfo.entityTypeName` | `wb_gridspike` | — |
| Page URL (`etn`, `viewid`) | ✅ | ✅, but only on main grid pages, and reading the URL isn't a supported API |
| `context.mode._customControlProperties.personalizationConfiguration.viewId` | — | ✅ but internal, so not used |

Decision: use `context.page.entityTypeName`. Don't filter by view.

## V5: Timing

| Run | `init` | `fireEvent` | First renderer call |
|---|---|---|---|
| Immediate | 3 ms | 6 ms | 29 ms |
| `fireEvent` delayed 2 s | 18 ms | 2,025 ms | 2,085 ms (styling applied) |

The grid waits for the customizer event, so the first paint can already be styled. In the first second, the grid called renderers 448 times for 30 rows × 16 columns, about once per visible cell. Decision: in `init`, load the table's config web resource and the option metadata, then call `fireEvent`. If loading takes longer than about 3 seconds, fire anyway with renderers that style nothing, and log one warning.

## V6: Styling the whole row

`props.cellContainerElement` is the ag-grid cell itself (`div[role=gridcell].ag-cell`, full column width), present on the first call.

| Technique | Result |
|---|---|
| Inline `style.backgroundColor` | ❌ Not visible. The grid theme sets `.ag-cell { background-color: … !important }` (also on hover, focus and range selection) |
| Inline `background-color` with `!important` | Works, but hides the grid's own hover and selection colours. Not used |
| Inline `background-image: linear-gradient(c, c)` | ✅ Fills the whole cell for **every** column type (text, links, lookups, Owner, numbers, dates), with no gaps. Hover and selection colours stay visible through a translucent tint |
| Drawing simple types ourselves (technique 3) for the background | ❌ Leaves gaps at the cell padding, and does nothing for types we don't draw |

**Decision:** row-scope and cell-scope backgrounds go on the container as a `background-image` layer, always set or cleared on every call (the grid reuses containers). Backgrounds must be **translucent**: an opaque fill would hide the selection colour. Token colours used as backgrounds are therefore applied at reduced alpha, through `color-mix(in srgb, var(--token) N%, transparent)` or the `tintAlpha` default.

## V7: Font properties

Inside every cell the grid renders `ms-Shimmer-container fullSpace` → `…dataWrapper` → `containerStyles` → `ms-Stack` → `ms-Label` / `ms-Link` / `ms-Persona`. An inner wrapper resets `font-weight` to 400, and `ms-Label` sets its own `color` (`rgb(36, 36, 36)`).

| Property set on the container | Text, choice, Yes/No, numbers, currency, dates | Primary name, Lookup (links) | Owner (`Persona`) | Multi-select |
|---|---|---|---|---|
| `font-style: italic` | ✅ | ✅ | ❌ | ✅ |
| `text-decoration: underline` | ✅ (line drawn in the container's colour) | ✅ | ❌ | ✅ |
| `color` | ❌ | ❌ (keeps link colour) | ❌ | ❌ |
| `font-weight` | ❌ | ❌ | ❌ | ❌ |

Drawing `formattedValue` ourselves (technique 3) gives full control of colour and bold. But on the **primary name column it removes the "open record" link**, so that column must never be drawn by the control.

**Decision:**

| Style property | How | Column types |
|---|---|---|
| `backgroundColor` | Container `background-image` (V6) | All |
| `fontStyle`, `textDecoration` | Container | All except Owner (`Persona`); not applied there |
| `color`, `fontWeight` | Draw `formattedValue` in our own cell, **only in cells where a rule sets one of these**: full size, `isRightAligned` respected, `text-overflow: ellipsis`, `onCellClicked` forwarded | `Text` (not primary), `Integer`, `Decimal`, `FloatingPoint`, `Currency`, `DateOnly`, `DateAndTime`, `OptionSet`, `TwoOptions` |
| `color`, `fontWeight` | **Not supported**; documented in `configuration.md` | Primary name, `Lookup`, `Customer`, `Owner`/`Persona`, `MultiSelectPicklist`, `File`, `Image` |

`display: "pill"` cells are always drawn by our `Pill` component, which is a deliberate replacement.

## V8: Environment variable size

Tested with the Web API on a throwaway JSON environment variable in `WBGridSpikeTest`, since deleted:

| Column | Accepted | Rejected |
|---|---|---|
| `environmentvariabledefinition.defaultvalue` (memo, `MaxLength` 2000) | 2,000 characters | 5,000 (`0x80044331`: length exceeded) |
| `environmentvariablevalue.value` (memo, `MaxLength` 2000) | 1,999 characters | 2,001 (database constraint) |

At about 150–250 characters per rule, that's 8–12 rules per environment, far short of the brief's ~50. **Decision (product owner, 22 Oct 2026):** one JSON web resource per table, `wb_/GridFormatter/<table>.json`, shipped in the project solution that owns the table. See ADR-0004.

## Theme

- `context.fluentDesignLanguage` is present with `tokenTheme`, `brand` and `isDarkTheme` (false in this run).
- Fluent 9 CSS variables are **not** defined on `:root`, but **are** inside grid cells: `getComputedStyle(cell).getPropertyValue("--colorNeutralBackground3")` returned `#f5f5f5`.
- Decision: a `{ "token": "…" }` colour is emitted as `var(--<token>, <light-theme fallback hex>)`, so it adapts to dark mode where the variable is defined and falls back safely elsewhere.

## Open items

- [ ] **Option colour field:** confirm the field name holding each option's colour in `attributeDescriptor.OptionSet[]` (expected `Color`).
- [ ] **Fluent 9.46.2 declaration (0.0.4):** confirm the grid still loads the customizer.
- [ ] **Dark mode:** screenshot of the tinted rows.
- [ ] Mobile, subgrids on forms, editable grid, and 250+ rows: covered by the manual test matrix (#15).
- [ ] Screenshots: add the light-mode container, render-mode and hover/selection captures to `docs/screenshots/`.
