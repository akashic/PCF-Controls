# TextHash test environment

How the SMSF Query table was added to `LowCode`, so TextHash can be registered and tested without touching a William Buck environment. It builds on the [WBCodeFYName test environment](wbcodefyname-test-environment.md), whose SMSF Matter table is SMSF Query's lookup target.

- **Built:** 13 Nov 2026.
- **Script:** [`scripts/test-env/create-smsf-tables.mjs`](../../scripts/test-env/create-smsf-tables.mjs), the same script as WBCodeFYName's. It's idempotent, so it's safe to re-run.
- **Source:** the product owner's description of dev's table (13 Nov 2026): the description holds up to 10,000 characters, and the SMSF lookup points to SMSF Matter and can't be blank.

> **Test environments only.** The same rule applies as in the [GridFormatter test environment](gridformatter-test-environment.md): run it only against a listed test environment.

## 1. What's there

| Item | Value |
|---|---|
| Environment | `LowCode`: https://lowcode.crm.dynamics.com/ |
| Publisher and solution | `WBSuperTest` (prefix `wbsuper`), as for WBCodeFYName |
| Table | `wbsuper_smsfquery` (SMSF Query) |
| Columns | `wbsuper_querydescription`: multiple lines of text, 10,000 characters, business required. `wbsuper_hash`: single line of text, 64 characters. `wbsuper_name`: the primary name, 100 characters |
| Lookup | `wbsuper_smsf` → SMSF Matter, business required (relationship `wbsuper_SMSFMatter_SMSFQuery_SMSF`) |
| Alternate key | `wbsuper_fundhashkey` ("SMSF and Hash") on `wbsuper_smsf` + `wbsuper_hash`. Active |
| Plug-in | The `WBTextHash` solution (unmanaged), registered by [`plugins/TextHash/scripts/register.mjs`](../../plugins/TextHash/scripts/register.mjs) and then re-imported from the built zip. Import a rebuilt solution with `--activate-plugins`, or the steps are disabled |

Because the names match dev, the plug-in's [example step configuration](../../plugins/TextHash/config/examples/step-config.example.json) works here unchanged.

### Differences from dev

- **Primary name:** dev's primary name column isn't recorded. The script uses `wbsuper_name`, which the plug-in doesn't use.
- **Forms and views:** the defaults Dataverse creates for a new table. The description and SMSF aren't on the form, so tests run through the Web API. Add them to the "Information" form to test from a form.

## 2. Data

The SMSF Matter rows from WBCodeFYName's tests act as the funds. The test run used `00100170-27` and `00100370-25`.

The SMSF Query rows left by the 13 Nov run are test data: each has a name starting `TextHash test`, and its description ends with the run's ID. Delete them freely. One row, created with the steps disabled to prove the key, has no hash.

## 3. Running the script

With a token (see [GridFormatter test environment §2](gridformatter-test-environment.md#2-prerequisites)):

```sh
export DATAVERSE_URL=https://lowcode.crm.dynamics.com
export DATAVERSE_TOKEN=$(az account get-access-token --resource $DATAVERSE_URL --query accessToken -o tsv)
node scripts/test-env/create-smsf-tables.mjs
```

On 13 Nov 2026 it created the table, its columns, the lookup and the key in about a minute, and skipped everything WBCodeFYName's run had already made. The key's index was Active about two minutes later.
