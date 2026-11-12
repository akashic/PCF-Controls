# TextHash: test results and decisions

The [brief](../../../docs/briefs/2026-11-13-text-hash-plugin.md) had no open VERIFY items by the time it was built: the two it started with (how the key treats a blank fund, and backfilling by touching the hash) were dropped when the product owner confirmed the fund can't be blank and there are no existing queries. This file records the `LowCode` test run on 13 Nov 2026 and what it showed about the platform.

Setup ([test environment](../../../docs/testing/texthash-test-environment.md)):

- `wbsuper_smsfquery` was created by `scripts/test-env/create-smsf-tables.mjs`, with the alternate key `wbsuper_fundhashkey` on `wbsuper_smsf` + `wbsuper_hash`. Its index reached **Active** within a couple of minutes of being created on the empty table.
- The plug-in was registered by [`scripts/register.mjs`](../scripts/register.mjs), synced into `solution/`, then the built unmanaged solution was imported back with `--activate-plugins` and the matrix run again against it. Both runs passed.
- Plug-in trace logging was already **Exception** (`organization.plugintracelogsetting` = 1).
- Every case ran through the Web API as the developer (System Administrator), with the run's own text so runs don't collide.

## Test matrix

| Case | Expected | Result |
|---|---|---|
| Create a query | Hash set to the SHA-256 of the normalised description | **Pass.** It matched a hash computed independently in Node from the normalised text |
| Same description in the same SMSF Matter, with different case, spacing, tabs and line endings | Blocked with the configured message | **Pass.** HTTP 400, `This query already exists for this fund.` |
| Same description in another SMSF Matter | Saves | **Pass** |
| Create with a made-up hash | The hash is replaced | **Pass** |
| Web API PATCH of the hash only | Recomputed from the pre-image | **Pass** |
| Move a query to an SMSF Matter that already has its description | Blocked | **Pass.** HTTP 400 with the configured message |
| Edit a description to match another query in the same SMSF Matter | Blocked | **Pass** |
| Re-save a query's own description in a different case | Saves; it doesn't match itself | **Pass** |
| Update a column outside the filter (the name) | Plug-in doesn't run, hash unchanged | **Pass** |
| A 10,000-character description (the column's maximum) | Saves with a hash | **Pass** |
| Both steps disabled, then a row with another row's fund and hash | The alternate key rejects it | **Pass.** See note 1 |
| Both steps disabled, a row with no hash | Saves without a hash | **Pass.** This is the "bypassed" limitation in the README |
| Create step's configuration set to `{"targetTable":"wbsuper_smsfquery"}` | Blocked with the admin message; reason in the trace log | **Pass.** See note 2 |
| Import of the built `WBTextHash.zip` with `--activate-plugins` | Steps enabled; one `TextHash` assembly, version 1.0.0.0 | **Pass.** Description `TextHash 0.1.0.0` |
| Form save of a duplicate | The message in a dialog | **Not run in `LowCode`.** A plug-in's `InvalidPluginExecutionException` message appears in the form's "Business Process Error" dialog (WBCodeFYName [W-1](../../WBCodeFYName/docs/decisions.md#w-1-steps-created-through-the-web-api-run)). Runbook §6 check 4 covers it in UAT |
| Power Automate add of a duplicate | The flow's action fails with the message | **Not run in `LowCode`.** The plug-in runs for every channel (WBCodeFYName's #60 matrix). Runbook §6 check 5 covers it in UAT |
| A user who can't read the existing duplicate | Still blocked with the configured message, because the check runs as SYSTEM | **Deferred to UAT.** `LowCode` has a single user. Runbook §6 check 6 |

**Notes:**

1. **The key on its own.** With both steps disabled, the second row was rejected with HTTP **412**, error code `0x80060892`: `Entity Key SMSF and Hash violated. A record with the same value for Hash, SMSF already exists. A duplicate record cannot be created. Select one or more unique values and try again.` This is what users would see without the plug-in's own check. The steps were enabled again straight afterwards.
2. **Broken configuration.** The save failed at once with `Duplicate checking isn't configured correctly. Contact your administrator.` The trace log entry, `SetTextHash: the step configuration is invalid: Missing property "textColumn".`, was there when checked a few minutes later. Entries can take one to two minutes to appear. The configuration was restored from the value read before the test.
3. **Trace content.** A blocked duplicate traces `SetTextHash: setting wbsuper_hash to <hash>.` and `SetTextHash: wbsuper_smsfquery <id> already has this text.`, so an administrator can find the other row. The description itself is never traced.

## Decisions made while building

- **The message's only rule is "not blank".** The brief also proposed a 500-character limit. It was dropped: the repo's flat schema checker supports patterns only, and a long message does no harm.
- **The generic error says "record", not "query"**, because the plug-in serves any table.
- **`SHA256.Create()`** works in the Dataverse sandbox (`LowCode`), so there's no need for a FIPS-specific implementation.
- **Text that isn't valid UTF-16** (a lone surrogate, which only the API could send) is hashed without Unicode normalisation rather than blocking the save.
- **The synced `TextHash.dll` isn't committed**, as for WBCodeFYName. The solution build packs the assembly built from the project.
