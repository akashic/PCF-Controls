# WBCodeFYName: deployment runbook for William Buck environments

How to deploy the `WBWBCodeFYName` solution to William Buck's dev, UAT and prod environments. Work through it in order in each environment, starting with dev, then UAT, then prod. Don't move on to the next environment until the checks in §6 pass.

Development and testing happened in `LowCode`, the development environment. The results are in [decisions.md](decisions.md). What the plug-in does is in the [README](../README.md).

> **Two rules that, if missed, break the deployment silently:**
> 1. **Always import with `--activate-plugins`.** Without it, the steps are imported **disabled**. Every save then succeeds with no name, and nothing reports an error ([W-3](decisions.md#w-3-a-fileversion-only-bump-updates-in-place)).
> 2. **Only ever import the solution.** Never run `scripts/register.mjs` against a William Buck environment, and never register the plug-in with the Plug-in Registration Tool. A second registration has different IDs, so the plug-in would run twice or the import would fail ([ADR-0006](../../../docs/adr/0006-plugins-folder.md) §6).

## 1. What you need

| Item | Detail |
|---|---|
| Release | A GitHub Release `WBCodeFYName-v<x.y.z>` from this repo. Download **`WBWBCodeFYName_managed.zip`**. William Buck environments only ever get the **managed** solution |
| Access | System Administrator, or System Customizer plus the right to import solutions, in the target environment |
| Tools | `pac` 2.14.1 (`dotnet tool install --global Microsoft.PowerApps.CLI.Tool`). Signed in with `pac auth create --environment <url>`, then check with `pac org who` |
| Project solution | The William Buck project solution that owns the SMSF tables must already be imported (§2) |
| Window | Imports take a few minutes. During the import, saves on SMSF Matter can briefly happen without the plug-in, so pick a quiet time for prod |

To make a release, if there isn't one yet: merge to `main`, tag the merge commit with `WBCodeFYName-v<x.y.z>` (matching `<FileVersion>` and `Solution.xml`), and push the tag. `release.yml` builds, tests and publishes both zips. See the README's [Versioning and releases](../../../README.md#versioning-and-releases).

## 2. Prerequisites in the target environment

The plug-in's step configuration names the project's tables and columns. It's fixed in the solution, and it's the same in every environment:

```json
{"targetTable":"wbsuper_smsfmatter","nameColumn":"wbsuper_wbcodefy","wbCodeLookup":"wbsuper_wbcode","wbCodeValueColumn":"wbsuper_wbcode","fyLookup":"wbsuper_fy","fyValueColumn":"wbsuper_name"}
```

So the target environment must have exactly these, from the project's solution:

| Requirement | How to check |
|---|---|
| Table `wbsuper_smsfmatter`, whose primary name column `wbsuper_wbcodefy` is text of **at least 11 characters** | Maker portal → Tables → SMSF Matter → Columns |
| Lookup `wbsuper_wbcode` → SuperFundClient (`wbsuper_superfundclient`), whose primary name `wbsuper_wbcode` holds the WBCode | Same, and the lookup's related table |
| Lookup `wbsuper_fy` → Financial Year (`wbsuper_financialyear`), whose primary name `wbsuper_name` holds `FY25`, `FY26`… | Same |
| **Alternate key** on SMSF Matter over WBCode + FY, status Active | Table → Keys. See §3 for duplicates |
| **Name read-only** on every SMSF Matter form | Form designer → WBCodeFY → Read-only |
| **Read privilege** on SuperFundClient and Financial Year for every security role that creates or updates SMSF Matter | Security roles → the custom entities tab. Without it, those users can't save (§6, check 6) |
| Nothing else sets `wbsuper_wbcodefy` | Look for flows, business rules, form scripts or other plug-ins that write the name, and turn them off once this is live. The plug-in overwrites them anyway, but two writers make faults hard to trace |

If any name differs (for example a different prefix), **stop**: the solution won't import, or the plug-in will block every save. A different name needs a new solution version with a changed step configuration, built and tested in `LowCode` first.

Check the columns with `pac`:

```sh
pac org fetch --xml "<fetch count='1'><entity name='wbsuper_smsfmatter'><attribute name='wbsuper_wbcodefy'/><attribute name='wbsuper_wbcode'/><attribute name='wbsuper_fy'/></entity></fetch>"
```

It must return a row or an empty result, not an error naming a column. Use `count`, not `top`: `pac org fetch` pages through results, and Dataverse rejects `top` with `The top attribute can't be specified with paging attribute page`.

## 3. Prepare existing data

Rows that already exist keep their current name until they're saved again (§7), so check them before importing:

1. **Duplicates.** The alternate key can't be activated while two rows share a WBCode and FY. Find them in Advanced Find, or with a grouped FetchXML query on `wbsuper_wbcode` and `wbsuper_fy` using `having count > 1`. Merge or fix them with the business before you continue.
2. **Missing or invalid lookups.** Once the plug-in is live, any save of a row with an empty WBCode or FY, a WBCode that isn't eight digits, or an FY that isn't `FY` plus two digits **will be blocked**. That affects users editing other fields on those rows too. List such rows and fix them first, or agree with the business that they'll be fixed when next edited.

## 4. Pre-import checks

```sh
pac auth create --environment https://<org>.crm6.dynamics.com/     # once per environment
pac org who                                                          # confirm you're in the right environment
# No earlier hand registration of the assembly:
pac org fetch --xml "<fetch><entity name='pluginassembly'><attribute name='name'/><attribute name='version'/><filter><condition attribute='name' operator='eq' value='WBCodeFYName'/></filter></entity></fetch>"
```

The assembly query must return nothing on a first install, or exactly one row that came from an earlier `WBWBCodeFYName` import on an upgrade. If there's a registration that didn't come from the solution, unregister it first, steps and all.

## 5. Import

```sh
pac solution import --path WBWBCodeFYName_managed.zip --activate-plugins --publish-changes
```

- **Order:** the project solution first (§2), then `WBWBCodeFYName`.
- If the import fails with **missing dependencies**, the project solution is missing or its names differ (§2). The solution needs the `wbsuper_smsfmatter` table and its `wbsuper_wbcode`, `wbsuper_fy` and `wbsuper_wbcodefy` columns ([W-4](decisions.md#w-4-dependencies-and-import-order)). Fix that rather than forcing the import.
- **First time in each environment, record the result:** in UAT or dev, try the import once **before** the project solution is there, or note what happens if the order goes wrong. W-4's negative test was never run in `LowCode`, so this record completes #59.

## 6. Post-import checks

Steps 1 and 2 apply in every environment. Steps 3 to 7 change data, so run them in dev and **UAT**, not in prod. In prod, run only step 3, on a row the business is happy to save.

1. **Both steps are enabled:**
   ```sh
   pac org fetch --xml "<fetch><entity name='sdkmessageprocessingstep'><attribute name='name'/><attribute name='statecode'/><attribute name='configuration'/><filter><condition attribute='name' operator='like' value='WBCodeFYName%'/></filter></entity></fetch>"
   ```
   Expect two rows, `Create of wbsuper_smsfmatter` and `Update of wbsuper_smsfmatter`, both **Enabled**, each with the configuration in §2. If they're disabled, the import ran without `--activate-plugins`. Import again with it.
2. **One assembly:** the §4 assembly query returns exactly one `WBCodeFYName`, version `1.0.0.0`.
3. **Form save:** create an SMSF Matter with a valid WBCode and FY. Its name becomes `<WBCode>-<FY digits>`, for example `00224570` + FY26 gives `00224570-26`.
4. **Regeneration:** change its FY, save, and the name follows. Change its WBCode, save, and the name follows.
5. **Blocked saves:** try a WBCode that isn't eight digits (if one exists), or clear the FY. The save is blocked with the README's message, for example `FY must be set before the record can be saved.`
6. **User without Read on Financial Year (UAT, required).** This wasn't tested in `LowCode`, which has a single user ([#60](decisions.md#dev-test-matrix-60)). Use a UAT user, or a temporary copy of a role, that can create SMSF Matter but has **no Read on Financial Year**. Their save should fail with `WBCodeFY couldn't be generated. Check the WBCode and FY, and that you can read both, then try again.`, with the details in the trace log. Record the result in [decisions.md](decisions.md), then put the role back.
7. **Duplicate:** create a second row with the same WBCode and FY. The alternate key rejects it.

Delete the test rows afterwards.

**Trace log.** Failure details go to the plug-in trace log (Settings → Customizations → Plug-in Trace Log). It records only when tracing is on: **Settings → Administration → System Settings → Customization → Enable logging to plug-in trace log**. Use **Exception** in dev and UAT, and in prod if the business agrees. Entries appear **one to two minutes** after the failure.

## 7. Existing rows

The plug-in runs only when a row is created, or when an update touches WBCode, FY or the name. Rows that existed before the import keep their current names until then. If they must all be named now, update each row's FY to its current value, which runs the plug-in and regenerates the name. Use a one-off script or flow, in batches, outside business hours. Fix the rows from §3.2 first, or they'll fail. A backfill script isn't part of this release. Ask for one if the business needs it.

## 8. Upgrading to a new version

1. The new version is built and tested in `LowCode`, with only `<FileVersion>` and `Solution.xml` bumped. **`AssemblyVersion` stays `1.0.0.0`.** Changing it registers a separate assembly and leaves the steps on the old one ([W-3](decisions.md#w-3-a-fileversion-only-bump-updates-in-place)).
2. Release it with the new tag.
3. Import the new managed zip exactly as in §5, **with `--activate-plugins`**. It upgrades in place: the steps keep their IDs, and the configuration comes from the solution.
4. Run the §6 checks.

## 9. Rollback

- **Stop the plug-in quickly:** disable both steps (Solutions → Default Solution → SDK Message Processing Steps, or the Plug-in Registration Tool). Names already generated stay as they are, and saves are no longer checked or named. Enable them again to resume.
- **Remove it:** `pac solution delete --solution-name WBWBCodeFYName`. This removes the assembly and steps, and nothing in the project's solution depends on it.
- **Go back a version:** a managed solution can't be downgraded in place. Delete it, then import the earlier release's managed zip with `--activate-plugins`.

## 10. Sign-off

| Environment | Release | Imported by / date | §6 checks | Notes |
|---|---|---|---|---|
| William Buck dev | | | | |
| UAT | | | incl. check 6 (Read privilege) | W-4 result (§5) |
| Prod | | | 1 to 3 | |
