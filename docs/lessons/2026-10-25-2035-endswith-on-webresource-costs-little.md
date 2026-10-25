---
id: 2026-10-25-2035-endswith-on-webresource-costs-little
title: A leading-wildcard endswith on webresource costs about 0.1–0.2 s at ~20k rows
applies_when: >
  deciding whether a control or script may query a small system table such as
  webresource with endswith, startswith or contains, despite Microsoft's guidance
  against leading wildcards
rule: >
  When a leading-wildcard filter would run once per page on a table of tens of thousands
  of rows, such as webresource, measure it before rejecting it, because in LowCode it
  cost only about 0.1–0.2 s more than an exact name.
lesson_type: estimate
phase: design
domain: [dataverse-metadata, grid-customizer]
tech: [dataverse-web-api, dataverse]
scope: this-stack
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-10-25
  source: direct-experience
  evidence: "controls/GridFormatter/docs/decisions.md V10; ADR-0005 (Considered options, Consequences); PR #37"
  author:
related: [2026-10-25-2034-basic-user-cannot-read-publisher, 2026-10-25-2033-dataverse-underscore-is-a-like-wildcard]
proposed_tags: []
---

When a design would query a system table like `webresource` with a leading-wildcard filter (`endswith`, `contains`), Microsoft's anti-pattern guidance suggests avoiding it, but on a table of about 20,000 rows it cost little.

## What happened
For #35, GridFormatter needed to find `<any prefix>_GridFormatter.<table>.json`. In `LowCode` (20,782 web resources, counted with a FetchXML aggregate), three runs from a laptop took 0.74–1.02 s with `endswith`, 0.74–0.80 s with an `endswith` that matched nothing (a full scan), and 0.62–0.72 s with an exact `name eq`. The difference was about 0.1–0.2 s, once per table per page, so ADR-0005 uses `endswith` alone.

## Why it happened
The table is small by SQL standards, and most of each request's time was network round trip. Microsoft's guidance ("Query anti-patterns", "Filter rows using OData") targets large tables, where leading wildcards scan and Dataverse throttles them.

## What to do instead
- Measure first: time the exact and wildcard queries a few times each with `curl -w "%{time_total}"`, and count the table's rows.
- Run the query once per page and cache it, not once per row or render.
- Revisit if an environment is much larger or starts returning `DataEngineLeadingWildcardQueryThrottling` or `LeadingWildcardCauseTimeout`.

## When this does NOT apply
Business data tables with hundreds of thousands of rows or more, or queries run per row: there the anti-pattern guidance holds.
