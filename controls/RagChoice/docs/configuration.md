# RagChoice configuration guide

This guide is for **makers**: the people who put RagChoice on a form and look after the choice column it shows. There's nothing to write and no code: you give each option a colour, add the control to the field on the form, and publish.

Contents: [Before you start](#before-you-start) · [Colour the options](#colour-the-options) · [Add it to a form](#add-it-to-a-form) · [Properties](#properties) · [What users see](#what-users-see) · [Business rules, scripts and security](#business-rules-scripts-and-security) · [Moving to UAT and prod](#moving-to-uat-and-prod) · [Remove it](#remove-it) · [Accessibility](#accessibility) · [Troubleshooting](#troubleshooting) · [Limitations](#limitations)

## Before you start

- **The `WBRagChoice` solution must be in the environment.** In dev that's the unmanaged solution; in UAT and prod it's the managed solution from a GitHub Release ([deployment](../../../README.md#deployment)). Import it before any project solution that uses it.
- **The column must be a single-select choice** (Choice, also called option set). Multi-select choices, Yes/No, Status and Status Reason aren't supported.
- **Make the change in the project solution that owns the table**, not in `WBRagChoice`. Adding a control to a form is a customisation of that table's form, so it travels with the project.

## Colour the options

RagChoice takes every colour from the choice itself. It never guesses a colour from the label ("Red" with no colour gets no dot).

1. In [make.powerapps.com](https://make.powerapps.com), open the **project solution** and find the choice:
   - a **local** choice is edited on its column: **Tables** → the table → **Columns** → the column;
   - a **global** choice (one shared by several columns) is edited under **Choices** in the solution. Its colours apply to every column that uses it.
2. Select the **colour picker to the left of each option's label** and pick or type a colour. Microsoft describes this colour as being for charts; RagChoice and GridFormatter use it too.
3. **Save**, then **Publish** the table (or the choice).

Leave an option uncoloured if it shouldn't have a dot, for example "Unknown" or "Not assessed". Use [Fallback colour](#properties) if you'd rather give every uncoloured option the same colour.

For RAG columns, the test environment uses these colours, which are visible in light and dark mode:

| Option | Colour |
|---|---|
| Red | `#D13438` |
| Amber | `#FFB900` |
| Green | `#107C10` |

Using the same values in every project keeps RAG consistent across apps and with GridFormatter's pills and tints.

### Hidden options

To retire an option without deleting it (so old records keep their value), open the option's **⋮** → **Additional properties** and tick **Hidden**. RagChoice leaves it out of the list, as the platform's dropdown does. A record whose value *is* the hidden option still shows it, with its colour, and the list shows it greyed out and ticked so it can't be picked again.

Hidden isn't security: a hidden option can still be set by a script, an import or the Web API. Microsoft's [choice hidden property limitations](https://learn.microsoft.com/power-apps/maker/data-platform/custom-picklists#choice-hidden-property-limitations) apply, and RagChoice relies on a property the platform doesn't document ([Limitations](#limitations)).

## Add it to a form

Add the control on each form that should show it. Each form is set up separately, and only main forms have been tested.

### Modern form designer

1. Open the **project solution** → the table → **Forms** → the form.
2. Select the choice field on the form. Add the column to the form first if it isn't there.
3. In the properties pane on the right, under **Components**, select **+ Component**.
4. Choose **RAG Choice (colour)**. If it isn't in the list, see [Troubleshooting](#troubleshooting).
5. Set the [properties](#properties): **Indicator style**, and optionally **Fallback colour**. Leave **Value** bound to the column.
6. Under **Show component on**, choose where it's used. **Web**, **Mobile** and **Tablet** are ticked by default. The phone app hasn't been tested yet (issue #7), so check it there before relying on it, or clear **Mobile**.
7. Select **Done**, then **Save and publish** the form.
8. Open a record and **hard-reload** (Ctrl+Shift+R, or Cmd+Shift+R on a Mac). The app caches forms, so a plain reload can still show the platform's dropdown.

### Classic form designer

1. Open the form in the classic designer and double-click the choice field.
2. On the **Controls** tab, select **Add Control…**, choose **RAG Choice (colour)** and select **Add**.
3. Select the **Web** option on the RAG Choice row (and **Phone** and **Tablet** if wanted, with the caveat in step 6 above).
4. Select each property's pencil icon to set **Indicator style** and **Fallback colour**.
5. **OK**, then **Save** and **Publish** the form.

The form's own label is kept. Don't untick **Display label on the form**: the control doesn't draw its own label, and the form label is also its accessible name ([Accessibility](#accessibility)).

## Properties

| Property in the designer | Values | Default | What it does |
|---|---|---|---|
| **Value** | the choice column | the field you selected | The column the control reads and saves. It must stay bound to the field. |
| **Indicator style** | **Dot** or **Left bar** | Dot | **Dot:** a small circle before the label, in the closed field and in the list. **Left bar:** a 4px coloured bar on the field's left edge, and a short bar beside each option in the list. Dot is the easier one to read; use the bar where a field has very short labels or you want a stronger edge. |
| **Fallback colour** | a hex colour: `#RGB`, `#RRGGBB` or `RRGGBB`, for example `#8A8886` | blank | Used for options **without** a colour of their own. Blank means those options get no dot or bar. Options with their own colour always keep it. |

Type the fallback as a static value. Anything that isn't a hex colour (a colour name such as `grey`, or `rgb(…)`) is ignored, as if blank, and the control writes one warning to the browser console.

## What users see

| Situation | What the field shows |
|---|---|
| A value is chosen | The option's dot (or bar) and its label. |
| No value | `--Select--` and no dot. |
| The list is open | Every option that isn't hidden, in the choice's order, each with its own dot. A blank `--Select--` option at the top clears the value. |
| The column is **required** (business or system required) | The same, without the blank option, so the value can't be cleared. |
| Read-only: read-only form, inactive record, field locked by a business rule or script, or field security without update | A read-only box with the dot and label, like the platform's read-only fields. `---` when empty. |
| Field security without read | `***` and no dot. |
| A stored value that isn't one of the options | The number, with no dot. |
| Dark mode | The field follows the app's theme. Option colours stay as configured; each dot has a neutral border so pale and dark colours stay visible. |

The field looks like the form's other fields (same fill, border and height), and keyboard use is the same as the platform's dropdown.

## Business rules, scripts and security

RagChoice behaves like the platform's dropdown for everything around the field:

- **Business rules** that set the value, lock or unlock the field, or show or hide it work as normal.
- **Form scripts** work as normal: `formContext.getAttribute("<column>").setValue(...)` updates the dot and label, `getControl(...).setDisabled(true)` makes it read-only, and `OnChange` fires once when a user picks an option. A script's own `setValue` doesn't fire `OnChange`, as usual.
- **Required level** comes from the column, or from a business rule or script that changes it.
- **Column (field) security** is respected: no read shows `***`, read without update shows it read-only.

One edge case: the platform takes a moment to apply a user's selection. A script that sets the field **back to its previous value** within that moment is overridden by the user's choice. Setting any other value works.

## Moving to UAT and prod

Everything you configured is part of the **project solution**, not `WBRagChoice`:

- the option colours and Hidden flags are on the column or global choice, so make sure the column (or the global choice) is in the project solution;
- the control on the form is in the form, so make sure the form is in the project solution.

In each environment, import the managed `WBRagChoice` first, then the project solution. The other way round, the project solution's import stops with a missing dependency on the control.

When a new version of RagChoice is released, import the new managed `WBRagChoice`. Forms keep their configuration; users see the new version after a hard reload.

## Remove it

To go back to the platform's dropdown on a form, select the field, and under **Components** remove **RAG Choice (colour)** (classic designer: on the **Controls** tab, set **Web**, **Phone** and **Tablet** back to the default control, or remove the RAG Choice row). Save and publish. The column and its data aren't touched.

Remove the control from every form before deleting `WBRagChoice` from an environment, or the solution won't uninstall.

## Accessibility

- **Colour is never the only signal.** The label is always shown next to the dot. Keep labels meaningful on their own ("Red – at risk", not just a colour name, if your users need more than the colour).
- **The form label is the control's accessible name**, so screen reader users hear the label you give the field on the form. Give it a clear label, and keep it shown.
- **Required fields are announced as required.** When the column is business or system required, screen readers hear "required" along with the label.
- The dot and bar are decorative and hidden from screen readers. In Windows high contrast mode they keep their colours, and the label is still shown.
- **English only.** The control's own text (`--Select--`, `---`, `***`) is in English and it's laid out left to right, whatever the user's language.
- Pick option colours with enough contrast against both the light and dark field backgrounds. Very pale colours (for example a light yellow) are hard to see even with the dot's border.

## Troubleshooting

| Problem | Likely cause | What to do |
|---|---|---|
| **RAG Choice (colour)** isn't in the component list | `WBRagChoice` isn't imported in this environment, or the field isn't a single-select choice | Import the solution. Check the column's data type: the control only binds to single-select choices. |
| The form still shows the platform's dropdown | The form isn't published, the browser has the old form, or the control is set for another device type only | Publish the form, hard-reload, and check **Show component on** (or the Web option in the classic designer). |
| No dots at all | The options have no colours, or the colour change isn't published | Colour the options, publish the table or choice, and hard-reload. Or set **Fallback colour**. |
| One option has no dot | That option has no colour | Give it one, or set **Fallback colour** if all uncoloured options should look the same. |
| **Fallback colour** has no effect | It isn't a hex colour (the console shows `RagChoice: fallbackColor "…" isn't a hex colour`), or every option already has a colour | Use `#RRGGBB`. The fallback is only for options without a colour. |
| The blank `--Select--` option is missing | The column is required, or a business rule or script made it required | Expected: a required field can't be cleared. |
| A hidden option is in the list | The record's value is that option (it shows greyed out and can't be picked), or the platform stopped sending the undocumented `IsHidden` flag | The first is expected. For the second, report it on GitHub. |
| The field shows a number | The stored value isn't one of the column's options (for example an option was deleted) | Fix the record's value, or add the option back. |
| The field shows `***` | The user's column security profile doesn't allow read | Expected. Change the profile if they should see it. |
| After updating RagChoice, users see the old behaviour | The browser has the old version | Hard-reload. If it persists, check the new solution actually imported (its version in **Solutions**). |

## Limitations

- **Single-select choice columns only.** Multi-select choices, Yes/No, Status and Status Reason aren't supported.
- **Hidden options rely on an undocumented property** (`IsHidden`). If the platform stops sending it, hidden options appear in the list again. Retired values still save and display correctly.
- **Option colours don't adapt to dark mode.** They're the colours you set on the choice.
- **English only, left to right.** The control's own text isn't translated, and right-to-left languages aren't supported.
- **Not yet tested (issue #7):** the phone app, a screen reader, a real business rule lock, and column security for a user who isn't an administrator. The [dev test results](decisions.md) list what was tested and how.
