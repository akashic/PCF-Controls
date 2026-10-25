# RagChoice

A form field control for a **single-select choice** column. It is a normal Fluent 9 dropdown that also shows each option's configured colour as a small dot before the label (or as a bar on the dropdown's left edge). It was built for RAG (Red / Amber / Green) status columns, but works with any choice column whose options have colours.

| | |
|---|---|
| Logical name | `wb_Controls.RagChoice` |
| Display name in the form designer | **RAG Choice (colour)** |
| Solution | `WBRagChoice` (display name "WB RAG Choice") |
| Binds to | Choice (`OptionSet`) columns only |
| Configuration | Option colours on the choice, plus two control properties ([configuration guide](docs/configuration.md)) |
| Version | 0.1.3 |
| Spec | [brief §6](../../docs/briefs/2026-10-21-grid-formatting-and-rag-choice.md#6-control-b--ragchoice-form-field) |
| Dev test results | [docs/decisions.md](docs/decisions.md) (issue #7) |
| Architecture | [Diagram](docs/architecture.html) (open in a browser; source `docs/architecture.archify.json`) |

## What it does

- **Look:** a Fluent "filled-darker" dropdown, the same fill, border and height as the form's other fields.
- **Closed:** the selected option's colour dot, then its label. With no value it shows `--Select--` and no dot.
- **Open:** every option in metadata order, each with its own dot. A blank `--Select--` option at the top clears the value, unless the column is required (business or system required).
- **Hidden options** (the option's **Hidden** property) are left out of the list, as in the platform's dropdown. If the current value is a hidden option, it still shows, and the list shows it greyed out and ticked so it can't be picked again.
- **Colours** come only from each option's `Color` in the choice metadata. If an option has no colour or an invalid one, the control uses **Fallback colour**. If that is blank too, the option has no indicator. It never guesses a colour from the label text.
- **Read-only** (read-only form, inactive record, business-rule lock, or field security without update): a read-only text box with the same dot and label, like the platform's read-only choice. It stays focusable so screen readers can read it. It shows `---` when empty.
- **Field security without read:** shows `***` and no dot.
- **External changes** (business rules, JavaScript `setValue`, a refresh) update the dropdown on the next render. Only a user's own selection writes the value back.
- **Accessible name:** the form label (`context.mode.label`), or the column's display name if there's no label. The form doesn't associate its label with a custom control by itself.
- **Required** (business or system required): the dropdown has `aria-required="true"`, so screen readers announce it as required.
- The dot and bar are decoration (`aria-hidden="true"`). The label text is always visible, so colour is never the only signal. In Windows high contrast (forced colours) they keep their colours (`forced-color-adjust: none`). Keyboard behaviour is the standard Fluent `Dropdown`.
- It never throws into the form. If rendering fails, it shows the value as plain text and logs a console warning, then tries the dropdown again when the value, options, lock or required level change. An invalid **Fallback colour** logs one console warning and is ignored.

The control makes no network calls and declares no external services, so it isn't premium-licensed.

## Manifest properties

| Property | Type | Usage | Default | Description |
|---|---|---|---|---|
| `value` | `OptionSet` | bound, required | — | The choice column. |
| `indicator` | Enum: `dot` \| `bar` | input | `dot` | **Dot**: a 10px circle with a 1px neutral border before the label. **Left bar**: a 4px bar on the dropdown's left edge (and a small bar beside each option in the list). |
| `fallbackColor` | `SingleLine.Text` | input | blank | Hex colour (`#RGB`, `#RRGGBB` or `RRGGBB`) for options with no colour. Blank means no indicator for those options. |

React 16.14.0 and Fluent 9 are platform libraries, so they aren't in the bundle. The manifest declares Fluent **9.46.2**, the top of the declared range recorded in the brief. Issue #3 is confirming the correct declared version and may change it.

There are no environment variables.

## Add it to a form field

Adding the control to a form is a customisation of that table's form, so it belongs to the **project** solution that owns the table, not to `WBRagChoice`. Import `WBRagChoice` into the environment first.

1. Give each option of the choice column a colour (the colour picker beside each option's label), then publish.
2. Open the form in the **modern form designer**, inside the project solution.
3. Select the choice field → **Components** → **+ Component** → **RAG Choice (colour)**.
4. Optionally set **Indicator style** and **Fallback colour**.
5. Choose where it shows: **Web** (and optionally **Mobile** and **Tablet**; the phone app isn't tested yet).
6. **Save and publish** the form, then hard-reload a record.

The **[configuration guide](docs/configuration.md)** has the full steps (including the classic designer), what users see in each state, business rules and scripts, moving to UAT and prod, accessibility and troubleshooting.

## Develop and test

From the repo root:

```sh
npm run lint -w @wb-pcf/rag-choice
npm test -w @wb-pcf/rag-choice           # Jest: the pure logic in RagChoice/logic.ts, 100% coverage required
npm run build -w @wb-pcf/rag-choice
npm run start:watch -w @wb-pcf/rag-choice # PCF test harness at http://localhost:8181
dotnet build controls/RagChoice/solution -c Release   # WBRagChoice.zip + WBRagChoice_managed.zip
```

All the decisions (colour resolution, option list, blank option, read and edit state, display text, re-syncing from the bound value, error recovery, outputs) are pure functions in `RagChoice/logic.ts`, tested in `tests/logic.test.ts`. `index.ts` wires the PCF context to them and `RagChoiceView.tsx` renders the result. `tests/view.test.tsx` is a server-render smoke test of the view (`aria-required`, forced colours, the error boundary), outside the coverage gate.

### Harness checks (brief §8.2)

The harness (`pcf-start` 1.x) mocks every choice column as **Option A / B / C** (values 0, 1, 2) **with no colours**, not required, and it loads its own Fluent 9.4.0 build rather than the declared version. So:

| Fixture case | How to check it in the harness | Expected |
|---|---|---|
| Null value | Start the harness. Clear the **value** input if it has one. | `--Select--`, no dot. The list shows the blank option first, then A, B, C. |
| Options without a colour | Open the list. | Every option has no dot (the mock has no colours). |
| Fallback colour | Set **fallbackColor** to `#107C10`. | Every option and the selected value show a green dot. |
| Invalid fallback colour | Set **fallbackColor** to `red`. | No dots, and one `RagChoice: fallbackColor "red" isn't a hex colour` warning in the console. |
| Selecting a value | Pick **Option B**. | The closed dropdown shows the dot (if a fallback is set) and "Option B". The **value** output in the harness panel shows `1`. |
| Clearing | Pick the blank option. | `--Select--`, and the output is cleared. |
| External change | Type `2` into the **value** input. | The dropdown shows "Option C" without the harness logging an output change. |
| Left bar | Set **indicator** to `bar` with a fallback colour and a value. | A 4px bar on the dropdown's left edge, and no dot before the label. |
| Disabled mode | The harness has no disabled toggle we could find. | Covered by Jest (`resolveFieldState`). Check it in dev with a business-rule lock or an inactive record. |
| Three coloured options plus one without | Not possible with the harness mock. | Covered by the Jest fixture (`RAG_OPTIONS` in `tests/logic.test.ts`). Check it in dev on a real RAG column (brief §8.3). |

Per-option colours, read-only mode, field security (`***`), dark mode and screen-reader naming can only be seen properly in the dev environment (brief §8.3).

## Limitations

- **English only, left to right.** The control is always used in an English context, so `--Select--`, `---` and `***` are hard-coded rather than localised, and it sets no `dir`. Neither is a bug.
- **Single-select choice only.** Multi-select choices, Yes/No and Status Reason aren't supported in v1 (brief §2).
- **Hidden options rely on an undocumented property.** The form host sends `IsHidden` on each option, but it isn't in the PCF typings or on Microsoft Learn. If the platform stops sending it, hidden options show in the list again.
- **Not yet checked by a human (issue #7):** what a screen reader announces, the phone app, field security for a user without read access, and a real business-rule lock. See [docs/decisions.md](docs/decisions.md#left-for-a-human).
- A stored value that isn't in the option list shows as its number with no indicator.
- Option colours don't adapt to dark mode. The dot's neutral border keeps pale colours visible on light and dark backgrounds.

## Changelog

### 0.1.3 (unreleased)

- Error recovery: after a rendering failure, the plain-text fallback switches back to the dropdown when the data it renders changes, instead of staying text for the life of the form.
- A required column sets `aria-required="true"` on the dropdown.
- Windows high contrast: the dot and bar keep their colours (`forced-color-adjust: none`).
- Documented that the control is English-only and left to right.

### 0.1.2 (unreleased)

- Read-only: a wider gap after the dot, and `---` is a placeholder rather than the value.

### 0.1.1 (unreleased)

- Fixed: the solution failed to import because the manifest's description contained an apostrophe.
- Hidden options are left out of the list, as in the platform's dropdown.
- The accessible name is the form label, falling back to the column display name.
- Read-only shows a read-only text box like the platform's, not a disabled dropdown.
- Matches the form's "filled-darker" field look.

### 0.1.0 (unreleased)

- First version: Fluent 9 dropdown with a colour dot or left bar per option, `--Select--` placeholder, blank option unless required, read-only and field-security states, fallback colour, and re-sync from the bound value.
