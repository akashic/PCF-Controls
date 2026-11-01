# WBCodeFYName: VERIFY outcomes

The platform unknowns in the [brief](../../../docs/briefs/2026-10-31-wbcodefy-name-plugin.md) §3, tested on 1 Nov 2026 for #59. They were tested in `LowCode`, a test copy of the dev tables with dev's `wbsuper_` names ([test environment](../../../docs/testing/wbcodefyname-test-environment.md)), from Windows with the Azure CLI and `pac` 2.14.1. Registration and sync don't use any Windows-only tool, so the same steps work on macOS.

## W-1: steps created through the Web API run

**Confirmed, through the Web API and from a form.** [`scripts/register.mjs`](../scripts/register.mjs) uploaded the assembly and created the plug-in type, both steps and the PreImage with no Plug-in Registration Tool. Dataverse read the assembly's version, culture and public key token from the DLL, so the script doesn't send them. Saves through the Web API then behaved as the README says:

| Save | Result |
|---|---|
| Create, `00224570` + FY26, with a typed name | `00224570-26` (typed name replaced) |
| Create, WBCode `00100512` / `1234570` | Blocked: `WBCode "…" must be eight digits ending in 70, for example 00224570.` |
| Create, FY `FY2028 (invalid test)` | Blocked: `FY "…" must be FY followed by two digits, for example FY26.` |
| Create without FY / without WBCode | Blocked: `FY must be set…` / `WBCode must be set…` |
| Update FY only (WBCode from the PreImage) | `00224570-27` |
| Update writing only the name | Name overwritten back to `00224570-27` |
| Update a column outside the filter (Stage) | Plug-in didn't run, name unchanged |
| Update WBCode to `00100512` | Blocked |

**Confirmed from the form.** A new SMSF Matter on the "Information" form, saved with the toolbar's Save button:
- **WBCode `00100512` and FY26:** the save was blocked by a "Business Process Error" dialog reading `WBCode "00100512" must be eight digits ending in 70, for example 00224570.`, with the record still unsaved.
- **WBCode changed to `00100370`:** the save worked, and the record's title became `00100370-26`.

The lookups were set through the form's client API (`Xrm.Page.getAttribute(...).setValue`) rather than by typing in the lookup, then saved with the real Save button. The save goes through the same form save path either way.

**Not explained:** the read-only name control is in the form XML, but the form doesn't load it. `Xrm.Page.ui.controls` lists only WBCode, FY and Owner. Its cell has an empty label, as the form Dataverse generated for the new table did. This affects only how the test form looks, not the plug-in.

**Findings:**
- Re-running the script is safe. On a re-run, the PreImage can be changed only by PATCHing `attributes`. A PATCH that repeats `name`, `entityalias`, `imagetype` or `messagepropertyname` fails with `0x80040216` "An unexpected error occurred", so the script only PATCHes the columns, and only when they differ.
- `invocationsource` is stored as Child (1) whatever is sent, so the script doesn't set it. It appears to be deprecated.
- Creating the solution itself must not send the `MSCRM.SolutionUniqueName` header (`0x80040217`).

## W-2: unsecure configuration travels with the solution

**Confirmed.**
- **Export:** `pac solution sync` writes the configuration into the step XML (`src/SdkMessageProcessingSteps/{id}.xml`, `<Configuration>`) as one line, with the filtering attributes and the PreImage.
- **Import:** the Update step's configuration was changed to an equivalent pretty-printed JSON and its rank to 25, then the unmanaged solution was imported. Both went back to the solution's values.

## W-3: a FileVersion-only bump updates in place

**Confirmed.** With `FileVersion` 0.1.0.0 → 0.1.1.0 (and `Solution.xml` to match) and `AssemblyVersion` left at 1.0.0.0, the rebuilt solution was imported:
- There was still **one** `WBCodeFYName` assembly record, version 1.0.0.0, and both steps kept the same plug-in type ID.
- The assembly content in Dataverse was byte-for-byte the new DLL.

The bump was only for the test. The repo and LowCode's solution are back at 0.1.0.0.

