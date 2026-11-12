# TextHash: deployment runbook for William Buck environments

How to deploy the `WBTextHash` solution to William Buck's dev, UAT and prod environments. Work through it in order in each environment, starting with dev, then UAT, then prod. Don't move on to the next environment until the checks in §6 pass.

Development and testing happened in `LowCode`, the development environment. The results are in [decisions.md](decisions.md). What the plug-in does is in the [README](../README.md).

> **Three rules that, if missed, break the deployment silently:**
> 1. **Always import with `--activate-plugins`.** Without it, the steps are imported **disabled**. Queries then save with no hash, the alternate key doesn't see them, and duplicates get in with no error.
> 2. **Import the plug-in before anyone creates a query.** A query saved before the steps are enabled has no hash, so nothing protects it.
> 3. **Only ever import the solution.** Never run `scripts/register.mjs` against a William Buck environment, and never register the plug-in with the Plug-in Registration Tool. A second registration has different IDs, so the plug-in would run twice or the import would fail ([ADR-0006](../../../docs/adr/0006-plugins-folder.md) §6).

## 1. What you need

| Item | Detail |
|---|---|
| Release | A GitHub Release `TextHash-v<x.y.z>` from this repo. Download **`WBTextHash_managed.zip`**. William Buck environments only ever get the **managed** solution |
| Access | System Administrator, or System Customizer plus the right to import solutions, in the target environment |
| Tools | `pac` 2.14.1 (`dotnet tool install --global Microsoft.PowerApps.CLI.Tool`). Signed in with `pac auth create --environment <url>`, then check with `pac org who` |
| Project solution | The William Buck project solution that owns SMSF Query, with the hash column and the alternate key, must already be imported (§2) |
| Window | Imports take a few minutes. During the import, saves on SMSF Query can briefly happen without the plug-in, so pick a time when nobody is creating queries |

