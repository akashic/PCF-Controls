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
| PCF namespace | `WB` |

`scripts/check-controls.mjs` (run in CI) fails any solution that doesn't match. The values in that script are the source of truth.

## Consequences

- Control logical names are `wb_WB.<ControlName>`.
- The publisher was created by hand in the William Buck **dev** environment with these values. WB **UAT** and **prod** have no `wb` publisher. The first managed import creates `WilliamBuck` there from the solution's values, so don't create it by hand.
- `pac pcf push` creates a publisher if none with the prefix exists. In any new environment, import a real solution (or create the publisher by hand with these values) **before** the first `pac pcf push`, so the push doesn't create a mismatched publisher.
