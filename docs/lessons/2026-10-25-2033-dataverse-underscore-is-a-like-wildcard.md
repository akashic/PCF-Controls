---
id: 2026-10-25-2033-dataverse-underscore-is-a-like-wildcard
title: "_ is a one-character wildcard in Dataverse OData endswith, startswith and contains"
applies_when: >
  filtering Dataverse rows with the Web API's endswith, startswith or contains on a
  value that contains an underscore, such as a logical name or a prefixed web resource name
rule: >
  When a Dataverse string filter value contains "_", write each one as "[_]" and still
  check the returned names in code, because Dataverse passes the value to a SQL LIKE in
  which "_" matches any single character.
lesson_type: pitfall
phase: implementation
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
  evidence: "PR #37 (engine/webResource.ts configQuery); controls/GridFormatter/docs/decisions.md V10; issue #35 results comment"
  author:
related: []
proposed_tags: []
---

When a Dataverse Web API filter uses `endswith`, `startswith` or `contains` on a value with an underscore, the underscore matches any character, so the query returns rows it shouldn't.

## What happened
GridFormatter 0.3.0 finds a table's rules with `endswith(name,'_GridFormatter.<table>.json')`. In `LowCode`, `endswith(name,'_ridFormatter/wb_gridspike.json')` matched `wb_/GridFormatter/wb_gridspike.json`, and `endswith(name,'__________________________.js')` returned 50 unrelated scripts. Table logical names and publisher prefixes are full of underscores, so an unescaped suffix can match another table's file.

## Why it happened
Dataverse turns these functions into SQL `LIKE` patterns. Microsoft Learn's "Filter rows using OData" lists `%`, `_`, `[]` and `[^]` as wildcards, but nothing warns that `_` in an ordinary-looking value is one.

## What to do instead
- Escape every `_` as `[_]`: `endswith(name,'[_]GridFormatter.wb[_]gridspike.json')` matched only the real file in `LowCode`, and `'[_]ridFormatter/…'` matched nothing.
- Also check each returned name with an exact regular expression in code, so an escaping slip can't pick the wrong row (`isConfigName` in `engine/webResource.ts`).
- When testing with curl, pass `-g`: otherwise curl treats `[_]` as a URL range and sends a broken request.

## How to recognise it early
A filter value built from a logical name, a prefix or a file name: if it has an underscore and no `[_]`, it's a wildcard.

## When this does NOT apply
`eq` comparisons aren't patterns, so `name eq 'wb_x'` is exact.
