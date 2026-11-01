---
id: 2026-11-01-1604-plugin-import-needs-activate-plugins
title: "Importing a plug-in solution without --activate-plugins leaves its steps disabled"
applies_when: >
  importing a solution that contains plug-in steps with pac solution import, in any environment,
  including re-importing over steps that are already enabled
rule: >
  When importing a solution that carries plug-in steps, always pass --activate-plugins to
  pac solution import, because without it Dataverse imports the steps disabled and the plug-in
  silently stops running while saves keep succeeding.
lesson_type: pitfall
phase: deployment
domain: [plugins, solutions-alm]
tech: [dataverse, pac-cli]
scope: this-stack
cost_if_ignored: outage
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-01
  source: direct-experience
  evidence: "PR #66 (commit 24d8783); plugins/WBCodeFYName/docs/decisions.md W-3; README Deployment"
  author:
related: []
proposed_tags: []
---

When a solution containing plug-in steps is imported with `pac solution import` and no `--activate-plugins`, the import leaves every step **disabled**. Saves still succeed, but the plug-in no longer runs.

## What happened
For W-3, the WBCodeFYName solution (FileVersion bumped) was imported into `LowCode` over steps that were enabled. Both steps were then disabled, and a new SMSF Matter row saved with no name. Re-importing with `--activate-plugins` enabled them again.

## Why it happened
Exported step XML (`src/SdkMessageProcessingSteps/{id}.xml`) has no state, and the import doesn't activate steps unless asked. `pac solution import --help` describes the flag as "Activate plug-ins and workflows on the solution".

## What to do instead
- Every plug-in import: `pac solution import --path WB<Name>_managed.zip --activate-plugins`. It's in the README, CLAUDE.md and the plug-in runbook.
- After any import, check `sdkmessageprocessingstep.statecode` for the plug-in's steps.
- In a scratch environment, re-running `plugins/<Name>/scripts/register.mjs` also re-enables disabled steps.

## How to recognise it early
Rows save without the plug-in's effect and no error appears. `pac org fetch` on the steps shows `Disabled`.

## When this does NOT apply
Solutions with no plug-in steps or flows, such as PCF control solutions.
