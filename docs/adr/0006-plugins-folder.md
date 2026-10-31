# ADR-0006: Dataverse plug-ins live in `plugins/`, one solution per plug-in

- **Status:** Accepted (adds an exception to ADR-0001 for plug-ins)
- **Date:** 2026-10-31

## Context

The repo was built for PCF controls: npm workspaces, `pac pcf`, a manifest, and one solution per control (ADR-0001). The first plug-in, `WBCodeFYName` ([brief](../briefs/2026-10-31-wbcodefy-name-plugin.md)), is C# for .NET Framework, with no manifest and no npm. The product owner decided it lives in this repo, not in the project's own repo, in a new top-level folder rather than in `controls/`.

A plug-in is also tied to a table in a way a control isn't. A control is a component that a project wires up on its own forms. A plug-in's **steps** name the message, the table, the filtering attributes and the pre-image, and those are part of how the plug-in behaves, not optional wiring.

What we found on 31 Oct 2026 (details in the brief, §3):
- The Plug-in Registration Tool and `pac tool` run only on Windows.
- `pac plugin push` only updates an assembly that's already registered.
- A solution project that references a plug-in project won't build until the registration XML is in its source.
- `pac plugin init` and `dotnet build` work on macOS, producing a strong-name-signed DLL. `pac` 2.14.1 targets `net48`, which Microsoft recommends for plug-ins (it supports 4.6.2 to 4.8, and 4.6.2 support ends in January 2027: [supported customizations](https://learn.microsoft.com/power-apps/developer/data-platform/supported-customizations#support-for-net-framework-versions)).

## Decision

1. **Layout.** Each plug-in lives in `plugins/<Name>/`:

   ```
   plugins/<Name>/
   ├── README.md          # what it does, project prerequisites, step configuration, changelog
   ├── <Name>/            # `pac plugin init` here: <Name>.csproj, <Name>.snk, the plug-in classes
   ├── tests/             # MSTest project, net10.0, hand-written fakes of the Microsoft.Xrm.Sdk interfaces
   ├── config/            # JSON Schema for the step configuration, plus examples
   ├── scripts/           # registration script (Web API), run against dev only
   ├── docs/decisions.md  # spike outcomes
   └── solution/          # WB<Name>.cdsproj + src/ (registration XML synced from dev)
   ```

   - **Project in a subfolder.** The project sits in `plugins/<Name>/<Name>/`, like a control's source in `controls/<X>/<X>/`. An SDK-style project compiles every `.cs` below it, so the tests must not sit inside it.
   - **Names.** `pac plugin init` uses the folder name as the C# namespace, so `<Name>` must be a valid C# identifier. Class names describe the step (e.g. `SetPrimaryName`) and must differ from the namespace.
   - **Tests.** They target `net10.0` so only the .NET 10 SDK from the README is needed. Test packages need sign-off, like any new package.
2. **Naming.** Plug-ins follow the controls' conventions: PascalCase `<Name>`, solution `WB<Name>` with the WilliamBuck publisher (ADR-0003), and release tags `<Name>-v<x.y.z>`. A tag can name a control or a plug-in, so the two can't share a name.
3. **Solution contents: an exception to ADR-0001.** A plug-in's solution holds the assembly, **its steps and images, and their unsecure configuration**. It may therefore depend on a table in a project's solution, which must be imported first (managed downstream). Everything else that changes the table, such as alternate keys, forms, columns and security roles, stays in the project's solution. The plug-in's README lists those things as prerequisites.
4. **Prefix-agnostic code.** The C# never contains a project's logical names. Table and column names come from the step's **unsecure configuration** (JSON), which is validated against `config/`'s schema and again at runtime. A bad configuration blocks the save, because a plug-in that skips its work corrupts data, unlike a control that falls back to its default. Secure configuration isn't used, because it isn't exported with solutions.
5. **Classic signed `net48` assemblies, frozen `AssemblyVersion`.** Plug-ins target .NET Framework 4.8 and ship as classic strong-name-signed assemblies unless a plug-in needs dependent assemblies, which would need a new decision. `AssemblyVersion` stays `1.0.0.0`, because Dataverse treats an assembly whose major or minor version changes as a new assembly. The semver lives in `<FileVersion>x.y.z.0</FileVersion>` and in `Solution.xml`, and they must match.
6. **Registration from macOS.** The first registration in dev is done by a Web API script in `scripts/`. Then `pac solution sync` brings the registration XML into `solution/src/`, and from then on `dotnet build` builds the solution. Visual Studio and Windows aren't required.
7. **Checks, CI and release.**
   - **Conventions:** `npm run check:controls` also checks `plugins/*`: signing, the `1.0.0.0` `AssemblyVersion`, version agreement, a test project, the publisher once the solution exists, and no custom logical names (`<prefix>_<name>`) in C# string literals outside comments.
   - **Unscaffolded folders:** a folder without `<Name>/<Name>.csproj` yet gets a warning, not a failure, so a brief can land before the scaffold.
   - **CI:** builds and tests each changed plug-in on Ubuntu, and builds its solution once `solution/src/PluginAssemblies` exists.
   - **Release:** `release.yml` handles plug-in tags the same way as control tags.

## Considered options

- **Keep the plug-in in the project's own repo.** It was recommended, because the plug-in is specific to one project's table. The product owner chose this repo so William Buck's Dataverse components share one set of conventions and pipelines.
- **Put plug-ins in `controls/`.** Rejected: the folder means "an npm workspace with a PCF manifest" to the scripts and CI, and a plug-in is neither.
- **Steps in the project's solution**, as controls are wired up. Rejected: steps are part of the plug-in, and a release that changes filtering attributes or configuration would need a matching change to the project's solution.
- **Constants for logical names.** Rejected: it breaks the rule that code doesn't assume a project's prefix (ADR-0005), and every new environment or table would need a rebuild.
- **NuGet plug-in packages.** Microsoft's recommended default, but we don't need dependent assemblies, and how a solution project handles packages is unproven. We can revisit if a plug-in needs a dependency.
- **The Plug-in Registration Tool on Windows.** Rejected as the routine path, because every change to a step would need a Windows machine. It's still a fallback if the Web API script fails.
- **FakeXrmEasy for tests.** Rejected: v2 and later is RPL, noncommercial or paid, and v1 has been archived since June 2024.

## Consequences

- **The repo isn't PCF-only any more.** README, CLAUDE.md and the catalogue cover both kinds of component, and this ADR overrides ADR-0001 for plug-ins only.
- **Import order** for a project using a plug-in: the project solution with the table, then `WB<Name>`. This is the reverse of controls, whose solutions come first.
- **Unsecure configuration is the same in every environment** for a given solution version, which suits logical names. Anything that really varies by environment would need an environment variable, which would mean amending this ADR.
- **A plug-in's solution can't be built in CI until its first registration is synced.** Until then CI builds and tests only the assembly.
- **Hard-coded name check:** the check reads C# string literals with a small scanner (regular, verbatim and interpolated strings; not C# 11 raw strings, which .NET Framework's default language version, C# 7.3, can't use). A literal such as `"abc_x"` that isn't a logical name will be flagged as one. If that's a real case, rephrase the string; don't weaken the check.
