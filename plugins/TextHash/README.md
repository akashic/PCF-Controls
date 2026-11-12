# TextHash

A synchronous PreOperation Dataverse plug-in that stops the same long text being saved twice. Dataverse can't put a multiple lines of text column in an alternate key, so the plug-in hashes the text into a short column that can be in one, and the key blocks duplicates in the database. Before the key would, the plug-in looks for a duplicate itself, so users see a clear message instead of the platform's. It runs on the server, so the rule holds whichever channel saves the row: forms, Power Automate, imports, integrations or the Web API.

Its first use is **SMSF Query** (`wbsuper_smsfquery`): a query's description must be unique within its SMSF Matter (terms: [GLOSSARY.md](../../GLOSSARY.md)). Nothing in the code is specific to that table, so another table can use it through its own step configuration.

| | |
|---|---|
| Solution | `WBTextHash` (WilliamBuck publisher) in [`solution/`](solution/) |
| Test results | [docs/decisions.md](docs/decisions.md) |
| Deploying to William Buck environments | [docs/runbook.md](docs/runbook.md) |
| Test environment | [docs/testing/texthash-test-environment.md](../../docs/testing/texthash-test-environment.md) |
| Assembly | `TextHash`, classic, signed, .NET Framework 4.8, `AssemblyVersion` 1.0.0.0 |
| Plug-in type | `TextHash.SetTextHash` |
| Brief | [docs/briefs/2026-11-13-text-hash-plugin.md](../../docs/briefs/2026-11-13-text-hash-plugin.md) (original requirements: [requirements.md](requirements.md)) |
| Decisions | [ADR-0006](../../docs/adr/0006-plugins-folder.md) |

## What it does

On every Create, and on any Update that touches the text, the hash or the scope lookup:

1. **Finds the text and the scope** (for SMSF Query, the description and the SMSF Matter). Each comes from the save itself; if the save doesn't include it, from the `PreImage`.
2. **Normalises the text.** Unicode form C, every run of whitespace (spaces, tabs, line breaks) turned into one space, leading and trailing whitespace dropped, and lower case. So `"Annual  return\r\nFY26"` and `" annual return fy26 "` are the same text.
3. **Writes the SHA-256 of the normalised text**, as 64 lowercase hex characters, to the hash column. Any hash the caller supplied is replaced. Blank text clears the hash, and isn't checked.
4. **Looks for another row with the same hash in the same scope**, as SYSTEM. If there is one, the save is blocked with the configured message.
5. The **alternate key** on scope + hash, which belongs to the project, then enforces the same rule in the database, including for two saves at the same moment.

The user sees one of these messages when a save is blocked:

| Cause | Message |
|---|---|
| The text is a duplicate within its scope | The configured `duplicateMessage`. For SMSF Query: `This query already exists for this fund.` |
| Two identical saves at the same moment, or a save with the plug-in bypassed or disabled | The platform's key error: `Entity Key SMSF and Hash violated. A record with the same value for Hash, SMSF already exists. …` |
| The step configuration is missing or invalid, or the step isn't PreOperation | `Duplicate checking isn't configured correctly. Contact your administrator.` (the reason is in the plug-in trace log) |
| Anything else, such as a timeout on the duplicate check | `The record couldn't be checked for duplicates. Try again, or contact your administrator.` (the details are in the trace log) |

**Why the check runs as SYSTEM:** the key blocks a duplicate whether or not the user can read the other row. A check as the user would miss rows they can't see, and leave them with the platform's error. The message only says a duplicate exists, which the key would say anyway. The trace log records the other row's ID, never the text.

## Steps

Both steps share the same unsecure configuration (below). They travel in the `WBTextHash` solution, whose source in [`solution/`](solution/) was synced from the `LowCode` test environment.

- **Deploying (dev, UAT, prod):** import the solution, always with `--activate-plugins`. Without it, the steps arrive disabled and duplicates are no longer checked or hashed.
- **[`scripts/register.mjs`](scripts/register.mjs)** registers the plug-in through the Web API (usage at its top). It validates the configuration against the schema, it's safe to re-run, and it turns disabled steps back on. Use it only in a scratch environment, or to rebuild `solution/src` from scratch. **Never run it in an environment that will also import the solution.** Its components get different IDs from the solution's, so the import fails or adds a second pair of steps.

