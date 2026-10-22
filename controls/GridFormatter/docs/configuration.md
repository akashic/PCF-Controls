# GridFormatter configuration guide

This guide is for **config authors**: Power Platform makers who decide how a table's grids should look. You write a small JSON file of rules, deploy it as a web resource, and the grid formats its rows and cells. No code and no rebuild of the control.

Before you start, the table's grid must already use the control (see the [control README](../README.md#set-up-a-table)).

Contents: [Where config lives](#where-config-lives) · [A rule](#a-rule) · [Conditions](#conditions) · [Styles](#styles) · [What works on which column](#what-works-on-which-column) · [Colours](#colours) · [Scope and pills](#scope-and-pills) · [Precedence](#precedence) · [The view rule](#the-view-rule) · [Accessibility](#accessibility) · [Recipes](#recipes) · [Troubleshooting](#troubleshooting) · [Limitations](#limitations)

## Where config lives

Each table has **one** JSON file of rules, deployed as a web resource named:

```text
wb_/GridFormatter/<table logical name>.json
```

For example `wb_/GridFormatter/account.json` or `wb_/GridFormatter/wb_engagement.json`. The file name is what ties the rules to the table. They apply to every grid of that table that uses the control: every view of the main grid, and subgrids (see [Limitations](#limitations)).

A file looks like this:

```json
{
  "$schema": "../grid-format.schema.json",
  "version": 1,
  "defaults": { "tintAlpha": 0.18, "fallbackColor": null },
  "rules": [
    {
      "id": "rag-row",
      "description": "Tint the row by RAG status",
      "when": { "column": "wb_ragstatus", "op": "isNotNull" },
      "scope": "row",
      "style": { "backgroundColor": { "fromOption": "wb_ragstatus", "alpha": "tint" } }
    }
  ]
}
```

`version` must be `1`. `defaults` is optional. `rules` is required (it can be empty).

### Deploy it

1. In [make.powerapps.com](https://make.powerapps.com), open the **project solution that owns the table** (not `WBGridFormatter`).
2. **New → More → Web resource.**
   - **Name:** `wb_/GridFormatter/<table>.json`. The form adds the publisher prefix for you, so type `/GridFormatter/<table>.json` after the `wb_`. The prefix must be `wb_`: if your project solution uses a different publisher, create the web resource from a solution that uses the **William Buck** publisher, then add it to your project solution with **Add existing → More → Web resource**.
   - **Type:** Script (JScript). Dataverse has no JSON type, and the control doesn't check the type.
   - **File:** upload your `.json` file. Save it as UTF-8.
3. **Save, then Publish.** The control reads the *published* version, so an unpublished file looks missing (or keeps the old rules).
4. **Reload the app page** (F5, or Ctrl+Shift+R). The control loads each table's rules once per browser tab, so moving between views or records in the app doesn't pick up a new file.

To change the rules later, edit the web resource (upload the new file), save, publish and reload. Rules travel with the project solution from dev to UAT to prod, so they're the same in every environment.

### Write it in VS Code

Put `"$schema"` at the top of your file, pointing at `controls/GridFormatter/config/grid-format.schema.json` in your copy of this repo (a relative path from your file, or a copy of the schema kept next to it). VS Code then autocompletes property names, operators and Fluent token names, shows each property's description on hover, and underlines mistakes. The control ignores `$schema`, so it's fine to deploy the file with it.

To check a file from the command line, copy it into `controls/GridFormatter/config/` in a checkout of this repo and run, from the repo root:

```sh
npm run validate:config
```

It checks every file in that folder against the schema, and also catches duplicate rule ids, which VS Code doesn't. Don't commit your copy.

Every example in this guide is a file in [`config/examples/`](../config/examples/), and CI checks them all.

## A rule

A rule is **when** (a condition) + **what** (a style) + **where** (a scope) + **how it combines** (priority and stop).

```json
{
  "id": "overdue",
  "description": "Overdue due date in bold red, unless RAG is Green",
  "priority": 30,
  "when": {
    "all": [
      { "column": "wb_duedate", "op": "beforeToday" },
      { "not": { "column": "wb_ragstatus", "op": "eq", "value": 948790002 } }
    ]
  },
  "scope": { "columns": ["wb_duedate"] },
  "style": { "color": { "token": "colorPaletteRedForeground1" }, "fontWeight": "bold" }
}
```

| Property | Required | What it does |
|---|---|---|
| `id` | Yes | Unique in the file. Letters, digits, `_`, `.` and `-`, starting with a letter or digit, up to 64 characters. Console messages name rules by id. |
| `description` | No | Plain words for the next author. Never shown to users. |
| `priority` | No | A whole number (negative is fine). **Lower runs first** and wins. Default `0`. Rules with the same priority run in file order. See [Precedence](#precedence). |
| `when` | No | The [condition](#conditions). Leave it out to apply the rule to **every row**. |
| `scope` | Sometimes | `"row"` or `{ "columns": [...] }`. If `when` is a single leaf (one `column`/`op`/`value`), you can leave `scope` out and it defaults to that leaf's column. Otherwise it's required. See [Scope and pills](#scope-and-pills). |
| `display` | No | `"style"` (default) or `"pill"`. See [Pills](#pills). |
| `style` | Yes, unless `stop` is `true` | The [style properties](#styles). |
| `stop` | No | `true` means: when this rule matches a row, no later rule is looked at for that row. Default `false`. A rule with `stop: true` and no `style` stops formatting without styling anything. |

### Defaults

| Property | Default | What it does |
|---|---|---|
| `tintAlpha` | `0.18` | The opacity (above 0, up to 1) of every background that doesn't give its own alpha. See [Colours](#colours). |
| `fallbackColor` | `null` | The colour to use when a `fromOption` colour finds none (the option has no colour). `null` means the rule doesn't set that property, so a later rule can. Any colour form except `fromOption`. |

## Conditions

A condition is a **leaf** or a **group**.

A leaf compares one column of the row with a value:

```json
{ "column": "statecode", "op": "eq", "value": 1 }
```

`column` is the column's **logical name** (lower case, for example `wb_duedate`), as shown in the maker portal under the column's **Advanced options**. It is not the display name.

Groups combine conditions:

| Group | True when |
|---|---|
| `{ "all": [ ... ] }` | Every condition in the list is true |
| `{ "any": [ ... ] }` | At least one is true |
| `{ "not": <condition> }` | The condition is false |

Groups nest up to **5 levels**: `when` is level 1, and each group adds a level, so the deepest level can only hold leaves. Lists can't be empty.

```json
{
  "all": [
    { "any": [
      { "column": "wb_ragstatus", "op": "eq", "value": 948790000 },
      { "column": "wb_ragstatus", "op": "eq", "value": 948790001 }
    ] },
    { "column": "wb_duedate", "op": "withinNextDays", "value": 7 },
    { "not": { "column": "wb_flagged", "op": "eq", "value": true } }
  ]
}
```

### Operators

Every example below is a rule in [`config/examples/operators.json`](../config/examples/operators.json). "Dates" means both date-only and date-and-time columns.

| Operator | Column types | Value | Example |
|---|---|---|---|
| `eq` | Any single value: choice, status, status reason, Yes/No, numbers, currency, text, lookup, Owner, dates | One value, or `{ "column": ... }` | `{ "column": "statecode", "op": "eq", "value": 1 }` |
| `ne` | Same as `eq` | One value, or `{ "column": ... }` | `{ "column": "wb_ragstatus", "op": "ne", "value": 948790002 }` |
| `in` | Same as `eq` | A list of values | `{ "column": "statuscode", "op": "in", "value": [1, 2] }` |
| `notIn` | Same as `eq` | A list of values | `{ "column": "wb_ragstatus", "op": "notIn", "value": [948790001, 948790002] }` |
| `gt` | Numbers, currency, dates | A number, an ISO date, or `{ "column": ... }` | `{ "column": "wb_count", "op": "gt", "value": 10 }` |
| `gte` | Numbers, currency, dates | Same as `gt` | `{ "column": "wb_duedate", "op": "gte", "value": "2026-12-31" }` |
| `lt` | Numbers, currency, dates | Same as `gt` | `{ "column": "wb_score", "op": "lt", "value": 2.5 }` |
| `lte` | Numbers, currency, dates | Same as `gt` | `{ "column": "wb_actualcost", "op": "lte", "value": { "column": "wb_budget" } }` |
| `between` | Numbers, currency, dates | `[min, max]`, both numbers or both ISO dates. **Inclusive** at both ends | `{ "column": "wb_score", "op": "between", "value": [1, 3] }`<br>`{ "column": "wb_duedate", "op": "between", "value": ["2026-10-01", "2026-12-31"] }` |
| `isNull` | Any | None | `{ "column": "wb_parentid", "op": "isNull" }` |
| `isNotNull` | Any | None | `{ "column": "wb_ragstatus", "op": "isNotNull" }` |
| `contains` | Text | Text (not empty) | `{ "column": "wb_notes", "op": "contains", "value": "urgent" }` |
| `startsWith` | Text | Text (not empty) | `{ "column": "wb_name", "op": "startsWith", "value": "Draft" }` |
| `endsWith` | Text | Text (not empty) | `{ "column": "wb_name", "op": "endsWith", "value": "(copy)" }` |
| `beforeToday` | Dates | None | `{ "column": "wb_duedate", "op": "beforeToday" }` |
| `onOrAfterToday` | Dates | None | `{ "column": "wb_duedate", "op": "onOrAfterToday" }` |
| `olderThanDays` | Dates | Days (a whole number, 0 or more) | `{ "column": "wb_reviewedon", "op": "olderThanDays", "value": 30 }` |
| `withinNextDays` | Dates | Days (a whole number, 0 or more) | `{ "column": "wb_duedate", "op": "withinNextDays", "value": 7 }` |
| `containsAny` | Choices (multi-select) | A list of option values | `{ "column": "wb_tags", "op": "containsAny", "value": [948790000, 948790001] }` |
| `containsAll` | Choices (multi-select) | A list of option values | `{ "column": "wb_tags", "op": "containsAll", "value": [948790000, 948790001] }` |

A comparison that doesn't make sense, such as `gt` on a text column or `contains` on a number, is simply false. `eq`, `ne`, `in` and `notIn` don't work on multi-select columns: use `containsAny` or `containsAll`.

### Values

| Column type | Write the value as | Example |
|---|---|---|
| Choice, status (`statecode`), status reason (`statuscode`) | The option's **number**, never its label. Labels can be translated and renamed. Find the number on the column's choice in the maker portal. | `1`, `948790002` |
| Choices (multi-select) | A list of option numbers, with `containsAny` / `containsAll` | `[948790000, 948790001]` |
| Yes/No | `true` or `false` | `true` |
| Whole number, decimal, float, currency | A number. Currency is compared as a plain amount, with no currency conversion. | `2.5` |
| Text | Text. **Case doesn't matter**: `"on hold"` matches `On Hold`. | `"on hold"` |
| Lookup, Customer, Owner | The related record's **GUID** (from the `id=` in its URL). Case and `{ }` braces don't matter. Names aren't supported, since they change. | `"64a20861-7fdd-f011-8406-7ced8d70a9f0"` |
| Dates | An ISO date, or a date and time | `"2026-12-31"`, `"2026-12-31T17:00:00Z"` |
| Another column of the same row | `{ "column": "<logical name>" }`, with `eq`, `ne`, `gt`, `gte`, `lt`, `lte`. Both columns must be in the view. | `{ "column": "wb_budget" }` |

### Empty cells

An **empty cell only matches `isNull`**. Every other operator is false for it, including `ne` and `notIn`. That's how Dataverse filters work too. So `{ "column": "wb_ragstatus", "op": "ne", "value": 948790002 }` means "RAG is set and isn't Green".

To include empty cells, wrap `eq` in `not`:

```json
{ "not": { "column": "wb_ragstatus", "op": "eq", "value": 948790002 } }
```

That means "RAG isn't Green, including rows with no RAG". Empty text counts as empty.

A comparison with another column is false when that other column is empty.

File and image columns always read as empty, so don't use them in conditions.

### Dates and "today"

- **"Today" is the user's date**, in the time zone set in their Dataverse personal settings. A user in Sydney and a user in London can see different rows as overdue at the same moment.
- **Date-only columns are just dates.** `2026-10-18` is 18 October for everyone; no time-zone shift.
- **Date-and-time columns** are compared with a date (a date-only value, a date-only column, or "today") by first turning them into the user's local date. So `{ "column": "wb_reviewedon", "op": "eq", "value": "2026-10-22" }` matches any time on 22 October in the user's time zone.
- A value **with a time** (`"2026-12-31T17:00:00Z"`) compared with a date-and-time column compares the exact moment. A time without `Z` or an offset (`"2026-12-31T17:00"`) is the user's local time.
- `beforeToday`: the date is before today. `onOrAfterToday`: today or later.
- `olderThanDays n`: more than `n` days before today. On 22 October, `olderThanDays 30` matches 21 September and earlier, not 22 September. `olderThanDays 0` is the same as `beforeToday`.
- `withinNextDays n`: from today to `n` days ahead, both included. On 22 October, `withinNextDays 7` matches 22 to 29 October. Past dates never match. `withinNextDays 0` means today only.
- After midnight, "today" moves on as rows are next drawn (scroll, refresh or change view). The grid doesn't repaint by itself.

## Styles

`style` holds one or more of these five properties, and nothing else. Raw CSS and class names aren't allowed.

| Property | Values | Notes |
|---|---|---|
| `backgroundColor` | A [colour](#colours) | Always see-through, so hover and selection still show. For a pill, it's the pill's fill. |
| `color` | A [colour](#colours) | Text colour. Only on [some columns](#what-works-on-which-column). Ignored on pills. |
| `fontWeight` | `"normal"`, `"semibold"`, `"bold"` | 400, 600, 700. Only on [some columns](#what-works-on-which-column). |
| `fontStyle` | `"normal"`, `"italic"` | |
| `textDecoration` | `"none"`, `"underline"`, `"line-through"` | |

## What works on which column

The grid draws most cells its own way, and some of those ignore text colour and weight. Where a rule sets `color` or `fontWeight`, the control draws the cell's text itself, but it can only do that for plain values. It never redraws the primary name column, because that would remove the link that opens the record.

| Column type | `backgroundColor` | `fontStyle`, `textDecoration` | `color`, `fontWeight` | `display: "pill"` |
|---|---|---|---|---|
| Single line of text (Text format), except the primary name | ✅ | ✅ | ✅ | ✅ |
| Whole number, decimal, float, currency | ✅ | ✅ | ✅ | ✅ |
| Date only, date and time | ✅ | ✅ | ✅ | ✅ |
| Choice, status, status reason | ✅ | ✅ | ✅ | ✅ |
| Yes/No | ✅ | ✅ | ✅ | ✅ |
| **Primary name** (the column that opens the record) | ✅ | ✅ | ❌ | ❌ |
| Lookup, Customer | ✅ | ✅ | ❌ (keeps the link colour) | ❌ |
| Owner | ✅ | ❌ (no effect) | ❌ | ❌ |
| Choices (multi-select) | ✅ | ✅ | ❌ | ❌ |
| File, image | ✅ | ✅ | ❌ | ❌ |
| Anything else (email, phone, URL, ticker, text area, multiple lines of text, autonumber, duration, language, time zone) | ✅ | ✅ | ❌ | ❌ |

Where a ❌ property is set, the rule still applies everything else, and the console shows **one warning per rule and column**, for example:

```text
[GridFormatter] rule "inactive-grey": color can't be shown on column "ownerid" (Persona); ignored there.
```

That's expected for a row-scope text colour. It's not an error. Italic and underline were checked on text, choice, Yes/No, number, currency, date, primary name, lookup, multi-select and Owner columns; the other types weren't tested.

## Colours

A colour can be written four ways:

| Form | Example | Meaning |
|---|---|---|
| Hex | `"#C50F1F"` (or `"#C00"`) | A fixed colour. Doesn't change in dark mode. |
| Hex with alpha | `{ "hex": "#C50F1F", "alpha": 0.3 }` | A fixed colour at an opacity from 0 (invisible) to 1 (solid) |
| Theme token | `{ "token": "colorPaletteRedForeground1" }` | A [Fluent 9](https://react.fluentui.dev/?path=/docs/theme-colors--docs) theme colour. **Adapts to dark mode.** Only token names in the schema are allowed; VS Code lists them. |
| From the option | `{ "fromOption": "wb_ragstatus", "alpha": "tint" }` | The colour set on the row's selected option of that choice column in Dataverse. `alpha` is optional: `"tint"` (use `tintAlpha`) or a number from 0 to 1. |

Each form is a rule in [`config/examples/colour-forms.json`](../config/examples/colour-forms.json).

### Use theme tokens, so dark mode works

**Use a theme token for every text colour**, and preferably for backgrounds too. Users can switch the app to dark mode, and a hex colour stays the same there. A fixed red that reads well on white can be nearly invisible on the dark grid: `#C50F1F` text is 5.9:1 on white but about 2.4:1 on the dark grid, and under 2:1 on an amber-tinted dark row (measured in the test environment). The token `colorPaletteRedForeground1` changes with the theme: 5.85:1 on white, 5.2:1 on the dark grid.

The control's [contrast check](#accessibility) only looks at the light theme, so it won't warn you about a hex colour that fails in dark mode. Useful text tokens:

| Purpose | Token |
|---|---|
| Red (overdue, over budget) | `colorPaletteRedForeground1` |
| Green | `colorPaletteGreenForeground1` |
| Grey (inactive, secondary) | `colorNeutralForeground3` |
| Brand blue | `colorBrandForeground1` |

Option colours (`fromOption`) are hex colours set in Dataverse, so they don't adapt. Tints and pills are designed for that: tints are faint, and pills pick black or white text.

### Backgrounds are see-through

A solid background would hide the grid's hover and selection colours, so backgrounds are always drawn **translucent** unless you say otherwise:

| Written as | As a background | As text (`color`) | As a pill fill |
|---|---|---|---|
| `"#C50F1F"` | At `tintAlpha` (18% by default) | Solid | Solid |
| `{ "hex": ..., "alpha": 0.3 }` | At 30%, as written | At 30% | Solid |
| `{ "token": ... }` | At `tintAlpha` | Solid | Solid |
| `{ "fromOption": ... }` | At `tintAlpha` | Solid | Solid |
| `{ "fromOption": ..., "alpha": "tint" }` | At `tintAlpha` | At `tintAlpha` | Solid |
| `{ "fromOption": ..., "alpha": 0.3 }` | At 30% | At 30% | Solid |

What you see is the colour mixed with what's behind it: `alpha × colour + (1 − alpha) × background`. At 18% on white, `#C50F1F` red shows as a pale pink `#F5D4D7`.

- Keep background alphas low (about 0.1 to 0.3). An alpha of 1 makes the background solid and hides selection.
- A token can't take its own alpha. A token background always uses `tintAlpha`, which applies to the whole file. So pick a token that is dark enough to show at 18%: **light background tokens almost vanish**. `colorNeutralBackground3` (`#F5F5F5`) at 18% is `#FDFDFD` on white, and `colorNeutralBackground5` (`#EBEBEB`) is `#FBFBFB`: nobody can see either. `colorNeutralForeground3` (`#616161`) at 18% is `#E3E3E3`, a clear grey, which is why the [inactive grey](#inactive-grey) recipe uses it. Check dark mode too: there the light background tokens turn *dark* (`colorNeutralBackground3` is `#141414`), so they vanish against the dark grid as well, while `colorNeutralForeground3` turns light grey and still shows. Token names describe Fluent's intended use; here only the colour matters.

### Colours from the choice

`fromOption` reads the colour set on each option of the choice (or status reason) column in Dataverse. Set it in the maker portal on the column's choice settings. It needs:

- the column in the view (see [The view rule](#the-view-rule));
- the grid's **Enable OptionSet colors** setting left at **No**, so the grid doesn't colour the cell as well.

When the row's option has no colour (or the cell is empty, or the colour isn't a valid hex), the rule uses `defaults.fallbackColor`. If that's `null` (the default), the rule doesn't set the property for that row, and a later rule may. The fallback is used as written: a hex or token fallback used as a background is tinted at `tintAlpha`, whatever `alpha` the `fromOption` asked for. Use `{ "hex": ..., "alpha": ... }` as the fallback to control it.

`fromOption` on a multi-select column never finds a colour (a row can have several options), and neither does `fromOption` on a related table's column (`alias.column`).

Option colours don't change in dark mode (see [Use theme tokens](#use-theme-tokens-so-dark-mode-works)).

## Scope and pills

### Scope

| Scope | Styles |
|---|---|
| `"row"` | Every cell in the row |
| `{ "columns": ["wb_duedate", "wb_ragstatus"] }` | Only those columns' cells. Columns not in the view are skipped. |
| Left out | The column of the rule's leaf condition. Only allowed when `when` is a single leaf. |

### Pills

`"display": "pill"` draws the cell's value as a rounded pill: a **solid** fill in `backgroundColor` with black or white text, whichever contrasts more (always at least 4.5:1). `color` is ignored. The pill is semibold unless a rule sets `fontWeight`.

```json
{
  "id": "rag-pill",
  "description": "Show RAG status as a coloured pill",
  "when": { "column": "wb_ragstatus", "op": "isNotNull" },
  "scope": { "columns": ["wb_ragstatus"] },
  "display": "pill",
  "style": { "backgroundColor": { "fromOption": "wb_ragstatus" } }
}
```

- A pill needs **cell scope** (not `"row"`) and a `backgroundColor`.
- Pills only work on the columns with ✅ in the pill column [above](#what-works-on-which-column): never on the primary name, lookups, Owner or multi-select. Elsewhere the pill is dropped with a console warning.
- An empty cell has no pill.
- For a token fill, black or white is chosen for the token's light-theme colour.
- A pill's fill isn't the cell's background, so a row tint still shows around the pill. You can have both (see [Precedence](#precedence)).

## Precedence

For each row, the rules run like this:

1. **In ascending `priority`.** No priority means `0`. Rules with the same priority run in file order.
2. **The first rule to set a property for a cell wins.** A later rule can't change that property for that cell, but it can still set properties nobody has set yet. This is per cell and per property, whatever the scope: an earlier cell-scope rule beats a later row-scope rule, and an earlier row-scope rule beats a later cell-scope rule.
3. A `fromOption` colour that finds no colour (and no fallback) doesn't count as set, so a later rule can set it.
4. For pills, the first matching pill rule for a cell sets the pill.
5. **`stop: true`**: when that rule matches, nothing after it runs for that row. The stop rule's own style still applies.

### Worked examples

These use [`wb_gridspike.json`](../config/examples/wb_gridspike.json), the file deployed on the test table, on 22 October:

| Priority | Rule | When | Scope | Style |
|---|---|---|---|---|
| 10 | `inactive-grey` | Inactive | Row | Grey background, grey text, italic, **stop** |
| 15 | `over-budget` | Actual cost > budget | `wb_actualcost` | Red 12% background, red text, semibold |
| 20 | `rag-row` | RAG is set | Row | RAG option colour at 18% |
| 25 | `rag-pill` | RAG is set | `wb_ragstatus` | Pill in the RAG option colour |
| 30 | `overdue` | Due before today and RAG isn't Green | `wb_duedate` | Red text, bold |
| 40 | `flagged-name` | Flagged | `wb_name` | Underline |

**Row 1: active, Amber, due 18 October, actual cost 750, budget 1,000.**

| Rule | Matches? | Effect |
|---|---|---|
| `inactive-grey` | No | |
| `over-budget` | No | |
| `rag-row` | Yes | Every cell gets an amber background |
| `rag-pill` | Yes | `wb_ragstatus` becomes an amber pill with black text. The amber background still shows around it. |
| `overdue` | Yes | `wb_duedate` already has a background (amber), so that stays. Its text colour and weight aren't set yet, so it becomes **bold red**. |

**Row 2: active, Green, actual cost 2,250, budget 2,000.**

| Rule | Matches? | Effect |
|---|---|---|
| `over-budget` | Yes | `wb_actualcost` gets a red 12% background, red semibold text |
| `rag-row` | Yes | Every **other** cell gets a green background. `wb_actualcost` keeps red, because `over-budget` set it first. |
| `rag-pill` | Yes | Green pill with white text |
| `overdue` | No (RAG is Green) | |

If `over-budget` had priority 25 instead, `rag-row` would run first and win the background on `wb_actualcost`: that cell would be green with red semibold text.

**Row 3: inactive, Red, overdue.**

| Rule | Matches? | Effect |
|---|---|---|
| `inactive-grey` | Yes | Every cell gets a grey background and italic, and grey text where the column allows it. **`stop`**, so no RAG tint, no pill and no red date. |

**Same priority.** Two rules with no `priority` both run at priority 0, in file order. The first one in the file wins any property both set.

## The view rule

**A rule only applies on views that include every column it reads**: every column in its condition (including `{ "column": ... }` values) and every `fromOption` column. The grid only gives the control the columns in the view, so a rule that needs a missing column is skipped, silently.

Rules can't target a specific view; the control can't tell which view is showing. Use this rule instead:

- **To turn a rule on for a view**, include its columns in that view.
- **To turn it off for a view**, leave one of its columns out.

Watch out for these:

- The `overdue` recipe reads `wb_ragstatus` as well as `wb_duedate`. On a view without the RAG column, there's no red due date at all.
- A `stop` rule is skipped too. If a view has no `statecode` column, `inactive-grey` doesn't run there, so inactive rows get the RAG tint like any other row.
- Scope columns are different: a rule whose scope lists a column that isn't in the view still styles the other columns it lists.

## Accessibility

- **Colour must never be the only signal.** Whatever triggers a rule should also be visible as text. Keep the RAG column in views with a RAG tint (or use the pill, which keeps the label). For inactive grey, keep the Status column in the view, or add `"fontStyle": "italic"` as `wb_gridspike.json` does. An overdue date is already visible as a date.
- **Contrast.** When the control loads your file, it checks each rule's text `color` against that rule's own `backgroundColor` (or white, if the rule has no background), as it would look in the light theme. Below 4.5:1 it logs a warning, and keeps the rule:

  ```text
  [GridFormatter] wb_/GridFormatter/<table>.json: rule "r": text colour contrast is 4.41:1 against its background in the light theme, below 4.5:1.
  ```

  That example is `#C50F1F` text on its own 18% tint. Fix it with a darker text colour or a paler background.
- The check **doesn't** cover `fromOption` colours (they depend on the row), colours from two different rules (for example red overdue text on an amber row tint), or the **dark theme**. Check those by eye in both themes.
- **Use theme tokens for text colours** ([why](#use-theme-tokens-so-dark-mode-works)). A hex text colour that passes the check can still fail in dark mode.
- Pills always pick black or white text for at least 4.5:1, so they need no check.

## Recipes

Each recipe is a file in [`config/examples/`](../config/examples/) that passes `npm run validate:config` with no warnings. Change the column names and option values to your table's.

### Inactive grey

[`inactive-grey.json`](../config/examples/inactive-grey.json): grey out inactive records, and stop any other rule from styling them.

```json
{
  "$schema": "../grid-format.schema.json",
  "version": 1,
  "rules": [
    {
      "id": "inactive-grey",
      "description": "Inactive records are greyed out",
      "priority": 10,
      "when": { "column": "statecode", "op": "eq", "value": 1 },
      "scope": "row",
      "style": {
        "backgroundColor": { "token": "colorNeutralForeground3" },
        "color": { "token": "colorNeutralForeground3" }
      },
      "stop": true
    }
  ]
}
```

- Light theme: the background shows as `#E3E3E3` on white (the grey token at 18%), with `#616161` text at 4.83:1.
- Dark theme: the same token is `#ADADAD`, so on the dark grid (`#292929`) the row shows as a lighter grey `#414141`, with `#ADADAD` text at 4.55:1. These dark values are worked out from Fluent's dark theme, not yet measured in the browser (#15).
- Don't use `colorNeutralBackground3` here: it's invisible at 18% in both themes ([why](#backgrounds-are-see-through)).
- `statecode` 1 is Inactive on custom tables. Some system tables use other values (for example opportunity's Won and Lost); check yours.
- Needs `statecode` in the view. Without it, the rule doesn't run (see [The view rule](#the-view-rule)).
- The grey text can't show on the primary name, lookups, Owner or multi-select columns, so expect one console warning for each of those columns in the view. Add `"fontStyle": "italic"` for a signal that isn't colour.

### RAG row tint

[`rag-row.json`](../config/examples/rag-row.json): tint each row in its RAG option's colour.

```json
{
  "$schema": "../grid-format.schema.json",
  "version": 1,
  "defaults": { "tintAlpha": 0.18, "fallbackColor": null },
  "rules": [
    {
      "id": "rag-row",
      "description": "Tint the row by RAG status",
      "priority": 20,
      "when": { "column": "wb_ragstatus", "op": "isNotNull" },
      "scope": "row",
      "style": {
        "backgroundColor": { "fromOption": "wb_ragstatus", "alpha": "tint" }
      }
    }
  ]
}
```

- Give each option a colour on the choice in Dataverse. Options with no colour (like an "Unknown" option) aren't tinted, because `fallbackColor` is `null`.
- Keep the RAG column in the view: it's needed for the rule to run, and it's the text signal.

### RAG pill

[`rag-cell.json`](../config/examples/rag-cell.json): show the RAG cell as a solid pill in the option colour.

```json
{
  "$schema": "../grid-format.schema.json",
  "version": 1,
  "rules": [
    {
      "id": "rag-pill",
      "description": "Show RAG status as a coloured pill",
      "when": { "column": "wb_ragstatus", "op": "isNotNull" },
      "scope": { "columns": ["wb_ragstatus"] },
      "display": "pill",
      "style": { "backgroundColor": { "fromOption": "wb_ragstatus" } }
    }
  ]
}
```

Use it with the row tint, or on its own. Put both rules in one file to get both, as `wb_gridspike.json` does.

### Overdue in bold red

[`overdue-bold-red.json`](../config/examples/overdue-bold-red.json): a due date before today in bold red, unless RAG is Green.

```json
{
  "$schema": "../grid-format.schema.json",
  "version": 1,
  "rules": [
    {
      "id": "overdue",
      "description": "Overdue due date in bold red, unless RAG is Green",
      "priority": 30,
      "when": {
        "all": [
          { "column": "wb_duedate", "op": "beforeToday" },
          { "not": { "column": "wb_ragstatus", "op": "eq", "value": 948790002 } }
        ]
      },
      "scope": { "columns": ["wb_duedate"] },
      "style": { "color": { "token": "colorPaletteRedForeground1" }, "fontWeight": "bold" }
    }
  ]
}
```

- `948790002` is Green on the test table. Use your Green option's value.
- The `not … eq` form also catches rows with no RAG. With `ne`, those rows wouldn't match ([Empty cells](#empty-cells)).
- Needs both `wb_duedate` and `wb_ragstatus` in the view. To make it independent of RAG, use just `{ "column": "wb_duedate", "op": "beforeToday" }`.
- The text colour is a theme token, so it stays readable in dark mode. A fixed hex red such as `#C50F1F` was nearly unreadable there in testing.
- Contrast of `colorPaletteRedForeground1`: 5.85:1 on white and 5.26:1 on an amber tint in the light theme; 5.2:1 on the dark grid, but only about 3.5:1 on an amber-tinted dark row. Overdue rows are often amber or red, so if dark mode matters to your users, consider leaving out the row tint on that table or check the result by eye.

### Over budget

[`over-budget.json`](../config/examples/over-budget.json): actual cost above budget, compared column to column.

```json
{
  "$schema": "../grid-format.schema.json",
  "version": 1,
  "rules": [
    {
      "id": "over-budget",
      "description": "Actual cost above budget in red (column-to-column comparison)",
      "when": {
        "all": [
          { "column": "wb_budget", "op": "isNotNull" },
          { "column": "wb_actualcost", "op": "gt", "value": { "column": "wb_budget" } }
        ]
      },
      "scope": { "columns": ["wb_actualcost"] },
      "style": {
        "backgroundColor": { "hex": "#C50F1F", "alpha": 0.12 },
        "color": { "token": "colorPaletteRedForeground1" },
        "fontWeight": "semibold"
      }
    }
  ]
}
```

- Both currency columns must be in the view.
- The `isNotNull` check makes the intent explicit. The comparison alone is already false when the budget is empty.
- To make its background win over a RAG row tint, give it a lower priority than the tint (as `wb_gridspike.json` does with 15).

### All together

[`combined.json`](../config/examples/combined.json) has inactive grey, RAG row tint and overdue in one file, and [`wb_gridspike.json`](../config/examples/wb_gridspike.json) adds over budget, the pill and an underlined name. The [worked examples](#worked-examples) walk through it.

## Troubleshooting

Open the browser's developer tools (F12) → **Console**, and filter on `GridFormatter`. Every message starts with `[GridFormatter]`, and each one shows once per page load.

### Turn on the debug log

In the console of the app's tab, run:

```js
sessionStorage.setItem("wb_GridFormatDebug", "1")
```

Reload the page. For each row, the console then shows which rules matched, in the order they ran:

```text
[GridFormatter] [debug] row 4c2ddcfb-c2cd-f111-a05b-70a8a59b69e5: matched rag-row, rag-pill, overdue
```

The row id is the record's GUID. A rule that isn't listed either didn't match, or was skipped because a column it reads isn't in the view. Turn the log off with `sessionStorage.removeItem("wb_GridFormatDebug")` and reload. It only lasts for that browser tab anyway.

### Messages

In the messages below, `<file>` is the web resource name, for example `wb_/GridFormatter/account.json`.

| Message | What it means | What to do |
|---|---|---|
| `no config web resource <file>; the grid is shown without formatting.` (info) | No published web resource has that name. | Check the name exactly (prefix `wb_`, the table's logical name, `.json`), and publish it. |
| `config <file> couldn't be loaded (…); the grid is shown without formatting.` | The request for the web resource failed, for example a network or permissions problem. | Reload. If it persists, check the user can read web resources. |
| `config <file> ignored: the web resource is empty.` | The web resource has no content. | Upload the file and publish. |
| `config <file> ignored: its content isn't UTF-8 text.` | The file was saved in another encoding. | Save it as UTF-8 and upload it again. |
| `<file>: config ignored: it isn't valid JSON (…)` | A JSON syntax error: often a missing comma, quote or bracket, or a trailing comma. | Open it in VS Code, which underlines the error. |
| `<file>: config ignored: it isn't a JSON object.` | The file isn't `{ ... }` at the top level. | Start from an example file. |
| `<file>: config ignored: version … isn't supported (expected 1).` | `version` is missing or isn't `1`. | Set `"version": 1`. |
| `<file>: config ignored: rules must be an array.` | `rules` is missing or isn't a list. | Add `"rules": [ ... ]`. |
| `<file>: config has an unknown property "…"; ignored.` | A top-level property that isn't `$schema`, `version`, `defaults` or `rules`, often a typo. | Fix or remove it. The rest works. |
| `<file>: rule "…" skipped: … .` | That rule is invalid. The message says where (for example `/rules/2/when/op "equals" isn't a known operator`). | Fix that rule. The others still work. |
| `<file>: rule "…" skipped: /rules/3/id is a duplicate.` | Two rules have the same `id`. The second is skipped. | Give each rule its own id. |
| `<file>: config: /defaults/tintAlpha must be a number above 0 and up to 1; using the default.` | `tintAlpha` is 0, negative, above 1 or not a number. | Use a number such as `0.18`. |
| `<file>: config: … ; no fallback colour is used.` | `fallbackColor` isn't a valid colour (note `fromOption` isn't allowed there). | Fix it, or use `null`. |
| `<file>: config: /defaults has an unknown property "…"; ignored.` or `/defaults must be an object; ignored.` | A typo in `defaults`. | Fix it. |
| `<file>: rule "…": text colour contrast is …:1 against its background in the light theme, below 4.5:1.` | The rule's text colour is hard to read on its background. The rule still applies. | Use a darker text colour or a paler background ([Accessibility](#accessibility)). |
| `rule "…": color, fontWeight can't be shown on column "…" (…); ignored there.` (also `display: pill`) | The rule sets something that column type can't show ([table](#what-works-on-which-column)). Everything else in the rule still applies. | Expected for row-scope text colours. To silence it, list only supported columns in `scope`. |
| `option colours for <table>.<column> couldn't be read; fromOption colours on it use defaults.fallbackColor.` | The control couldn't read that choice column's option colours. | Check `fromOption` names a choice, status or status reason column of this table. |
| `config took longer than 3 s to load; the grid is shown without formatting.` | Loading the rules and option colours took over 3 seconds, so the grid was shown plain rather than late. | Reload. If it keeps happening, the environment is slow; report it. |
| `no config loaded: the grid's table name … isn't a table logical name.` | The control couldn't tell which table the grid shows. | Report it, with where the grid is (main grid or subgrid). |
| `a cell couldn't be formatted, so it's drawn as normal (…)` or `a cell renderer failed …` | An unexpected error. The cell is drawn as normal. | Report it with the message and your file. |

### Common causes

| Symptom | Usual cause |
|---|---|
| No formatting, and no `[GridFormatter]` messages at all | The grid doesn't use the control. Check the grid's **Customizer control** is `wb_Controls.GridFormatter` ([README](../README.md#set-up-a-table)). |
| No formatting, and the `no config web resource` info line | Wrong file name (table logical name, `wb_` prefix, `.json`), or not published. |
| The old rules still show | Not published, or the page wasn't reloaded. |
| A rule works on one view but not another | A column it reads isn't in that view ([The view rule](#the-view-rule)). Use the debug log to see which rules matched. |
| Some RAG rows aren't tinted | Those options have no colour in Dataverse, and `fallbackColor` is `null`. |
| RAG cells are coloured twice | The grid's **Enable OptionSet colors** is Yes. Set it to No. |
| Text colour or bold doesn't show | The column type can't show it ([table](#what-works-on-which-column)); there's a console warning. |
| Nothing at all after an edit | Invalid JSON: look for `isn't valid JSON` in the console. |
| An empty cell isn't matched by `ne` or `notIn` | Empty cells only match `isNull` ([Empty cells](#empty-cells)). |
| The background barely shows | The colour is too light for an 18% tint ([Colours](#backgrounds-are-see-through)). |

## Limitations

- **No per-view rules.** Rules apply to every grid of the table. Use [the view rule](#the-view-rule) to opt views in or out.
- **Text colour and weight** only work on the column types in [the table](#what-works-on-which-column): never the primary name, lookups, Owner or multi-select.
- **Token backgrounds and their alpha need a current browser** (they use the CSS `color-mix()` function: Edge and Chrome 111+, Safari 16.2+, Firefox 113+). In an older browser, token backgrounds don't show.
- **A token's strength can't be set per rule.** Token backgrounds always use the file's `tintAlpha`.
- **Not yet verified in a real environment** (issue #15): subgrids on forms (the control may see the form's table rather than the subgrid's), the backup way of reading option colours, the full dark-mode pass, mobile, editable grids and large views. Columns from related tables (`alias.column`) are allowed but untested.
- **No dark-theme contrast check.** The check only uses the light theme.
- **Editing.** Only the display is styled. A cell being edited uses the grid's normal editor.
- **Why a web resource, not an environment variable:** a Dataverse environment variable holds at most 2,000 characters, about 8 to 12 rules, so each table's rules are a web resource instead ([ADR-0004](../../../docs/adr/0004-gridformatter-config-per-table-web-resource.md)). The same rules apply in every environment.
