# ADR-0002: npm workspaces monorepo with a shared package

- **Status:** Accepted, pending the bundling spike (see below)
- **Date:** 2026-10-22

## Context

Controls share code (for example, the WCAG colour utilities used by both `GridFormatter` and `RagChoice`) and tooling (ESLint, Jest, TypeScript). PCF projects are self-contained `pcf-scripts` projects that don't natively share code across project roots.

## Decision

The repo root is an npm workspaces root (`packages/*`, `controls/*`). Each control's PCF project folder is a workspace. Shared TypeScript lives in workspace packages under `packages/` (starting with `packages/shared`), imported by controls and bundled into each control's output by `pcf-scripts`. One `npm ci` at the root installs everything; root scripts run `lint`, `test` and `build` across all workspaces.

## Consequences

- One lockfile and one install for the whole repo; dependency versions can be kept aligned across controls.
- **Must be proven before relying on it:** that `pcf-scripts build` (webpack) bundles TypeScript from a workspace package, and that `dotnet build` of a control's solution works when `node_modules` is hoisted to the root. If either fails, the fallback is a relative import of `packages/shared/src` from the control, and this ADR is updated with the result.
- Each control declares React and Fluent as platform libraries, so the platform supplies them at runtime and they are never bundled. Shared packages must therefore list React and Fluent as peer dependencies only.