| Step | Message | Stage, mode | Filtering attributes | Pre-image | Rank |
|---|---|---|---|---|---|
| Create | `Create` | PreOperation (20), synchronous | — | — | 20 |
| Update | `Update` | PreOperation (20), synchronous | the text, the hash and the scope lookup | `PreImage` (case-sensitive): the text and the scope lookup | 20 |

- **The hash column is in the Update filter**, so a direct write to it, such as an API call that sets only the hash, runs the plug-in, which overwrites it.
- **The scope lookup is in the filter**, so moving a row to a scope that already has its text is blocked.

## Step configuration

The unsecure configuration is JSON. The schema is [`config/step-config.schema.json`](config/step-config.schema.json), and [`config/examples/step-config.example.json`](config/examples/step-config.example.json) is SMSF Query's configuration, which the solution carries.

| Property | Required | What it holds |
|---|---|---|
| `targetTable` | Yes | The table the steps are registered on |
| `textColumn` | Yes | The text column whose content must be unique |
| `hashColumn` | Yes | The single line of text column, at least 64 characters, that receives the hash |
| `scopeLookup` | No | The lookup the text must be unique within. Leave it out for uniqueness across the whole table |
| `duplicateMessage` | Yes | What the user sees when the text is a duplicate |

The plug-in reads the configuration once, when the step loads. If anything is wrong, every save on the table is blocked until it's fixed. That's deliberate, so a bad configuration can't let duplicates through.

**Another table:** add a configuration for it in `config/examples/`, register it in `LowCode` with `node plugins/TextHash/scripts/register.mjs --env $DATAVERSE_URL --config <file>` (it adds a pair of steps for that table to `WBTextHash`), sync the solution and release a new version. The new table's project must meet the prerequisites below.

## Project prerequisites

The plug-in's solution holds only the assembly and its steps. These belong to the **project's solution**, which owns the table, and must be imported first:

- **Table and columns:** the table, its text column, the scope lookup if there is one, and the hash column: single line of text, **at least 64 characters**, no field-level security (key columns can't have it). For SMSF Query: `wbsuper_querydescription`, `wbsuper_smsf` and `wbsuper_hash`.
- **Alternate key** on the scope lookup + the hash column (or the hash alone, with no scope). For SMSF Query: `wbsuper_smsf` + `wbsuper_hash`. Its status must reach **Active**. If the table already has rows, they need hashes and no duplicates before the key can be activated (see the runbook).
- **Scope lookup business-required**, if there is one. Forms enforce that; the Web API doesn't. A row with no scope is checked against other rows with no scope.
- **Hash column hidden or read-only on forms.** Users don't need to see it, and the plug-in overwrites it either way.

## Known limitations

- **Rows saved with the plug-in bypassed or disabled have no hash**, so the key doesn't protect them. A caller with the "bypass custom business logic" privilege, or a save while the steps are disabled, can create a duplicate. Saving the row's text or hash again with the plug-in on fills the hash (and blocks it, if it's a duplicate).
- **Two identical saves at the same moment** both pass the plug-in's check. The key blocks the second, with the platform's message instead of the configured one.
- **Normalisation is fixed.** Changing it makes every stored hash stale, so it's a breaking change that needs a re-hash of every row.
- **No mobile offline support.** The plug-in runs on the server, so offline saves are checked when they sync.

## Development

```sh
dotnet build plugins/TextHash/TextHash/TextHash.csproj -c Release
dotnet test plugins/TextHash/tests                      # MSTest, net10.0, hand-written fakes
npm run test:scripts                                    # includes scripts/step-config.test.mjs
npm run check:controls                                  # repo conventions, including this plug-in
```

The logic is in pure classes: `TextHasher` (normalisation and hashing) and `StepConfig` (the configuration). `SetTextHash.Execute` is a thin layer around them, tested through fakes in `tests/Fakes.cs`. The tests also check that `StepConfig` and the JSON Schema agree, and that every example parses.

```sh
dotnet build plugins/TextHash/solution -c Release     # both zips, in solution/bin/Release
pac solution import --path plugins/TextHash/solution/bin/Release/WBTextHash.zip --activate-plugins --publish-changes   # LowCode
```

Version: `<FileVersion>` in the csproj (`x.y.z.0`), which must match `solution/src/Other/Solution.xml`. Never change `AssemblyVersion`.

## Changelog

### 0.1.0 (2026-11-13)

- First version: the plug-in, its step-configuration schema and tests, the registration script, the `WBTextHash` solution with SMSF Query's steps, and the `LowCode` test results.
