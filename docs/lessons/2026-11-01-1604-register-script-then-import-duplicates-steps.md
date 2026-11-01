---
id: 2026-11-01-1604-register-script-then-import-duplicates-steps
title: "Registering a plug-in by script and then importing its solution duplicates the steps"
applies_when: >
  a plug-in already has registration XML synced into solution/src, and someone is about to run its
  Web API registration script (or the Plug-in Registration Tool) in an environment that will also
  import that solution
rule: >
  When a plug-in's solution/src exists, deploy it to every environment only by importing the
  solution, never by running the registration script there, because the script creates components
  with new IDs and the import then fails on the assembly or adds a second pair of steps.
lesson_type: pitfall
phase: deployment
domain: [plugins, solutions-alm]
tech: [dataverse, dataverse-web-api, pac-cli]
scope: this-project
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-01
  source: pr-review
  evidence: "Code review of PR #66; fix in commit 5de661f (README, CLAUDE.md, ADR-0006 amendment, register.mjs header)"
  author:
related: [2026-11-01-1604-plugin-import-needs-activate-plugins]
proposed_tags: []
---

When a plug-in's registration XML is already in `solution/src` and someone also runs the registration script in an environment that will import that solution, they get two sets of components with different IDs.

## What happened
The first README draft said to register a plug-in with `scripts/register.mjs` and then import the solution. The branch review (PR #66) pointed out that `solution/src` carries `LowCode`'s component IDs. Doing both in dev would fail on the `WBCodeFYName` assembly, or would add a second Create/Update pair, so the plug-in would run twice per save.

## Why it happened
Solution import matches components by ID. A script registration creates new IDs, so Dataverse sees two different steps on the same message and table.

## What to do instead
- Run the script once, in dev or a test environment, to make the first registration, then `pac solution sync`.
- After that, every environment, dev included, gets the plug-in only from `pac solution import --activate-plugins`.
- The first sync may come from a test environment (ADR-0006 §6, amended 1 Nov 2026).

## How to recognise it early
The PR or runbook says "run register.mjs" for an environment that also receives `WB<Name>.zip`. Or `pluginassemblies?$filter=name eq '<Name>'` returns two rows.

## When this does NOT apply
Scratch environments that never import the solution, or rebuilding `solution/src` from scratch on purpose.
