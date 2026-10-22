# ADR-0003: A single canonical `WilliamBuck` publisher

- **Status:** Accepted, confirmed final 2026-10-22 (issue #2)
- **Date:** 2026-10-22

## Context

The publisher prefix is part of every control's logical name (`{prefix}_{namespace}.{ControlName}`) and every environment variable's schema name, and it can't be changed cheaply after the first import. With one solution per control (ADR-0001), every solution declares the publisher separately. `pac solution init` generates a **random** `CustomizationOptionValuePrefix` on every run, so solutions created at different times would disagree unless they are corrected.

## Decision

Every solution in this repo uses exactly this publisher:

| Field | Value |
|---|---|
| Unique name | `WilliamBuck` |
| Display name | `William Buck` |
| Customization prefix | `wb` |
| Option value prefix | `94879` |
| PCF namespace | `Controls` (was `WB` until 22 Oct 2026; see below) |

`scripts/check-controls.mjs` (run in CI) fails any solution that doesn't match. The values in that script are the source of truth.

## Consequences

- Control logical names are `wb_Controls.<ControlName>` (e.g. `wb_Controls.GridFormatter`). Dataverse always includes the namespace in the logical name, and a manifest must have one.
- The publisher was created by hand in the William Buck **dev** environment with these values. WB **UAT** and **prod** have no `wb` publisher. The first managed import creates `WilliamBuck` there from the solution's values, so don't create it by hand.
- `pac pcf push` creates a publisher if none with the prefix exists. In any new environment, import a real solution (or create the publisher by hand with these values) **before** the first `pac pcf push`, so the push doesn't create a mismatched publisher.

## Amendment (22 Oct 2026): namespace `WB` → `Controls`

The product owner changed the PCF namespace from `WB` to `Controls`, so logical names read `wb_Controls.GridFormatter` rather than the doubled `wb_WB.GridFormatter`. The publisher (`WilliamBuck` / `wb` / `94879`) is unchanged. This was done before any control reached a William Buck environment; only the `LowCode` test environment had `wb_WB.*` builds. `scripts/check-controls.mjs` enforces the namespace.
