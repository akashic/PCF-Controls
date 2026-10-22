---
id: 2026-10-22-2034-parallel-agents-separate-test-artefacts
title: Parallel agents testing in LowCode each need their own test form
applies_when: >
  two agents or subagents test different controls in the LowCode test environment at the same time, on the same test table
rule: >
  When agents test in parallel on the same table, give each its own form (and its own test columns or rows) and look forms up by name, because shared forms get edited from two sides and scripts that take the first form pick up the other agent's.
lesson_type: convention
phase: testing
domain: [agent-workflow, testing]
tech: [dataverse, claude-in-chrome]
scope: this-project
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires: 
provenance:
  projects: [pcf-controls]
  date: 2026-10-22
  source: direct-experience
  evidence: "issue #7 and PR #32 (scripts/test-env/add-ragchoice-form.mjs); PR #31; docs/testing/gridformatter-test-environment.md §4.8"
  author:
related: [2026-10-22-2022-find-forms-by-name-not-type]
proposed_tags: []
---

When two agents test different controls in `LowCode` at the same time on the `wb_gridspike` table, they can break each other's setup unless each has its own form and test data.

## What happened
While the main session fixed the GridFormatter subgrid bug (#30) on the table's "Information" form, a subagent tested RagChoice (#7). It created its own main form, "RagChoice test", with `add-ragchoice-form.mjs`, plus its own column `wb_raghiddentest` and its own test rows (040, 041). Neither agent's checks were disturbed. The one collision was a script that took the first main form, fixed by looking forms up by name (#31).

## Why it works
Form XML is edited as a whole: two agents patching the same form overwrite each other's changes. A separate form also keeps the table's main form as it is for everyone else.

## What to do instead
- One form per agent or task, created by an idempotent script.
- Separate test columns and rows for data the agent changes.
- Look forms up by name and open records with `&formid=<id>`.
- Publishing and imports can still collide ("schema customization request is currently being ran"); retry after about 30 seconds.

## When this does NOT apply
Read-only checks on shared views, which don't change the environment.
