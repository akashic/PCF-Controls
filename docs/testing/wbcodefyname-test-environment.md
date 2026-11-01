# WBCodeFYName test environment

How the test copy of the dev SMSF tables was built in `LowCode`, so WBCodeFYName can be registered and tested (#59, #60) without touching a William Buck environment.

- **Built:** 1 Nov 2026.
- **Script:** [`scripts/test-env/create-smsf-tables.mjs`](../../scripts/test-env/create-smsf-tables.mjs). Idempotent, so it's safe to re-run.
- **Source:** the dev tables recorded in [`plugins/WBCodeFYName/fields.md`](../../plugins/WBCodeFYName/fields.md).

> **Test environments only.** The same rule applies as in the [GridFormatter test environment](gridformatter-test-environment.md): run it only against a listed test environment.

## 1. What's there

| Item | Value |
|---|---|
| Environment | `LowCode`: https://lowcode.crm.dynamics.com/ (the developer's personal tenant `ggregg.onmicrosoft.com`) |
| Publisher | `WBSuperTest`: prefix `wbsuper`, option value prefix `51234`. It's a **test** publisher, so the tables get dev's names. It isn't William Buck's publisher (ADR-0003 still applies to this repo's own solutions) |
| Solution | `WBSuperTest` (unmanaged): the three tables. Delete it, then the tables and the publisher, to remove everything |
| Tables | `wbsuper_financialyear`, `wbsuper_superfundclient`, `wbsuper_smsfmatter`, with the same logical names as dev |
| Lookups on SMSF Matter | `wbsuper_wbcode` → SuperFundClient (relationship `wbsuper_SuperFundClient_SMSFMatter_WBCode`), `wbsuper_fy` → Financial Year (`wbsuper_FinancialYear_SMSFMatter_FY`) |

Because the names match dev, the plug-in's [example step configuration](../../plugins/WBCodeFYName/config/examples/step-config.example.json) works here unchanged.

### Differences from dev

- **Lookups left out:** the targets of SMSF Matter's Internal Contact, Manager, Reviewer and Wealth Advisory Contact, and SuperFundClient's Partner, aren't recorded. The plug-in uses none of them.
- **Guessed names:** `wbsuper_clientterminationdate` and `wbsuper_partnerterminationdate` (cut off in the photos), and `wbsuper_year` (not shown). The plug-in uses none of them.
- **Text lengths:** every text column is 100 characters and every memo 4,000, because dev's lengths aren't recorded.
- **Forms and views:** these are the defaults Dataverse creates for a new table. The script also adds WBCode and FY to SMSF Matter's "Information" form and makes the name read-only (the plug-in README's prerequisites). There's no alternate key on the two lookups.

## Plug-in registration

WBCodeFYName is registered here by [`plugins/WBCodeFYName/scripts/register.mjs`](../../plugins/WBCodeFYName/scripts/register.mjs), in the unmanaged `WBWBCodeFYName` solution. The results are in [decisions.md](../../plugins/WBCodeFYName/docs/decisions.md). Import a rebuilt solution with `--activate-plugins`, or the steps are disabled.

## 2. Data

No SMSF Matter rows exist, because creating one is how the plug-in is tested.

| Financial Year | Start | End | Is Current | Note |
|---|---|---|---|---|
| FY25 | 2024-07-01 | 2025-06-30 | No | |
| FY26 | 2025-07-01 | 2026-06-30 | No | |
| FY27 | 2026-07-01 | 2027-06-30 | Yes | |
| FY2028 (invalid test) | 2027-07-01 | 2028-06-30 | No | Breaks the `FY` plus two digits rule, so the save should be blocked |

| SuperFundClient (WBCode) | Fund | Note |
|---|---|---|
| 00224570 | Gregg Family Super Fund | Valid |
| 00100170 | Test Super Fund One | Valid |
| 00100270 | Test Super Fund Two | Valid |
| 00100370 | Test Super Fund Three | Valid |
| 00100512 | Invalid suffix (test) | Doesn't end in `70` |
| 1234570 | Invalid seven digits (test) | Seven digits |

Expected names: 00224570 with FY26 gives `00224570-26`.

## 3. Running the script

With a token (see [GridFormatter test environment §2](gridformatter-test-environment.md#2-prerequisites)):

```sh
node scripts/test-env/create-smsf-tables.mjs      # add --option-prefix <n> if 51234 is taken
```

On 1 Nov 2026 it was run from the developer's signed-in browser instead, because the Windows machine had no Azure CLI and `pac`'s sign-in had expired. The same calls ran from a tab on `https://lowcode.crm.dynamics.com` using the page's session (`fetch('/api/data/v9.2/…')`).

- **Table creation is slow:** about a minute for each table and its columns.
- **One table at a time:** Dataverse refuses a second table creation while one is in progress (`0x8004ed47`, "A table creation operation is already in progress"). Don't start a second run until the first has finished.

## 4. Power Automate test flow

The Power Automate case in #60's [test matrix](../../plugins/WBCodeFYName/docs/decisions.md#dev-test-matrix-60) uses a small flow that's left in `LowCode` so it can be run again.

| Item | Value |
|---|---|
| Flow | **WBCodeFYName #60 test**, an instant (manual button) cloud flow, flow ID `6135e4e9-e5b5-73d2-04e3-a1baa4cab189`. It's on, and it isn't in a solution |
| Owner | Giles@ggregg.onmicrosoft.com |
| Connection | Microsoft Dataverse, `shared-commondataser-3cd220ae` (created 1 Nov 2026 for this flow) |
| Definition | [`flows/wbcodefyname-60-test.definition.json`](flows/wbcodefyname-60-test.definition.json) |
| Created | 1 Nov 2026, with the Power Automate plug-in's FlowAgent tools |

**What it does:**

1. **Add_SMSF_Matter** (Dataverse "Add a new row" on `wbsuper_smsfmatters`) sets only the lookups: WBCode `00100370` and FY27. It doesn't set the name.
2. **Update_FY_to_FY26** (Dataverse "Update a row" on the new row) changes FY to FY26.
3. **Names** (Compose) records the name after each step, plus the row ID.

**Expected result:** `afterAdd` is `00100370-27` and `afterUpdate` is `00100370-26`. On 1 Nov 2026, run `08584081075335976733533152003CU18` produced exactly that.

**Running it again:** the alternate key allows each WBCode + FY pair once, so **delete the row from the previous run first**. That's the `00100370-26` row: the add would succeed, but the update to FY26 would hit the key. Then either:

- open the flow in the Power Automate portal (`LowCode` → My flows → WBCodeFYName #60 test) and choose **Run**; or
- with the FlowAgent tools, call `run_flow` with the flow ID and `wait: true`, then `get_run_action_content` for `Names` outputs.

**Rebuilding it:** create a cloud flow from the definition file, with a Dataverse connection reference named `shared_commondataserviceforapps`. The record IDs in it are specific to `LowCode`. In a rebuilt environment, look them up by name: SuperFundClient `00100370`, Financial Year `FY27` and `FY26`.

**Gotchas:**

- **Lookups in a flow definition are `item/<navigation property>@odata.bind`**, for example `item/wbsuper_WBCode@odata.bind` = `/wbsuper_superfundclients(<id>)`. Two things here look right but fail:
  - FlowAgent's `validate_flow` rejects the `@odata.bind` form, but Dataverse accepts it.
  - The plain logical name, `item/wbsuper_wbcode`, passes `validate_flow` but fails on save with `WorkflowOperationParametersExtraParameter`.
- **The FlowAgent tools sign in by running `az`.** If Claude Code was started from a terminal opened before the Azure CLI was installed, they fail with `'az' is not recognized`, even though `az` works in a new terminal. Fully close the terminal app and start Claude Code again (the `doctor` tool shows this as a failed **token** check).
