# ADR-0001: One Dataverse solution per control

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

This repo is the long-term home for every PCF control built for William Buck projects. Different projects need different subsets of controls, and controls change at different rates. The original brief for the first two controls (`docs/briefs/2026-10-21-grid-formatting-and-rag-choice.md`) bundled `GridFormatter` and `RagChoice` into one `WBGridFormatting` solution. `RagChoice` works with any colour-coded choice column, so it is useful on its own.

## Decision

Each control lives in `controls/<ControlName>/` and owns exactly one solution, `WB<ControlName>`, in `controls/<ControlName>/solution/`. The solution holds the control plus anything only that control needs (for example, `GridFormatter`'s `wb_GridFormatConfig` environment variable). Each control is versioned and released on its own (tag `<ControlName>-v<x.y.z>`).

## Consequences

- A project installs only the controls it uses, and upgrading one control never redeploys another.
- More solutions to import. If a project needs several controls together, a Power Platform **package** or deployment pipeline can group them later without changing this repo's layout.
- A control must not depend on components in another control's solution. Shared *code* goes in `packages/shared` and is bundled into each control (ADR-0002). Shared *Dataverse components* would need a new decision.
- Table and form settings that *use* a control (for example, the grid's `Customizer control` property) belong to the project solution that owns that table, not to the control's solution.
