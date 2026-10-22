# GridFormatter: spike decisions (VERIFY V1–V9)

Results of the VERIFY spikes in the brief (`docs/briefs/2026-10-21-grid-formatting-and-rag-choice.md` §3.2), issue #9.

- **Environment:** `LowCode` (https://lowcode.crm.dynamics.com/), a personal test tenant, **not** the William Buck tenant.
- **Test data:** table `wb_gridspike` (unmanaged solution `WBGridSpikeTest`; delete after testing) with every column type, a RAG choice coloured Red `#D13438`, Amber `#FFB900` and Green `#107C10`, an "Unknown" option with no colour, and 30 rows (6 inactive).
- **Spike build:** `wb_WB.GridFormatter` 0.0.1–0.0.5, with instrumentation in `GridFormatter/spike/`, which #13 replaced. From 0.1.0 the PCF namespace is `Controls`, so the control is `wb_Controls.GridFormatter`.
- **Customizer setup:** the grid's `Customizer control` was set by writing `GridCustomizerControlFullName` into the table's `customcontroldefaultconfig`. That's the same change the classic Controls tab makes.
- **Dates:** checked 22 Oct 2026, in light mode, desktop Chrome, locale en-AU (UTC+10).

## Summary

| Item | Result | Decision |
|---|---|---|
| V1 `rowData` shape | Keyed by column logical name; types listed below | `getValue` normalises using these shapes; fixtures in `tests/fixtures/rowdata.wb_gridspike.json` |
| V2 Columns not in the view | **Not present** in `rowData` | A rule only fires on views that include its condition columns. This is documented for config authors |
| V3 `webAPI` and `getEntityMetadata` | Both available and working in the customizer's `init`; option colours only in the undocumented `attributeDescriptor.OptionSet[].Color` | Read `attributeDescriptor.OptionSet` defensively, falling back to the Web API metadata endpoint |
| V4 Table and view | Table: `context.page.entityTypeName` ✅ on main grids (but see V9). View id: only in the URL or internal fields ❌ | Rules are keyed by table (ADR-0004). Filtering by view is **not supported** |
| V5 Async load vs `fireEvent` | Delaying `fireEvent` by 2 s still applies the customizer | Load config and metadata in `init`, then `fireEvent`, with a ~3 s timeout that fires anyway with no styling |
| V6 Row styling technique | Container `background-image` layer fills the whole cell for every type, and hover and selection stay visible | Backgrounds: container + translucent `background-image` |
| V7 Font properties | Italic and underline inherit; colour and bold do not | Colour and bold only by drawing simple types ourselves (see V7) |
| V8 Environment variable size | **Max 2,000 characters** | The environment variable is dropped; one JSON web resource per table (ADR-0004) |
| V9 A form subgrid's table (#30) | `context.page.entityTypeName` is the **form's** table; the subgrid's own table is only in the undocumented `factory._customControlProperties.descriptor.Parameters.TargetEntityType` | Read `TargetEntityType` first, fall back to the page's table, and warn on a form if it's missing (0.2.0) |
| Theme tokens | `var(--colorNeutralBackground3)` resolves inside grid cells (`#f5f5f5`), not on `:root` | Theme tokens in config are emitted as CSS `var(--token, fallback)` on the cell |
| Fluent 9 declaration | 0.0.4 declares Fluent 9.46.2 in place of the template's Fluent 8; the customizer loads and styles as before | Declare Fluent 9.46.2 (as PR #18 recommends) |

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
- `context.utils.getEntityMetadata(table, [columns])` works in `init` and returns `XrmAttributeMetadata` objects.
- **Where option colours are:**

  | Path | Shape | Colour? |
  |---|---|---|
  | `metadata.Attributes.get(col).OptionSet` (documented) | `{ "<value>": { text, value } }` | ❌ none |
  | `metadata.Attributes.get(col).attributeDescriptor.OptionSet` (not in the typings) | `[{ Value, Label, Color, IsHidden, TransitionData }]` | ✅ `Color` (e.g. `"#D13438"`); **missing** when the option has none |

  Captured for `wb_ragstatus`: Red `#D13438`, Amber `#FFB900`, Green `#107C10`, and Unknown with no `Color` key. Status, status reason and multi-select columns have the same shape.
- **Decision:** `metadataStore` reads `attributeDescriptor.OptionSet[].Color` through a defensive accessor that checks every step and never throws. If that shape is missing, it falls back to the documented Web API metadata endpoint, `/api/data/v9.2/EntityDefinitions(LogicalName='<table>')/Attributes(LogicalName='<col>')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet` (or `MultiSelectPicklistAttributeMetadata`, `StateAttributeMetadata`, `StatusAttributeMetadata`), called once per table. A missing or invalid colour falls back to `defaults.fallbackColor`, and otherwise the rule doesn't style.
- `IsHidden` is exposed here too, which is useful for RagChoice's hidden-option question (#7).

## V4: Table and view

| Source | Table | View id |
|---|---|---|
| `context.page.entityTypeName` | `wb_gridspike` ✅ | — |
| `context.mode.contextInfo.entityTypeName` | `wb_gridspike` | — |
| Page URL (`etn`, `viewid`) | ✅ | ✅, but only on main grid pages, and reading the URL isn't a supported API |
| `context.mode._customControlProperties.personalizationConfiguration.viewId` | — | ✅ but internal, so not used |

Decision: use `context.page.entityTypeName`. Don't filter by view. (Superseded for form subgrids by V9.)

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

## V9: A form subgrid's table (#30)

Found in #15: on `wb_gridspike`'s form, a **Users** subgrid using GridFormatter loaded `wb_/GridFormatter/wb_gridspike.json`, not `systemuser.json`. A probe rule (`fullname isNotNull`) tinted the Users row only when it was in the gridspike file. V4 was only checked on main grids, where the page and the grid are the same table.

A spike build (0.1.1–0.1.2, never committed) kept each instance's `context` on `window` and searched it. One customizer instance runs per grid, each with its own `context`:

| Source | Main grid | Child rows subgrid (`wb_gridspike` on its own form) | Users subgrid (`systemuser` on the `wb_gridspike` form) |
|---|---|---|---|
| `context.page.entityTypeName` | `wb_gridspike` | `wb_gridspike` | `wb_gridspike` ❌ |
| `context.mode.contextInfo.entityTypeName` | `wb_gridspike` | `wb_gridspike` | `wb_gridspike` ❌ |
| `context.mode.contextInfo.entityId` | not set | the form's record id | the form's record id |
| `context.factory._customControlProperties.descriptor.Parameters.TargetEntityType` | not set | `wb_gridspike` | `systemuser` ✅ |
| Renderer `params` (`colDefs`, `rowData`) | no table name | no table name | no table name |

The other places naming the subgrid (the control id `wb_usersgrid` in `contextToken.controlName`, `descriptor.Id` and `learningPath`) are internal too, and only give the control name.

No documented API gives a subgrid's table. Decision (0.2.0, `engine/gridTable.ts`):
- Use `TargetEntityType` when it's a non-empty string, otherwise `context.page.entityTypeName`.
- If a grid is on a form (`contextInfo.entityId` set) but has no `TargetEntityType`, warn once. That would mean the platform changed, and a subgrid of another table would get the form's rules again.

This is the same trade-off as V3's option colours: an undocumented property, read defensively, with a documented fallback. Verified in `LowCode` on 0.2.0: the Users subgrid used `systemuser.json`; the Child rows subgrid (135 cells) and the main grid (405 cells) had no mismatches.

## Theme

- `context.fluentDesignLanguage` is present with `tokenTheme`, `brand` and `isDarkTheme` (false in this run).
- Fluent 9 CSS variables are **not** defined on `:root`, but **are** inside grid cells: `getComputedStyle(cell).getPropertyValue("--colorNeutralBackground3")` returned `#f5f5f5`.
- Decision: a `{ "token": "…" }` colour is emitted as `var(--<token>, <light-theme fallback hex>)`, so it adapts to dark mode where the variable is defined and falls back safely elsewhere.

## End-to-end check: RAG colours (0.0.5)

The spike's default mode reads `wb_ragstatus` option colours from `attributeDescriptor.OptionSet[].Color` in `init`, then calls `fireEvent` (the V5 pattern, with a 3 s timeout). It then:
- tints each row with its option colour at 18% alpha, using the container `background-image` technique (V6);
- draws the RAG cell as a pill, with black or white text picked by `bestTextColor` from `@wb-pcf/shared`.

**Confirmed in `LowCode` on 22 Oct 2026:** Red, Amber and Green rows tint correctly across every column, with pills in the option colours. "Unknown" (no colour) and empty rows stay plain. This proves the path the real engine (#13) uses: metadata colour → `@wb-pcf/shared` → container tint and pill, including the shared package bundled into the control.

## Open items

- [x] **Option colour field:** `attributeDescriptor.OptionSet[].Color` (see V3).
- [x] **Fluent 9.46.2 declaration (0.0.4):** confirmed. The tint still applies.
- [ ] **Dark mode:** screenshot of the tinted rows. Deferred to the manual test matrix (#15).
- [ ] Mobile, subgrids on forms, editable grid, and 250+ rows: covered by the manual test matrix (#15).
- [ ] Screenshots: add the light-mode container, render-mode and hover/selection captures to `docs/screenshots/`.
