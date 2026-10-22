# ADR-0002: npm workspaces monorepo with a shared package

- **Status:** Accepted (bundling spike passed, 2026-10-22, issue #1)
- **Date:** 2026-10-22

## Context

Controls share code (for example, the WCAG colour utilities used by both `GridFormatter` and `RagChoice`) and tooling (ESLint, Jest, TypeScript). PCF projects are self-contained `pcf-scripts` projects that don't natively share code across project roots.

## Decision

The repo root is an npm workspaces root (`packages/*`, `controls/*`). Each control's PCF project folder is a workspace. Shared TypeScript lives in workspace packages under `packages/` (starting with `packages/shared`), imported by controls and bundled into each control's output by `pcf-scripts`. One `npm ci` at the root installs everything; root scripts run `lint`, `test` and `build` across all workspaces.

Shared packages publish their TypeScript source directly (`"main": "src/index.ts"`); there's no separate build step. A control depends on one with `"@wb-pcf/shared": "*"`.

## Spike result

A throwaway React field control importing `@wb-pcf/shared` was built both ways with `pac` 2.14.1, `pcf-scripts` 1.51.1 and `Microsoft.PowerApps.MSBuild.Pcf` 1.52.1:

- **`pcf-scripts build` bundles the workspace package.** webpack follows the workspace symlink to `../../packages/shared/src/*.ts` and compiles it with the control's TypeScript settings. The shared code appears in `bundle.js`, and React stays external (the `Reactv16` platform library).
- **`dotnet build` of the solution works**, and the managed and unmanaged zips contain the bundled shared code. This needs one change (below).

Because `node_modules` is hoisted to the repo root, three `pac pcf init` defaults must change in every control. `scripts/check-controls.mjs` enforces the first two:

1. **`.pcfproj`: set `<PcfEnableAutoNpmInstall>false</PcfEnableAutoNpmInstall>`.** Otherwise MSBuild runs `npm install` and then fails with `MSB3375: The file "node_modules/pcf-scripts/package.json" does not exist`, because it looks for `node_modules` inside the control folder. Dependencies come from the root `npm ci` instead.
2. **`tsconfig.json`: extend `"pcf-scripts/tsconfig_base.json"` and set `"typeRoots": ["../../node_modules/@types"]`.** The generated `./node_modules/...` paths don't resolve. ESLint then reports misleading errors (`strictNullChecks` is off, `ComponentFramework` has an `error` type) instead of a missing-file error.
3. Delete the control's generated `.gitignore` (the root one covers it), and never commit a `package-lock.json` inside a control folder.

## Consequences

- One lockfile and one install for the whole repo; dependency versions can be kept aligned across controls.
- Every control's build depends on `npm ci` having run at the repo root first (CI does this).
- Each control declares React and Fluent as platform libraries, so the platform supplies them at runtime and they are never bundled. Shared packages must therefore take React and Fluent as peer dependencies only.
- Shared code is compiled with each control's TypeScript settings, so it must stay compatible with the `pcf-scripts` base config (ES2020, strict).
