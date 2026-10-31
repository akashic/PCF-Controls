# Build brief: `ChoiceCounts`, counts of related rows per choice option on a form

> **Audience:** an AI coding agent (or developer) building the control in this repo.
> **Date written:** 31 October 2026, from a grilling session with the product owner on the original requirements, [`controls/ChoiceCounts/DataverseAggregate_PCF_Control.md`](../../controls/ChoiceCounts/DataverseAggregate_PCF_Control.md). Read that file for background on aggregate FetchXML, but **this brief overrides it** wherever they differ: it renames the control, cuts the operations to count, and changes the manifest. Platform facts were checked against Microsoft Learn on 31 October 2026. Anything not confirmed is marked **VERIFY**. Prove those with a spike in dev and record the result in `controls/ChoiceCounts/docs/decisions.md` before building on them.
> Repo conventions (`README.md`, `CLAUDE.md`, `docs/adr/`) apply throughout and aren't repeated here.

---

## 1. What we are building and why

Forms need to show at a glance how many related rows are in each status, for example on a fund's form: **Red 2 · Amber 5 · Green 11** for its tasks. The counts must be live, calculated by Dataverse (not by downloading every row), and must not be stored in a column. Storing them would mean keeping a counter in sync every time a child row is created, deleted or changed.

`ChoiceCounts` is a **virtual (React, Fluent 9) field control**. It runs **one aggregate FetchXML query** that counts rows of a configured table, grouped by a choice column, and shows one coloured badge per option.

| Item | Value |
|---|---|
| Folder | `controls/ChoiceCounts/` |
| npm workspace | `@wb-pcf/choice-counts` |
| Logical name | `wb_Controls.ChoiceCounts` |
| Solution | `WBChoiceCounts` (contains only the control; no environment variables) |
| Start version | `0.1.0` |

---

## 2. Decisions (product owner, 31 Oct 2026)

