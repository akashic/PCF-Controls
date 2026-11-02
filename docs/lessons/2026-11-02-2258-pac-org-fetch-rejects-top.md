---
id: 2026-11-02-2258-pac-org-fetch-rejects-top
title: "pac org fetch rejects FetchXML with top; limit rows with count instead"
applies_when: >
  writing a pac org fetch command, in a runbook or a check, that limits the result with
  <fetch top='n'>
rule: >
  When a FetchXML query runs through pac org fetch, limit rows with count='n' instead of top='n',
  because pac adds a page attribute to page through results and Dataverse rejects top together
  with page.
lesson_type: pitfall
phase: deployment
domain: [solutions-alm]
tech: [pac-cli, dataverse]
scope: this-stack
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-02
  source: direct-experience
  evidence: "PR #80 (commit dc3fb83): plugins/WBCodeFYName/docs/runbook.md §2 column check changed from top='1' to count='1'"
  author:
related: []
proposed_tags: []
---

When a `pac org fetch --xml` command limits its rows with `<fetch top='1'>`, it fails with `Error: The top attribute can't be specified with paging attribute page`, so a runbook check fails before it tests anything.

## What happened
The WBCodeFYName runbook's pre-import check ran `pac org fetch --xml "<fetch top='1'><entity name='wbsuper_smsfmatter'>…"` to prove the columns exist. Run against a William Buck environment, it failed with that error instead of returning a row. Switching to `count='1'` worked, and the runbook was changed in #80.

## Why it happened
`pac org fetch` pages through the results itself by adding `page` to the `<fetch>` element. FetchXML doesn't allow `top` with paging attributes. `count` is the page size, so it's compatible.

## What to do instead
- Use `<fetch count='1'>` in `pac org fetch` commands.
- Or leave the limit off when the query is read-only and the table is small.

## When this does NOT apply
FetchXML sent straight to the Web API (`?fetchXml=`) or through the SDK without paging, where `top` is fine.
