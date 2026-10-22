---
id: 2026-10-22-2021-manifest-apostrophe-fails-import
title: An apostrophe in a PCF manifest's display or description text fails solution import
applies_when: >
  writing or editing display-name-key or description-key text in a PCF control's
  ControlManifest.Input.xml that will be packaged into a Dataverse solution
rule: >
  When writing manifest *-key text, don't use apostrophes, because the solution
  import validates them against an XSD type that rejects them, and the build doesn't.
lesson_type: pitfall
phase: deployment
domain: [pcf-controls, solutions-alm]
tech: [pcf, dataverse]
scope: this-stack
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-10-22
  source: direct-experience
  evidence: "PR #32 (commit 045dcff), controls/RagChoice/docs/decisions.md \"Solution import\", scripts/check-controls.mjs; issue #7; docs/testing/gridformatter-test-environment.md §9"
  author:
related: []
proposed_tags: []
---

When a PCF control's manifest has an apostrophe in a `display-name-key` or `description-key` value, the solution builds but fails to import into Dataverse.

## What happened
RagChoice 0.1.0's `description-key` was "Choice dropdown that shows each option's configured colour". Lint, tests, `npm run build` and `dotnet build` all passed, but `pac solution import` into `LowCode` failed schema validation (`noAposStringType`).

## Why it happened
Solution import validates the control's manifest attributes against an XSD whose string type excludes apostrophes. Nothing in the local toolchain runs that validation.

## What to do instead
- Reword without the apostrophe ("the configured colour of each option").
- `npm run check:controls` now fails on an apostrophe (or `&apos;`) in any manifest `*-key` attribute; keep that check when adding controls.

## How to recognise it early
An import error naming `noAposStringType`, on a solution whose build was clean.

## When this does NOT apply
Localised strings in `.resx` files weren't tested; this was observed on manifest attributes only.
