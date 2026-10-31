# Build brief: `WBCodeFYName`, a Dataverse plug-in that generates the WBCodeFY primary name

> **Audience:** an AI coding agent (or developer) building the plug-in in this repo.
> **Date written:** 31 October 2026, from a grilling session with the product owner on the original requirements, [`plugins/WBCodeFYName/Dataverse_Synchronous_PreOperation_Plugin_WBCodeFY.md`](../../plugins/WBCodeFYName/Dataverse_Synchronous_PreOperation_Plugin_WBCodeFY.md). That file's sample code and registration tables are useful background, but **this brief overrides it** wherever they differ: names come from configuration, the FY rule is broader, the toolchain is macOS, and the update filtering is different. Platform facts were checked against Microsoft Learn on 31 October 2026. Anything not confirmed is marked **VERIFY**. Prove those with a spike in dev and record the result in `plugins/WBCodeFYName/docs/decisions.md`.
> This is the repo's **first plug-in**. Before it's built, the `plugins/` conventions need an ADR (§6).

---

## 1. What we are building and why

A project table has a text primary name column, **WBCodeFY**, plus two lookups: **WBCode**, an integration code record, and **FY**, a financial year record. The primary name must always be `<WBCode>-<two-digit FY>`, for example `00224570` + `FY26` → `00224570-26`, whichever channel creates or changes the row: forms, Power Automate, imports, integrations or the Web API.

A business rule or formula column can't do this: the values come from referenced rows, and the target is the primary name. A **synchronous PreOperation plug-in** on Create and Update can. It reads both lookups, validates them, and sets the name on the incoming `Target` within the same transaction, without a second update.

