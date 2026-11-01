# ChoiceCounts

A virtual (React, Fluent 9) **field control** that shows how many related rows have each option of a choice column. For example, on an SMSF Matter, it can show **Red 2 · Amber 3** for that matter's tasks. The counts come from one aggregate FetchXML query run by Dataverse, so they're live, respect security, and aren't stored anywhere. Optionally, selecting a count raises an event that a form script can use to show the matching rows.

| | |
|---|---|
| Logical name | `wb_Controls.ChoiceCounts` |
| Solution | `WBChoiceCounts` (the control only) |
| Brief | [docs/briefs/2026-10-31-choice-counts.md](../../docs/briefs/2026-10-31-choice-counts.md) |
| Decisions and VERIFY outcomes | [docs/decisions.md](docs/decisions.md) |
| Deploying to William Buck | [docs/william-buck-deployment-guide.md](docs/william-buck-deployment-guide.md) |
| Drill-through form script | [examples/drill-through.js](examples/drill-through.js) |

## Properties

| Property | Type | Purpose |
|---|---|---|
| Host column | bound (text, number, date, Yes/No, choice or lookup) | Places the control. Never read or written |
| Record ID | text, **bound to the form's primary key** | Filters the count to the open record when a relationship column is set |
| Table to count | text | Logical name of the table whose rows are counted |
| Group by column | text | A Choice, Status Reason, Status or Yes/No column on that table (not multi-select) |
| Relationship column | text, optional | The lookup on the counted table that points at the open record |
| Filter (FetchXML) | multiple lines, optional | `<condition>`, `<filter>` and `<link-entity>` elements only, for example `<condition attribute="statecode" operator="eq" value="0" />`. Under 4,000 characters |
| Options to show | text, optional | Comma-separated option values, shown in this order. Blank shows every option. If none of the values match, every option is shown and a warning is logged |
| When a count is selected | Nothing / Raise OnOptionSelect | With "Raise OnOptionSelect", each count is a button raising **OnOptionSelect** with `{ value, label, count, tableName, groupColumn }` |

What it shows:
- **Normally:** a spinner while loading, then a coloured badge per option (label and count), with a refresh button.
- **On a new record, when a relationship column is set:** "Available after save".
- **On any failure:** "—", with a tooltip. One `console.warn` per cause, starting `ChoiceCounts:`.

## Limits

- **Counts refresh** on form load, after the first save, and from the refresh button.
- **50,000 rows:** Dataverse's aggregate limit. Above it the control shows "Too many rows to count".
- **No mobile offline counts.**
- **Custom events are preview** in Microsoft's documentation.

## Development

```sh
npm test -w @wb-pcf/choice-counts          # Jest, 100% coverage of logic/
npm run lint -w @wb-pcf/choice-counts
dotnet build controls/ChoiceCounts/solution -c Release
```

The pure logic is in `ChoiceCounts/logic/` (config, filter parser, query builder, results, metadata, display state). `ChoiceCountsControl.tsx` wires it to Dataverse through `data.ts`, and `ChoiceCountsView.tsx` renders it. The `LowCode` test setup is in [docs/testing/choicecounts-test-environment.md](../../docs/testing/choicecounts-test-environment.md).

## Changelog

### 0.1.1 (unreleased)

- The counts UI: metadata, query, badges, refresh and every state (#54).
- Drill-through: the OnOptionSelect event and the example form script (brief amendment, 1 Nov 2026).
- Review fixes:
  - The filter parser rejects inherited entity names, characters XML forbids, and names that aren't logical names.
  - Inside `<filter>`, it accepts only the four link types FetchXML allows there.
  - It rejects a condition with both a `value` attribute and `<value>` elements.
  - Filters are capped at 4,000 characters.
  - Names are lower-cased.
  - Counts must be whole numbers.
  - "Options to show" that match nothing fall back to every option.

### 0.1.0

- Scaffold (#51) and the pure logic (#53).