To make a release, if there isn't one yet: merge to `main`, tag the merge commit with `TextHash-v<x.y.z>` (matching `<FileVersion>` and `Solution.xml`), and push the tag. `release.yml` builds, tests and publishes both zips. See the README's [Versioning and releases](../../../README.md#versioning-and-releases).

## 2. Prerequisites in the target environment

The plug-in's step configuration names the project's table and columns. It's fixed in the solution, and it's the same in every environment:

```json
{"targetTable":"wbsuper_smsfquery","textColumn":"wbsuper_querydescription","hashColumn":"wbsuper_hash","scopeLookup":"wbsuper_smsf","duplicateMessage":"This query already exists for this fund."}
```

So the project's solution must provide exactly these:

| Requirement | How to check |
|---|---|
| Table `wbsuper_smsfquery` (SMSF Query) | Maker portal → Tables → SMSF Query |
| Column `wbsuper_querydescription`: multiple lines of text (up to 10,000 characters) | Table → Columns |
| Lookup `wbsuper_smsf` → SMSF Matter (`wbsuper_smsfmatter`), **business required** | Table → Columns → SMSF → Required |
| Column `wbsuper_hash`: **single line of text, at least 64 characters**, no field-level security | Table → Columns → Hash. Not on forms, or read-only |
| **Alternate key** on `wbsuper_smsf` + `wbsuper_hash`, status **Active** | Table → Keys |
| Nothing else writes `wbsuper_hash` | No flows, business rules, form scripts or other plug-ins. The plug-in overwrites them anyway, but two writers make faults hard to trace |

**The alternate key belongs to the project's solution, not `WBTextHash`.** Create it in dev, in the project's unmanaged solution, as **Keys → New key → SMSF and Hash**, with the columns SMSF and Hash. Its index builds in the background. Wait until its status is **Active**; on an empty table this took about two minutes in `LowCode`. If it shows **Failed**, the table already has rows with the same SMSF and hash, or with no hash (see §7).

If any name differs (for example a different prefix), **stop**: the solution won't import, or the plug-in will block every save. A different name needs a new solution version with a changed step configuration, built and tested in `LowCode` first.

Check the columns with `pac`:

```sh
pac org fetch --xml "<fetch count='1'><entity name='wbsuper_smsfquery'><attribute name='wbsuper_querydescription'/><attribute name='wbsuper_smsf'/><attribute name='wbsuper_hash'/></entity></fetch>"
```

It must return a row or an empty result, not an error naming a column. Use `count`, not `top`: `pac org fetch` pages through results, and Dataverse rejects `top` with paging.

## 3. Existing queries

There are no SMSF Queries in any William Buck environment yet (product owner, 13 Nov 2026), so no data preparation is needed. **Check that it's still true before the import:**

```sh
pac org fetch --xml "<fetch count='1'><entity name='wbsuper_smsfquery'><attribute name='wbsuper_smsfqueryid'/></entity></fetch>"
```

If it returns a row, stop and follow §7 first.

## 4. Pre-import checks

```sh
pac auth create --environment https://<org>.crm6.dynamics.com/     # once per environment
pac org who                                                          # confirm you're in the right environment
# No earlier hand registration of the assembly:
pac org fetch --xml "<fetch><entity name='pluginassembly'><attribute name='name'/><attribute name='version'/><filter><condition attribute='name' operator='eq' value='TextHash'/></filter></entity></fetch>"
```

The assembly query must return nothing on a first install, or exactly one row that came from an earlier `WBTextHash` import on an upgrade. If there's a registration that didn't come from the solution, unregister it first, steps and all.

## 5. Import

```sh
pac solution import --path WBTextHash_managed.zip --activate-plugins --publish-changes
```

- **Order:** the project solution first (§2), then `WBTextHash`.
- If the import fails with **missing dependencies**, the project solution is missing or its names differ (§2). `WBTextHash` needs the table `wbsuper_smsfquery` and its columns `wbsuper_querydescription`, `wbsuper_smsf` and `wbsuper_hash`, which its `Solution.xml` lists as dependencies. Fix that rather than forcing the import.

## 6. Post-import checks

Checks 1 and 2 apply in every environment. Checks 3 to 7 create test queries, so run them in dev and **UAT**. In prod, run only check 3, on an SMSF Matter the business is happy to use, and delete the query afterwards.

1. **Both steps are enabled:**
   ```sh
   pac org fetch --xml "<fetch><entity name='sdkmessageprocessingstep'><attribute name='name'/><attribute name='statecode'/><attribute name='configuration'/><filter><condition attribute='name' operator='like' value='TextHash%'/></filter></entity></fetch>"
   ```
   Expect two rows, `TextHash.SetTextHash: Create of wbsuper_smsfquery` and `TextHash.SetTextHash: Update of wbsuper_smsfquery`, both **Enabled**, each with the configuration in §2. If they're disabled, the import ran without `--activate-plugins`. Import again with it.
2. **One assembly:** the §4 assembly query returns exactly one `TextHash`, version `1.0.0.0`.
3. **A query gets a hash:** on a form, create an SMSF Query on an SMSF Matter with a description. Then check that its hash is 64 hex characters:
   ```sh
   pac org fetch --xml "<fetch count='5'><entity name='wbsuper_smsfquery'><attribute name='wbsuper_querydescription'/><attribute name='wbsuper_hash'/><order attribute='createdon' descending='true'/></entity></fetch>"
   ```
4. **A duplicate is blocked on a form:** create a second query on the **same** SMSF Matter, typing the description with different capitals and extra spaces. The save is blocked with a dialog reading `This query already exists for this fund.`
5. **A duplicate is blocked in a flow (UAT):** a Power Automate "Add a new row" of the same description on the same SMSF Matter fails with the same message. Any existing flow that creates queries will do, or a small instant flow.
6. **A user who can't see the existing query (UAT, required).** This wasn't tested in `LowCode`, which has a single user. Use a UAT user who can create SMSF Queries but **can't read** the query from check 3 (for example, user-level Read on SMSF Query, with the check 3 query owned by someone else). Their duplicate should still be blocked with `This query already exists for this fund.`, not the platform's key error. Record the result in [decisions.md](decisions.md).
7. **The same description on another SMSF Matter saves.**

Delete the test queries afterwards.

**Trace log.** Failure details go to the plug-in trace log (Settings → Customizations → Plug-in Trace Log). It records only when tracing is on: **Settings → Administration → System Settings → Customization → Enable logging to plug-in trace log**. Use **Exception** in dev and UAT, and in prod if the business agrees. Entries appear **one to two minutes** after the failure. A blocked duplicate's entry names the existing query's ID, so the business can find it.

## 7. If a table already has queries

This doesn't apply to the first deployment (§3). It's here for a later table, or if queries were created before the plug-in was imported. Queries without a hash aren't protected, and the alternate key can't be activated while two queries share an SMSF Matter and hash.

1. Import `WBTextHash` (§5), so new and edited queries get hashes.
2. Fill in the missing hashes by updating each query's `wbsuper_hash` to any value, for example an empty string, through the Web API, a flow or a bulk edit. The plug-in replaces it with the real hash, using the description from the pre-image. A query that duplicates one already hashed is **blocked** with the duplicate message: list those.
3. Resolve the listed duplicates with the business (edit, merge or delete), and repeat step 2 for them.
4. Create or reactivate the alternate key and wait for **Active**.

A backfill script isn't part of this release. Ask for one if it's needed.

## 8. Upgrading to a new version

1. The new version is built and tested in `LowCode`, with only `<FileVersion>` and `Solution.xml` bumped. **`AssemblyVersion` stays `1.0.0.0`.** Changing it registers a separate assembly and leaves the steps on the old one (WBCodeFYName [W-3](../../WBCodeFYName/docs/decisions.md#w-3-a-fileversion-only-bump-updates-in-place)).
2. Release it with the new tag.
3. Import the new managed zip exactly as in §5, **with `--activate-plugins`**. It upgrades in place: the steps keep their IDs, and the configuration comes from the solution.
4. Run the §6 checks.

**A version that changes the normalisation** (what counts as the same text) makes every stored hash stale. Its release notes will say so, and it needs §7 step 2 run over every query after the import.

## 9. Rollback

- **Stop the plug-in quickly:** disable both steps (Solutions → Default Solution → SDK Message Processing Steps). Saves then succeed without a hash or a check. The alternate key still blocks a row that carries an existing hash, but new rows have none. Enable the steps again to resume, then run §7 step 2 for queries saved in between.
- **Remove it:** `pac solution delete --solution-name WBTextHash`. This removes the assembly and steps, and nothing in the project's solution depends on it. The hash column and the key stay, owned by the project.
- **Go back a version:** a managed solution can't be downgraded in place. Delete it, then import the earlier release's managed zip with `--activate-plugins`.

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Queries save with an empty hash, and duplicates get in | Steps disabled (import without `--activate-plugins`) | §6 check 1; import again with the flag |
| Every save on SMSF Query fails with `Duplicate checking isn't configured correctly…` | The step configuration was edited, or a column it names doesn't exist | Read the trace log for the reason. Re-import the release, and check §2 |
| A duplicate fails with `Entity Key SMSF and Hash violated…` instead of the friendly message | Two saves at the same moment, or the plug-in didn't run for one of them | Expected occasionally. If it happens every time, check the steps are enabled |
| The alternate key shows **Failed** | Existing queries share an SMSF Matter and hash, or have no hash | §7 |
| `The record couldn't be checked for duplicates…` | The duplicate check failed, for example a timeout | Read the trace log; try again |

## 11. Sign-off

| Environment | Release | Imported by / date | §6 checks | Notes |
|---|---|---|---|---|
| William Buck dev | | | 1 to 4, 7 | |
| UAT | | | 1 to 7, incl. check 6 (user who can't see the query) | |
| Prod | | | 1 to 3 | |
