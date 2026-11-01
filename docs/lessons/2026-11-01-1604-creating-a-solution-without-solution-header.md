---
id: 2026-11-01-1604-creating-a-solution-without-solution-header
title: "Creating a solution through the Web API fails if you send the solution header"
applies_when: >
  a Web API script creates a Dataverse solution and also adds the MSCRM.SolutionUniqueName header to
  its requests so new components land in that solution
rule: >
  When a script creates a solution through the Web API, leave the MSCRM.SolutionUniqueName header off
  that one request, because Dataverse rejects it with 0x80040217 "The given solution unique name is
  not valid" while the solution doesn't exist yet.
lesson_type: pitfall
phase: implementation
domain: [solutions-alm, dataverse-metadata]
tech: [dataverse-web-api]
scope: this-stack
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-01
  source: direct-experience
  evidence: "PR #66 (commit 24d8783); plugins/WBCodeFYName/scripts/register.mjs write(..., { inSolution: false }); decisions.md W-1 findings"
  author:
related: []
proposed_tags: []
---

When a Web API script sends `MSCRM.SolutionUniqueName: <name>` on every write and one of those writes creates that solution, the create fails with `0x80040217`.

## What happened
`register.mjs`'s first run in `LowCode` failed at `POST solutions` with 404 `0x80040217` "The given solution unique name (WBWBCodeFYName) is not valid". The shared write helper always added the header.

## Why it happened
Dataverse resolves the header before it handles the request body, and the named solution didn't exist yet.

## What to do instead
Give the write helper an opt-out, for example `{ inSolution: false }`, and use it for `POST solutions` only. Every later component create keeps the header.

## When this does NOT apply
Scripts that create the solution by importing a seed solution zip, or that don't use the header at all.
