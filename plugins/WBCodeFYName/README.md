# WBCodeFYName

A synchronous PreOperation Dataverse plug-in that sets a table's **WBCodeFY** primary name from its **WBCode** and **FY** lookups, for example `00224570` + `FY26` → `00224570-26` (terms: [GLOSSARY.md](../../GLOSSARY.md)). It runs on the server, so the name is the same however the row is saved: forms, Power Automate, imports, integrations or the Web API. Nobody can type it, so it can't drift from the lookups.

| | |
|---|---|
| Solution | `WBWBCodeFYName` (WilliamBuck publisher), from #59 |
| Assembly | `WBCodeFYName`, classic, signed, .NET Framework 4.8, `AssemblyVersion` 1.0.0.0 |
| Plug-in type | `WBCodeFYName.SetPrimaryName` |
| Brief | [docs/briefs/2026-10-31-wbcodefy-name-plugin.md](../../docs/briefs/2026-10-31-wbcodefy-name-plugin.md) |
| Decisions | [ADR-0006](../../docs/adr/0006-plugins-folder.md) |

## What it does

On every Create, and on any Update that touches either lookup or the name:

1. **Finds both lookups.** Each comes from the save itself; if the save doesn't include it, from the `PreImage`.
2. **Rejects a save that leaves either lookup empty.**
3. **Reads the WBCode and FY values** from the referenced rows, as the user who's saving.
4. **Checks the values.**
   - The WBCode must be eight digits ending in `70`, which marks a super fund.
   - The FY must be `FY` plus two digits, in any case.
5. **Writes `<WBCode>-<two FY digits>` to the name column**, replacing whatever value the save supplied.

The user sees one of these messages when a save is rejected:

| Cause | Message |
|---|---|
| A lookup is empty | `WBCode must be set before the record can be saved.` / `FY must be set before the record can be saved.` |
| The referenced row has no value | `The selected WBCode has no value.` / `The selected FY has no value.` |
| A value breaks its rule | `WBCode "00224571" must be eight digits ending in 70, for example 00224570.` / `FY "2026" must be FY followed by two digits, for example FY26.` |
| The step configuration is missing or invalid, or the step isn't PreOperation | `WBCodeFY isn't configured correctly. Contact your administrator.` (the reason is in the plug-in trace log) |
| Anything else, such as no Read privilege on a reference table | `WBCodeFY couldn't be generated. Check the WBCode and FY, and that you can read both, then try again.` (the details are in the trace log) |

## Steps

Register both steps with the same unsecure configuration (below). The registration happens in dev, through `scripts/` (#59). After that, the steps travel in the solution.

| Step | Message | Stage, mode | Filtering attributes | Pre-image | Rank |
|---|---|---|---|---|---|
| Create | `Create` | PreOperation (20), synchronous | — | — | 20 |
| Update | `Update` | PreOperation (20), synchronous | the WBCode lookup, the FY lookup and the name column | `PreImage` (case-sensitive): both lookups | 20 |

The name column has to be in the Update filter. A direct write to the name, such as an API call that sets only that column, then runs the plug-in, which overwrites the value.

## Step configuration

The unsecure configuration is JSON with exactly these properties, each a logical name. The schema is [`config/step-config.schema.json`](config/step-config.schema.json), and the example is in [`config/examples/`](config/examples/step-config.example.json).

| Property | What it names |
|---|---|
| `targetTable` | The table the steps are registered on |
| `nameColumn` | Its text primary name column (WBCodeFY) |
| `wbCodeLookup` | Its lookup to the WBCode's table |
| `wbCodeValueColumn` | The text column on the WBCode's table that holds the WBCode |
| `fyLookup` | Its lookup to the FY's table |
| `fyValueColumn` | The text column on the FY's table that holds the FY |

The plug-in reads the configuration once, when the step loads. If anything is wrong, every save on the table is blocked until it's fixed. That's deliberate, so a bad configuration can't let rows through without a name.

## Project prerequisites

The plug-in's solution holds only the assembly and its steps. These belong to the **project's solution**, which owns the table, and must be imported first:

- **Table and columns:** the table, its text primary name column (at least 11 characters long) and both lookups.
- **Alternate key** on the WBCode and FY lookups, so each pair of WBCode and FY appears only once. Before activating it, fix any duplicate pairs and any blank names.
- **Read-only name field on forms.** Users can then see the value is generated. The plug-in protects it either way.
- **Read privilege** on the WBCode and FY tables for every role that saves the table.

## Known limitations

- **Renamed reference values don't flow through.** If a WBCode or FY row's value changes, rows that already use it keep the old name until one of their lookups is saved again. Treat WBCode and FY values as fixed once they're used.
- **No mobile offline support.** The plug-in runs on the server, so offline saves get their name when they sync.

## Development

```sh
dotnet build plugins/WBCodeFYName/WBCodeFYName/WBCodeFYName.csproj -c Release
dotnet test plugins/WBCodeFYName/tests                      # MSTest, net10.0, hand-written fakes
npm run check:controls                                      # repo conventions, including this plug-in
```

The logic is in pure classes: `NameRules` (the naming rules) and `StepConfig` (the configuration). `SetPrimaryName.Execute` is a thin layer around them, tested through fakes in `tests/Fakes.cs`. The tests also check that `StepConfig` and the JSON Schema agree, and that every example parses.

Version: `<FileVersion>` in the csproj (`x.y.z.0`), which must match `solution/src/Other/Solution.xml` once the solution exists. Never change `AssemblyVersion`.

## Changelog

### 0.1.0 (unreleased)

- First version: the plug-in, its step-configuration schema and its tests. Registration and the solution come in #59.
