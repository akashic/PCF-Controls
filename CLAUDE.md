# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

William Buck's long-term monorepo for PCF (Power Apps Component Framework) controls used in Dataverse model-driven apps, deployed dev → UAT → prod. It will move from `akashic/PCF-Controls` to the `William-Buck-Australia` enterprise GitHub org, so don't hard-code the org or repo name anywhere.

`README.md` is the team's standard for PCF development and deployment (conventions, commands, adding a control, release and deploy steps). Read it before structural work, and keep it current when conventions change. Decisions behind the layout are in `docs/adr/`. Product-owner briefs for each piece of work are in `docs/briefs/`.

Two controls exist, both at 0.1.0: `GridFormatter` and `RagChoice`, specified in `docs/briefs/2026-10-21-grid-formatting-and-rag-choice.md`. Work continues from the GitHub issues. The brief's §4.2 layout and single `WBGridFormatting` solution are **superseded** by the layout below.

## Commands

Run from the repo root (npm workspaces). Workspace names are `@wb-pcf/<kebab-name>`.

```sh
npm ci                                            # installs every control and package
npm run lint | npm test | npm run build           # across all workspaces
npm run build -w @wb-pcf/rag-choice               # one control (same for lint, test)
npm test -w @wb-pcf/rag-choice -- tests/x.test.ts # a single test file
npm run start:watch -w @wb-pcf/rag-choice         # PCF test harness (field controls only)
npm run check:controls                            # publisher + version conventions (also in CI)
dotnet build controls/<ControlName>/solution -c Release   # managed + unmanaged zips in solution/bin/Release
cd controls/<ControlName> && pac pcf push --publisher-prefix wb   # dev environment only
```

Jest settings are shared through the root `jest.config.base.js`. Each workspace's `jest.config.js` spreads it and sets its own coverage thresholds (`packages/shared` requires 100%).

`pac` is a .NET global tool at `~/.dotnet/tools/pac` (2.14.1). If `pac` isn't found in a non-login shell, call it by that full path.

## Architecture

- **One control = one folder = one PCF project = one npm workspace = one Dataverse solution** ([ADR-0001](docs/adr/0001-one-solution-per-control.md)). `controls/<ControlName>/` holds the pcfproj, the control source in `controls/<ControlName>/<ControlName>/`, Jest tests in `tests/`, spike write-ups in `docs/decisions.md`, and the solution in `solution/` (unique name `WB<ControlName>`). A control's solution contains only the control and its own environment variables. Adding a control to a table's form or view belongs to the *project's* solution, not this repo's.
- **Shared code** lives in `packages/shared` (`@wb-pcf/shared`, TypeScript source, no build step) and is bundled into each control by `pcf-scripts` ([ADR-0002](docs/adr/0002-npm-workspaces-monorepo.md)). Colour utilities take a branded `HexColor` that only `normalizeHex` produces, so untrusted colours are validated once and nothing downstream throws.
- **Hoisted `node_modules` breaks two `pac pcf init` defaults.** Every control's `.pcfproj` needs `<PcfEnableAutoNpmInstall>false</PcfEnableAutoNpmInstall>`, and its `tsconfig.json` must extend `pcf-scripts/tsconfig_base.json` with `typeRoots: ["../../node_modules/@types"]`. `check:controls` enforces both. A broken tsconfig shows up as misleading ESLint errors (`strictNullChecks`, `error`-typed `ComponentFramework`).
- **Controls are virtual (React) controls.** React and Fluent come from the platform as `<platform-library>` entries and must never be bundled. Shared packages take them as peer dependencies only.
- **Configuration, not code:** controls are reused across projects, so they never hard-code table or column names, option values or colours. Values that vary per environment go in a `wb_<ControlName><Purpose>` environment variable inside the control's solution, validated by a JSON Schema in the control's `config/`. GridFormatter's rules are the exception: environment variables max out at 2,000 characters, so they live in a JSON web resource per table, `<prefix>_GridFormatter.<table>.json`, in the project's solution ([ADR-0004](docs/adr/0004-gridformatter-config-per-table-web-resource.md)).
- **Prefix-agnostic:** a control never assumes the publisher prefix of the project using it. Anything the project supplies is found under any prefix; `wb_` is only for the control's own solution components ([ADR-0005](docs/adr/0005-prefix-agnostic-controls.md)). `check:controls` fails on `wb_` in control source outside comments.

## Repo-specific rules and gotchas

- **Publisher must match everywhere** ([ADR-0003](docs/adr/0003-wb-publisher.md)): `WilliamBuck` / `wb` / option value prefix `94879`, PCF namespace `Controls` (logical names `wb_Controls.<ControlName>`). `pac solution init` writes a *random* `CustomizationOptionValuePrefix` every run. Always replace it, then run `npm run check:controls`.
- **Versions live in three places and must agree:** the manifest `<control version>`, `package.json` `version`, and `Solution.xml` `<Version>` (`x.y.z.0`). Bump the manifest version on every deployment, or Dataverse may keep serving the cached bundle. Release by tagging `<ControlName>-v<x.y.z>`.
- **Declare Fluent `9.46.2`, not `pac`'s `9.68.0`:** `pac` 2.14.1 generates `<platform-library name="Fluent" version="9.68.0">` and `"@fluentui/react-components": "9.68.0"`. Change both to `9.46.2`, the highest version Microsoft Learn documents as supported (it loads `9.68.0` at runtime), and keep the npm pin exact in `devDependencies`. Don't use Fluent APIs newer than 9.46.2. Microsoft's grid customizer template declares Fluent 8 but doesn't import it, so the GridFormatter declares Fluent 9 too, unless the #9 spike shows Fluent 9 doesn't work in the grid. Sources: [docs/research/fluent-platform-library-version.md](docs/research/fluent-platform-library-version.md).
- **Grid customizers:** only one per grid, renderers must be pure and idempotent, never mutate grid data, and don't override editors. The local harness can't host them, so test in the dev environment. The test table, scripts and browser-testing procedure are in [docs/testing/gridformatter-test-environment.md](docs/testing/gridformatter-test-environment.md); read it before testing in Dataverse.
- **No new npm packages without approval** (managed corporate environment). Anything beyond the Microsoft template dependencies plus Jest goes in the PR description for sign-off.
- **VERIFY items in briefs** are platform unknowns. Prove them with a spike in dev and record the outcome in the control's `docs/decisions.md` before building on them.
- Everything must build on macOS. No Visual Studio-only MSBuild steps; `dotnet build` is fine.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues on `akashic/PCF-Controls` (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`, created lazily as needed. See `docs/agents/domain.md`.