| Item | Value |
|---|---|
| Folder | `plugins/WBCodeFYName/` |
| Project | `plugins/WBCodeFYName/WBCodeFYName/WBCodeFYName.csproj` (ADR-0006: the project sits in a subfolder so it doesn't compile `tests/`) |
| C# namespace and class | namespace `WBCodeFYName` (`pac plugin init` takes it from the folder), class `SetPrimaryName`. A class shouldn't share its namespace's name. |
| Assembly | classic, strong-name signed, `net48` (Microsoft's recommended plug-in target), **`AssemblyVersion` fixed at `1.0.0.0`** |
| Solution | `WBWBCodeFYName`, WilliamBuck publisher (ADR-0003), contains the assembly, its two steps, the pre-image and the step configuration |
| Release tag | `WBCodeFYName-v<x.y.z>`; start version `0.1.0` |

---

## 2. Decisions (product owner, 31 Oct 2026)

| Topic | Decision |
|---|---|
| Where it lives | **This repo, in a new top-level `plugins/` folder**, not in `controls/` and not in the project's repo. |
| Generic or specific | **Specific to WBCodeFY.** The validation rules are compiled in. Only logical names are configured. |
| Logical names | Come from the step's **unsecure configuration (JSON)**, never from constants, so the C# contains no `wbsuper_` or any other prefix (ADR-0005 spirit). The config holds the target table, the WBCode lookup, the FY lookup, the name column, and the value column on each referenced table. |
| Bad configuration | **Block the save** with an `InvalidPluginExecutionException` ("WBCodeFY isn't configured correctly. Contact your administrator."). Write the details to the trace log. Parse and validate the configuration once, in the constructor. |
| WBCode rule | `^\d{6}70$` (eight digits ending in 70), compiled. |
| FY rule | **`^FY\d{2}$`** (broadened from `FY2\d` so saves don't start failing at FY30), compiled, case-insensitive. |
| Result | `<WBCode>-<FY without "FY">`, which must match `^\d{6}70-\d{2}$`. |
| Missing lookup | **Reject** a Create or Update that leaves either lookup empty. |
| Direct edits of the name | **One Update step filtered on all three columns**, WBCode, FY and WBCodeFY, with a pre-image of both lookups. Any direct write to the name is recomputed and overwritten. There's no separate reject step. |
| Security context | Retrieve the referenced rows as the **calling user**. Every role that saves the target table needs Read on both reference tables, which goes in the README as a project prerequisite. |
| Lookup renames | **Out of scope.** Renaming a WBCode or FY value doesn't update rows that already use it. Document this as a known limitation, and say the reference data should be treated as immutable once used. |
| Owned by the project, not this solution | The alternate key on (WBCode, FY), the read-only setting on the form field, the table and its columns, and the security roles. The README lists them as prerequisites. |
| Package type | **Classic signed assembly**, not a NuGet plug-in package. It has no dependent assemblies. |
| Versioning | `AssemblyVersion` stays `1.0.0.0` forever. The semver goes in `FileVersion` / `Version` in the csproj and in `Solution.xml` (`x.y.z.0`), and the check script enforces that they match. |
| Registration (macOS) | Register the assembly, steps and image **once in dev with a Web API script** in `plugins/WBCodeFYName/scripts/`. Then add them to the solution, run `pac solution sync` to bring the registration XML into source, and build with `dotnet build` from then on. |
| Unit tests | **MSTest** in a `net10.0` test project (`plugins/WBCodeFYName/tests/`; net10.0 so only the README's .NET 10 SDK is needed) with **hand-written fakes** of the `Microsoft.Xrm.Sdk` interfaces. No FakeXrmEasy. MSTest and `Microsoft.NET.Test.Sdk` need sign-off in the PR (managed environment rule). |

---

## 3. Platform facts

Each fact is marked as documented on Microsoft Learn **[D]**, seen in a local probe on 31 Oct **[O]**, inferred **[I]**, or **VERIFY**.

- **Building on macOS** **[O]**: `pac plugin init` creates an SDK-style .NET Framework project with a `.snk` (`net462` from `pac` 2.10.1, `net48` from 2.14.1; Microsoft supports 4.6.2 to 4.8 and recommends 4.8). Its package references are `Microsoft.CrmSdk.CoreAssemblies`, `Microsoft.PowerApps.MSBuild.Plugin` and `Microsoft.NETFramework.ReferenceAssemblies`. `dotnet build -c Release` works on macOS and produces a strong-name-signed DLL. The template's Visual Studio imports are guarded by `Exists()`.
- **Classic assemblies must be signed** **[D]** ([build and package](https://learn.microsoft.com/power-apps/developer/data-platform/build-and-package)).
- **Registration tools are Windows-only** **[D]**: the Plug-in Registration Tool and `pac tool` are Windows-only. **[D/O]** `pac plugin push` needs `--pluginId`, so it only updates an assembly that's already registered.
- **Solution build needs registration XML first** **[O]**: `pac solution add-reference` to the plug-in project works, but `dotnet build` of the cdsproj fails until the registration XML (`PluginAssemblies/…`, `SdkMessageProcessingSteps/…`) is in source. That's why registration happens first and is followed by a sync.
- **Steps and images are documented tables** **[D]**: `sdkmessageprocessingstep` (`configuration`, `filteringattributes`, `stage` = 20, `mode` = 0, `rank`, `plugintypeid`, `sdkmessagefilterid`) and `sdkmessageprocessingstepimage` ([reference](https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/sdkmessageprocessingstep)). **VERIFY W-1**: creating them through the Web API from macOS registers working steps.
- **Unsecure configuration** **[D]**: it arrives through the `(string unsecure, string secure)` constructor ([write a plug-in](https://learn.microsoft.com/power-apps/developer/data-platform/write-plug-in#iplugin-interface)). Secure configuration isn't exported with solutions. **[I]** Unsecure configuration travels with the step in the solution, and it's the same in every environment, which is fine here because the logical names don't vary between environments. **VERIFY W-2**.
- **Assembly identity** **[I]**: Dataverse identifies a registered classic assembly by its name plus the major and minor of `AssemblyVersion`. Changing those creates a separate registration, and the existing steps stay on the old one. **VERIFY W-3**: a `FileVersion`-only bump updates in place on import.
- **Solution dependencies** **[D]**: import fails when required components are missing. A managed solution can depend only on managed components ([dependency tracking](https://learn.microsoft.com/power-platform/alm/dependency-tracking-solution-components#solution-component-dependencies)). So the project solution that owns the table must be imported first, and managed downstream. **VERIFY W-4**: the dependencies the steps, filtering attributes and image create.
- **Testing** **[D]**: Microsoft provides no plug-in test framework ([testing tools](https://learn.microsoft.com/power-apps/developer/data-platform/testing-tools-server)). FakeXrmEasy v2 and later is RPL-1.5, noncommercial or paid; v1 is archived. **[O]** A modern .NET project (`net8.0` in the probe; the repo uses `net10.0`, ADR-0006) referencing the .NET Framework plug-in builds and runs on macOS, with warning NU1701.

---

## 4. Design

### 4.1 Step configuration (unsecure, JSON)

```json
{
  "targetTable": "wbsuper_<table>",
  "nameColumn": "wbsuper_wbcodefy",
  "wbCodeLookup": "wbsuper_wbcode",
  "wbCodeValueColumn": "<column on the WBCode table>",
  "fyLookup": "wbsuper_fy",
  "fyValueColumn": "<column on the FY table>"
}
```

- **Schema:** `plugins/WBCodeFYName/config/step-config.schema.json` (JSON Schema). The examples go next to it, and `npm run validate:config` (or its plug-in equivalent) checks them in CI.
- **Runtime checks:** re-validate at runtime. Every property is required, every value must match `^[A-Za-z_][A-Za-z0-9_]*$`, and unknown properties are rejected.

### 4.2 Code shape

Keep the logic pure and the platform edge thin:

- **`NameRules`** (static, pure): `ValidateWBCode`, `ValidateFY`, `Compose(wbCode, fy) → "00224570-26"`. Every rule and message is here.
- **`StepConfig`** (pure): parses and validates the unsecure JSON with `System.Runtime.Serialization.Json` or a hand-written reader (no new package).
- **`SetPrimaryName : IPlugin`**, in this order:
  1. Check the message (Create/Update), the table and that `Target` is an `Entity`.
  2. Resolve each lookup from `Target`, or else from the `PreImage`. A lookup cleared in `Target` stays null.
  3. Reject the save if either lookup is null.
  4. Retrieve each value column as the calling user.
  5. Validate the values, compose the name and set `Target[nameColumn]`.
  6. Wrap unexpected exceptions in a generic `InvalidPluginExecutionException`, and trace the details. Don't trace client data beyond the two codes.
- **Depth:** no depth guard, because the plug-in never calls `Update` on its own row.

### 4.3 Registration

| Step | Message | Stage / mode | Filtering attributes | Pre-image `PreImage` | Rank |
|---|---|---|---|---|---|
| Create | `Create` | PreOperation (20) / synchronous | n/a | none | 20 |
| Update | `Update` | PreOperation (20) / synchronous the configured WBCode lookup, FY lookup and name column | WBCode and FY lookups | 20 |

The image name `PreImage` is case-sensitive. Both steps carry the same unsecure configuration.

---

## 5. Testing

### 5.1 MSTest (no Dataverse)

- **`NameRules`:** valid values; a WBCode that doesn't end in 70; the wrong WBCode length; non-digits; `FY26`, `fy26`, `FY30` and `FY05` accepted; `2026`, `FY2026` and `FY` rejected; surrounding whitespace trimmed.
- **`StepConfig`:** valid config; missing, empty, malformed and unknown properties; a bad logical name.
- **`Execute` through fakes:**
  - Create with both lookups.
  - Create missing either lookup.
  - Update changing only FY, so WBCode comes from the pre-image.
  - Update changing only WBCode.
  - Update clearing a lookup.
  - Update writing only the name, which is recomputed and overwritten.
  - A different table or message, which is ignored.
  - A referenced row with no value.
  - A failure to retrieve, which is wrapped in a generic message.

### 5.2 Dev test matrix (record in `docs/decisions.md`)

| Channel / case | Expected |
|---|---|
| Model-driven form: create, then change FY, then change WBCode | The name is generated and regenerated |
| Power Automate add and update a row | Same as the form |
| Data import (both lookups set; one missing) | Generated; the row with a missing lookup is rejected |
| Web API PATCH of the name only | The name is recomputed and the write is overwritten |
| Duplicate WBCode and FY combination | Rejected by the project's alternate key |
| User without Read on the FY table | The save fails with a clear message |
| Step configuration removed or broken | The save is blocked with the admin message; details in the trace log |
| Reimport after a `FileVersion` bump | The steps stay registered and the new code runs |

---

## 6. Repo changes this needs (do these first)

> Done in #57: [ADR-0006](../adr/0006-plugins-folder.md), the `plugins/*` checks in `check:controls`, CI and release, the README's Plug-ins section and `GLOSSARY.md`. The step-configuration schema check is still to do, in #58.

1. **ADR-0006, `plugins/` for Dataverse plug-ins.** It covers:
   - The layout: `plugins/<Name>/` with the plug-in project, `tests/`, `config/`, `scripts/`, `docs/decisions.md`, `solution/` and `README.md`.
   - Naming: `WB<Name>` solutions, the WilliamBuck publisher, and `<Name>-v<x.y.z>` tags.
   - The exception to ADR-0001: a plug-in solution may depend on a project's table and carries its steps.
   - Prefix-agnostic code with project names in step configuration.
   - The versioning rule.
2. **Convention checks:** extend `scripts/check-controls.mjs` (or add `check-plugins.mjs`, plus tests) to check `plugins/*`:
   - the publisher in `Solution.xml`;
   - that `FileVersion`/`Version` matches `Solution.xml`;
   - that `AssemblyVersion` is `1.0.0.0`;
   - no `wb_` or `wbsuper_` in `.cs` outside comments;
   - the tag name.
3. **CI and release:** CI runs `dotnet build` and `dotnet test` for changed plug-ins on Ubuntu, and builds the solution once registration XML exists. `release.yml` handles `<Name>-v*` tags for plug-ins.
4. **Docs:** a README section for plug-ins (prerequisites: the .NET SDK is enough on macOS; the registration flow); a "Plug-ins" table next to the control catalogue; and GLOSSARY entries for WBCode, FY and WBCodeFY.

## 7. Things NOT to do

- Don't call `service.Update` on the target row, and don't add a depth guard.
- Don't trust a WBCodeFY value supplied by a form, flow or integration.
- Don't use constants for logical names, and don't use secure configuration (it isn't exported).
- Don't run as SYSTEM or a fixed owner.
- Don't change `AssemblyVersion`.
- Don't add FakeXrmEasy or any other NuGet package without sign-off.
- Don't require Visual Studio or Windows to build.
- Don't put the alternate key, form changes or table components in this solution.

## 8. Future ideas (out of scope for v1, don't build)

Propagating or blocking renames of WBCode and FY values; a generic "compose primary name from lookups" plug-in; configurable validation patterns.
