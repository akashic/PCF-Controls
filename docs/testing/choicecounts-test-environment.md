# ChoiceCounts test environment

The setup in `LowCode` (the dev environment) for testing ChoiceCounts on the SMSF Matter form, as William Buck will use it: a count of each matter's Red and Amber tasks, with drill-through to the Tasks tab. It builds on the [WBCodeFYName test tables](wbcodefyname-test-environment.md).

## Build it

Run these in order, with `DATAVERSE_URL` and `DATAVERSE_TOKEN` set (see the [GridFormatter test environment](gridformatter-test-environment.md#2-prerequisites)). All three are idempotent.

```sh
node scripts/test-env/create-smsf-tables.mjs           # SMSF Matter, SuperFundClient, Financial Year
node scripts/test-env/create-smsf-tasks.mjs            # RAG choice, SMSF Task table, views, Tasks tab, sample tasks
dotnet build controls/ChoiceCounts/solution -c Release
pac solution import --path controls/ChoiceCounts/solution/bin/Release/WBChoiceCounts.zip --publish-changes
node scripts/test-env/add-choicecounts-to-smsf-form.mjs  # the control on Task RAG and Stage, and the drill-through script
node scripts/test-env/capture-choicecounts-fixtures.mjs  # optional: adds Urgent (Yes/No) and re-captures the C-3 fixtures
```

## What's there

| Item | Value |
|---|---|
| Global choice | `wbsuper_ragstatus` "RAG Status": Red `512340000` (#D13438), Amber `512340001` (#FFB900), Green `512340002` (#107C10) |
| Table | `wbsuper_smsftask` "SMSF Task": `wbsuper_name`, `wbsuper_ragstatus` (on the global choice), lookup `wbsuper_smsfmatter` (relationship `wbsuper_SMSFMatter_SMSFTask`) |
| Views | "Active SMSF Tasks (all colours)", "Red tasks", "Amber tasks" (active tasks only); "Status: Active", "Status: Inactive" (by Status Reason, for the second instance) |
| Host column | `wbsuper_smsfmatter.wbsuper_taskrag` "Task RAG", text, never written |
| Form | SMSF Matter "Information" (form id `702b23f9-c66d-40f2-94ae-6533f70816e8`): Task RAG under FY, showing ChoiceCounts; a **Tasks** tab with subgrid `tasks_subgrid` (related tasks, view selector offering all five views) |
| Control settings | Table `wbsuper_smsftask`, group by `wbsuper_ragstatus`, relationship `wbsuper_smsfmatter`, filter `<condition attribute="statecode" operator="eq" value="0" />`, options `512340000,512340001`, Zero counts *Neutral*, no colour overrides, "Raise OnOptionSelect" |
| Second instance | On `wbsuper_stage` ("Task status"): the same tasks grouped by **Status Reason**, every option, Zero counts *Option colour*, "Raise OnOptionSelect". It checks Status Reason grouping, several instances on one form, and one script handling drill-through for both |
| Yes/No column | `wbsuper_smsftask.wbsuper_urgent` "Urgent" (Yes coloured #D13438), for the Yes/No fixture |
| Form script | Web resource `wbsuper_ChoiceCounts.wbsuper_smsfmatter.js` (`controls/ChoiceCounts/examples/drill-through.js`, plus a `CONFIG.controls` entry for Task status appended by the script), on load: `WBChoiceCounts.DrillThrough.onLoad` |
| Solution | All in the unmanaged `WBSuperTest`, apart from the control (`WBChoiceCounts`) |

## Sample data and expected counts

| Matter | Tasks | Expected |
|---|---|---|
| `00224570-27` | 2 Red, 3 Amber, 3 Green, 1 inactive Red, 1 with no RAG | **Red 2 · Amber 3** |
| `00100170-25` | 1 Red, 2 Green | **Red 1 · Amber 0**, with Amber 0 in grey |
| Others | none | **Red 0 · Amber 0** |

Select **Red 2** on `00224570-27`: the Tasks tab opens with the "Red tasks" view, showing "Chase bank statements" and "Lodge annual return".

Task status on `00224570-27` shows **Active 9 · Inactive 1**. Select **Inactive 1**: the Tasks tab opens with "Status: Inactive", showing "Old overdue item (inactive)". **Active 9** opens "Status: Active" with the other nine. (Checked in `LowCode`, 1 Nov 2026.)

## Notes

- **Reload the form after changing it.** The first load after publishing can use a cached form without the new script. A hard reload (Ctrl+Shift+R) isn't always enough: on 1 Nov 2026 the form kept the old control settings and script through one. Opening the record again by its URL loaded the new ones. To check which script loaded, look at `WBChoiceCounts.DrillThrough.config` in the console.
- The form designer hasn't been used for this setup. Whether makers can do the same through the designer, in particular binding Record ID to the primary key, is decisions.md C-1 and C-2.