| Topic | Decision |
|---|---|
| Name | `ChoiceCounts`, not `DataverseAggregate`: the control counts rows per choice option and doesn't aggregate in general. |
| Operations | **Count only.** No sum, avg, min or max, and no properties for them. |
| Several counts per instance | **One group-by query on a choice column**, returning a count per option. Not a configured list of separately filtered counts. |
| Grouped column types | Choice, Status Reason, Status and Yes/No. Multi-select choice is rejected with a warning. |
| Which options show | **Every option in metadata order, including zero counts**, with an optional property that limits the display to a subset of option values, in the order given. |
| Blank values | Rows with no value in the grouped column are **left out**. |
| Look | A row of **coloured badges** (option label + count), tinted with the option's metadata colour using `@wb-pcf/shared` (the same approach as RagChoice). Text is always visible. |
| Label | **No label property.** The form draws the host column's label, and makers can rename it on each form. |
| Hosting | The bound property is a **type-group of common column types**, so makers can host the control on an existing column. The control **never writes** to the bound column. |
| Filter | An optional **FetchXML fragment**, parsed and checked against an allow-list of `<filter>`, `<condition>`, `<value>` and **`<link-entity>`**. Anything else is rejected with a warning. |
| Counting | Always `countcolumn` with `distinct="true"` on the queried table's **primary ID**, so a one-to-many `<link-entity>` can't count a row twice. |
| Current record | An optional **relationship lookup** column on the queried table. When set, the control adds a condition on it equal to the current record ID. When blank, nothing is filtered by the current record. There's no separate `useCurrentRecord` flag. |
| Record ID source | Microsoft's **documented pattern**: an input property that makers bind to the form's primary-key column ([PCF FAQ](https://learn.microsoft.com/power-apps/developer/component-framework/faq#how-can-i-access-the-record-id-or-table-name)). The undocumented `context.mode.contextInfo` isn't used. |
| When it queries | When the form loads, when the record ID changes (which covers the first save), and from a **refresh button**. Never on other `updateView` calls. |
| Unsaved record | When a relationship lookup is set but the record ID is empty, show a muted **"Available after save"** and run no query. |
| Errors | **Fail soft**: one `console.warn`, and a neutral **"—"** with a short generic tooltip ("Counts unavailable"). No error text on the form. |
| Over 50,000 rows | Dataverse rejects the query (`8004E023`). Show "—" with the tooltip **"Too many rows to count"**, and document the limit. Never use `aggregatelimit`: it hides the error by counting an arbitrary subset. |
| Interaction | **Display-only** in v1. No drill-through. |
| Dropped from the original doc | `aggregateType`, `aggregateColumn`, `prefix`, `suffix`, `decimalPlaces`, `useCurrentRecord`, `label`, the plain-DOM `standard` control type, the hard-coded CSS colours, and the `WBSuper.Controls` namespace. |

---

## 3. Platform facts

Each fact is marked as documented on Microsoft Learn **[D]**, proved by an earlier spike in this repo **[R]**, inferred **[I]**, or **VERIFY**.

- **Aggregate FetchXML** **[D]** ([aggregate data](https://learn.microsoft.com/power-apps/developer/data-platform/fetchxml/aggregate-data)):
  - `<fetch aggregate="true">`, an `alias` on every attribute, and `groupby="true"` on the grouping attribute.
  - Add `<order alias="…"/>` when grouping.
  - `countcolumn` counts non-null values, and `distinct="true"` counts unique values.
  - Aggregate queries fail above **50,000** rows.
- **Running the query** **[D]**: `context.webAPI.retrieveMultipleRecords(table, "?fetchXml=…")` ([reference](https://learn.microsoft.com/power-apps/developer/component-framework/reference/webapi/retrievemultiplerecords)).
- **Mobile offline** **[D]**: grouping and aggregation aren't supported. Fail soft there.
- **Response shape** **[I]**: one entity per group, keyed by alias.
  - **VERIFY C-3**: the exact response shape.
  - **VERIFY C-3**: whether `context.webAPI` returns `@OData.Community.Display.V1.FormattedValue` annotations. If it doesn't, take labels from metadata.
- **Record ID** **[D]**: the PCF context doesn't expose the record ID. The supported pattern is a `SingleLine.Text` input bound to the primary-key column.
  - **VERIFY C-1**: the form designer lets makers bind it.
  - **VERIFY C-1**: it's empty on an unsaved Create form.
  - **VERIFY C-1**: it changes to the GUID after the first save, and `updateView` fires with `context.updatedProperties` naming it.
- **Save event** **[D]**: there's no save or refresh event for PCF. `updateView` fires when the property bag changes ([updateView](https://learn.microsoft.com/power-apps/developer/component-framework/reference/react-control/updateview)). That's why the bound record ID is also the save signal.
- **Type-groups** **[D]**: `of-type-group` is supported for model-driven apps ([type-group](https://learn.microsoft.com/power-apps/developer/component-framework/manifest-schema-reference/type-group)). Status and Status Reason types **can't** be in a type-group, so `statecode` and `statuscode` can't *host* the control, though they can still be the *grouped* column. pcf-scripts types a mixed group as the generic `Property`.
  - **VERIFY C-2**: the form designer offers every type in the group.
- **Primary ID** **[R][I]**: `context.utils.getEntityMetadata` works from PCF (GridFormatter V3).
  - **VERIFY C-4**: `PrimaryIdAttribute` is on the PCF result.
- **Option labels and colours for an unbound column** **[R]**: use `getEntityMetadata(table, [column])` → `attributeDescriptor.OptionSet[].Color` (undocumented), falling back to the Web API `…/Attributes(LogicalName='<c>')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet`, with the `Status`, `State` and `Boolean` variants (GridFormatter `docs/decisions.md` V3). Reuse GridFormatter's approach rather than writing it again.

---

## 4. Manifest

`control-type="virtual"`, platform libraries React `16.14.0` and Fluent `9.46.2`, `<uses-feature name="WebAPI" required="true" />` and `<uses-feature name="Utility" required="true" />`, and `external-service-usage` disabled. No apostrophes in `*-key` attributes.

| Property | Usage / type | Required | Purpose |
|---|---|---|---|
| `host` | bound, type-group (text, whole number, decimal, currency, date, Yes/No, choice, lookup) | yes | Placement only. The control never reads or writes it. |
| `recordId` | input, `SingleLine.Text`, bound to the form's primary-key column | no | The current record ID. Needed only when `relationshipColumn` is set. |
| `tableName` | input, `SingleLine.Text` | yes | Logical name of the table to count, e.g. a child table. |
| `groupColumn` | input, `SingleLine.Text` | yes | The column to group by: Choice, Status Reason, Status or Yes/No. |
| `relationshipColumn` | input, `SingleLine.Text` | no | Lookup column on `tableName` that points at the current record. When set, results are filtered to the current record. |
| `filterXml` | input, `Multiple` | no | FetchXML fragment: `<condition>`, `<filter>` and `<link-entity>` elements. |
| `optionValues` | input, `SingleLine.Text` | no | Comma-separated option values to show, in this order, e.g. `1,2`. Blank shows every option. |

Every logical name in configuration is project-supplied and can use any prefix (ADR-0005). Validate each one with `^[A-Za-z_][A-Za-z0-9_]*$`. Validate `optionValues` as integers that exist in the column's options, skipping unknown ones with a warning.

---

## 5. Behaviour

### 5.1 Building the query (pure function)

```xml
<fetch aggregate="true">
  <entity name="{tableName}">
    <attribute name="{primaryId}" alias="rowcount" aggregate="countcolumn" distinct="true" />
    <attribute name="{groupColumn}" alias="groupvalue" groupby="true" />
    <filter type="and">
      {validated filterXml}
      <condition attribute="{relationshipColumn}" operator="eq" value="{recordId}" />  <!-- only when relationshipColumn is set -->
    </filter>
    <order alias="groupvalue" />
  </entity>
</fetch>
```

- **Parsing the fragment:** parse `filterXml` with `DOMParser` inside a wrapper element.
  - Accept only `filter`, `condition`, `value` and `link-entity` elements.
  - Accept only the attributes FetchXML defines for those elements.
  - Re-serialise the parsed tree, so the control never splices the raw string into the query.
  - Reject the whole configuration with a warning if it doesn't parse or contains anything else.
- **Inserted values:** XML-escape every value inserted. Normalise `recordId` by stripping braces, lower-casing it and checking it's a GUID.

### 5.2 Merging results

- **Map the rows:** map the response rows to `{ value → count }`, and drop the null group.
- **Merge with metadata:** merge with the column's options in metadata order, giving missing options a count of 0.
- **Apply the subset:** then apply `optionValues`, keeping the order the maker gave.
- **Hidden options:** keep the RagChoice rule. Hidden options are left out unless they have rows or are listed in `optionValues`.

### 5.3 When it queries

- Query once the configuration and metadata are ready.
- Query again when `recordId` changes, which covers the first save.
- Query again from the refresh button.
- Ignore every other `updateView`.
- Use a request version to drop stale responses.
- Cache metadata at module scope, keyed by table and column, so several instances on one form share it.

### 5.4 States

| State | Display |
|---|---|
| Loading (first load) | Fluent `Spinner` size `tiny`, labelled for screen readers |
| Refreshing | Keep the current badges; show a busy state on the refresh button |
| Ready | One badge per option: tinted fill, label and count, with contrast-chosen text colour (`@wb-pcf/shared`) and a neutral border |
| Unsaved record (relationship set) | Muted text "Available after save" |
| Bad config, failed query, offline, no Read privilege | "—" with tooltip "Counts unavailable"; one `console.warn` naming the cause |
| More than 50,000 rows | "—" with tooltip "Too many rows to count"; one `console.warn` |

Colour is never the only signal. Badges are text, so they're readable without the colour, and the whole control has an accessible name such as "Red 2, Amber 5, Green 11". The refresh button is a Fluent icon `Button` with an `aria-label`. Use theme tokens for everything that isn't an option colour, so dark mode works.

---

## 6. Testing

### 6.1 Jest (pure logic, high coverage)

- **Config validation:** logical names, `optionValues` and the group column type.
- **Fragment parser and allow-list:** valid fragments and nested filters; link-entity; rejection of `<fetch>`, `<attribute>`, `<order>`, unknown attributes and malformed XML; escaping.
- **FetchXML builder:** with and without the relationship and filter.
- **Result merge:** zero-fill, metadata order, subset order, the null group dropped, hidden options.
- **Mapping state to display:** each row of §5.4, including detecting the `8004E023` error.

### 6.2 Dev test matrix (record in `docs/decisions.md`)

| Case | Expected |
|---|---|
| 0, 1 and many child rows per option | Correct counts, zeros shown |
| Inactive child rows excluded by a `statecode` condition in the filter | Excluded |
| Child rows of another parent | Excluded when the relationship is set |
| One-to-many `link-entity` in the filter | No double counting |
| New record, then the first save | "Available after save", then counts with no reload |
| Add a child in a subgrid, then press refresh | Count updates |
| Group by Choice, Status Reason, Status, Yes/No | Labels and colours from metadata |
| `optionValues` subset | Only those options, in the given order |
| Invalid table, column or fragment, or no Read privilege | "—" and one warning; the form keeps working |
| Hosted on text, number and lookup columns | Renders; the host column is never changed |
| Light and dark mode; mobile app | Readable; mobile never crashes |
| Several instances on one form | One metadata load for each table and column |

Test with an administrator and the project's least-privileged role to confirm the counts respect Dataverse security.

---

## 7. Things NOT to do

- Don't retrieve rows and count them in the browser.
- Don't write to the bound column or call `notifyOutputChanged`.
- Don't splice the raw `filterXml` string into the query.
- Don't use `aggregatelimit`.
- Don't use `context.mode.contextInfo`, `context.page` or `Xrm` to find the record.
- Don't query in `updateView` except when `recordId` changes.
- Don't hard-code tables, columns, option values or colours, or the `wb_` prefix.

## 8. Future ideas (out of scope for v1, don't build)

Drill-through from a badge to the matching rows; a total badge; a "(blank)" badge; sum, avg, min and max; several unrelated filtered counts in one instance.