**Finding: import with `--activate-plugins`.** `pac solution import` without it left **both steps disabled**, and a new row got no name. The step XML carries no state, and the import doesn't turn steps on unless asked. Re-importing with `--activate-plugins` enabled them. Every import of a plug-in solution, in every environment, must pass `--activate-plugins`, or rows save without a name. (One row was created while the steps were off. Re-saving its FY named it.)

## W-4: dependencies and import order

**Confirmed from the solution's metadata.** `Solution.xml` lists these as `MissingDependencies`, all in the solution "Active", which is the project's:

- the table `wbsuper_smsfmatter`, needed by both steps and the PreImage;
- the columns `wbsuper_wbcode`, `wbsuper_fy` and `wbsuper_wbcodefy`, needed by the Update step's filtering attributes and the PreImage.

There are none on the reference tables (SuperFundClient, Financial Year), because the plug-in only reads them at run time.

So the project's solution with the table must be imported first, and managed downstream, as ADR-0006 says. **Not tested:** importing into an environment that lacks the table. Only one test environment exists, so that needs dev or UAT. Expect the import to fail on the missing dependencies above.

## Dev test matrix (#60)

The brief's §5.2 matrix, run in `LowCode` on 1 Nov 2026. `LowCode` is the dev environment: all development happens there, and William Buck's environments are deployed to from the [runbook](runbook.md). Before running it:

- The alternate key `wbsuper_wbcodefykey` on WBCode + FY was added by `scripts/test-env/create-smsf-tables.mjs`, and it's Active.
- Plug-in trace logging was set to **Exception** (`organization.plugintracelogsetting` = 1; it was Off).

| Channel / case | Expected | Result |
|---|---|---|
| Model-driven form: create, then change FY, then change WBCode | Generated and regenerated | **Pass.** Create gave `00100370-26` (W-1). Changing FY to FY25 and saving gave `00100370-25`, then changing WBCode to `00100270` gave `00100270-25` |
| Power Automate add and update a row | Same as the form | *Pending* |
| Data import (both lookups set; one missing) | Generated; the row missing a lookup is rejected | **Pass.** See note 1 |
| Web API PATCH of the name only | Recomputed and the write overwritten | **Pass** (W-1) |
| Duplicate WBCode and FY | Rejected by the alternate key | **Pass.** See note 2 |
| User without Read on the FY table | The save fails with a clear message | **Deferred to William Buck UAT.** `LowCode` has a single user (a System Administrator). The developer chose to test it in UAT, and it's [runbook](runbook.md) §6 check 6 |
| Step configuration removed or broken | Blocked with the admin message; details in the trace log | **Pass.** See note 3 |
| Reimport after a `FileVersion` bump | Steps stay registered, new code runs | **Pass** (W-3), when imported with `--activate-plugins` |

**Notes:**

1. **Data import.** A CSV went through Dataverse's import engine (`import` + `importfile` with the system map, then `ParseImport`, `TransformImport`, `ImportRecordsImport`), which is the engine behind the Import Data wizard. Of the 2 rows, 1 succeeded and 1 failed:
   - Line 2, `00100170` with FY27, was created as `00100170-27`.
   - Line 3, `00224570` with no FY, was rejected. Its import log says `FY must be set before the record can be saved.` (error number -2147220891).

   The app's "Import from Excel" panel only accepts workbooks exported from Dataverse, with their hidden mapping sheets, so a hand-made file can't be used there.
2. **Duplicate.** Creating `00224570` + FY27, which already exists, failed with `Entity Key WBCode and FY violated. A record with the same value for FY, WBCode already exists.` The key runs after the plug-in names the row, so the user sees the key's message, not the plug-in's.
3. **Broken configuration.** With the Create step's configuration set to `{"targetTable":"wbsuper_smsfmatter"}`, then removed, both creates failed with `WBCodeFY isn't configured correctly. Contact your administrator.` The trace log has the reason: `the step configuration is invalid: Missing property "nameColumn".` and `The step's unsecure configuration is empty.`. **Trace log entries appear one to two minutes after the failure**, so wait before deciding there aren't any. `register.mjs` then restored the configuration.
