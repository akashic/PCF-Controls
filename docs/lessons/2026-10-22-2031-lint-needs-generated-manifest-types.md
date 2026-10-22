---
id: 2026-10-22-2031-lint-needs-generated-manifest-types
title: PCF lint fails on a fresh checkout without refreshTypes first
applies_when: >
  adding a PCF control to this repo, or lint reports `error`-typed values on a clean checkout or in CI
rule: >
  When adding a control, set its lint script to `pcf-scripts refreshTypes && pcf-scripts lint`, because `generated/ManifestTypes.d.ts` is git-ignored and CI lints before building, so plain lint fails with misleading type errors.
lesson_type: pitfall
phase: implementation
domain: [pcf-controls, ci]
tech: [pcf, github-actions]
scope: this-stack
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires: 
provenance:
  projects: [pcf-controls]
  date: 2026-10-22
  source: direct-experience
  evidence: "PR #19 (lint script note); commit 35407f6; README.md Adding a new control (line 129)"
  author:
related: []
proposed_tags: []
---

When a PCF control's lint runs before its first build, as in CI or on a fresh checkout, ESLint fails with errors about `error`-typed values, because the generated manifest types don't exist yet.

## What happened
RagChoice's lint failed in CI (#19) and GridFormatter hit the same thing later (commit 35407f6, "same fix as RagChoice"). `generated/ManifestTypes.d.ts` is created by the build and git-ignored, and CI lints before it builds.

## Why it happened
`index.ts` imports `IInputs`/`IOutputs` from the generated file. Without it, TypeScript types them as errors, and typed lint rules report every use.

## What to do instead
- Each control's `package.json`: `"lint": "pcf-scripts refreshTypes && pcf-scripts lint"`. The repo README's "Adding a new control" lists it.

## How to recognise it early
Lint errors that mention `error`-typed values or unsafe member access on `IInputs`, before any build has run. A broken `tsconfig.json` gives similar errors (see CLAUDE.md), so check for the `generated/` folder first.

## When this does NOT apply
Locally after any build, when the generated file already exists.
