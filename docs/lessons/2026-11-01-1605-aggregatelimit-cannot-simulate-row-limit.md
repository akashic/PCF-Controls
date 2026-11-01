---
id: 2026-11-01-1605-aggregatelimit-cannot-simulate-row-limit
title: "aggregatelimit can't simulate Dataverse's 50,000-row aggregate error"
applies_when: >
  trying to reproduce or test the 8004E023 (AggregateQueryRecordLimit) error of an aggregate FetchXML
  query without creating more than 50,000 rows
rule: >
  When testing handling of the 50,000-row aggregate error, don't use aggregatelimit as a stand-in,
  because with a distinct grouped count it fails with a generic SQL error (0x80044150) and otherwise
  quietly counts a subset; only a real 50,000+ row query raises 8004E023.
lesson_type: pitfall
phase: testing
domain: [testing, dataverse-metadata]
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
  evidence: "PR #73 (commit 57bcd2e); controls/ChoiceCounts/docs/decisions.md C-3; scripts/test-env/capture-choicecounts-fixtures.mjs comment"
  author:
related: []
proposed_tags: []
---

When an aggregate FetchXML query gets `aggregatelimit="1"` to provoke the over-50,000-rows error cheaply, Dataverse doesn't return `8004E023`.

## What happened
For ChoiceCounts C-3 (issue #52 suggested `aggregatelimit` as a stand-in), the control's query was run in `LowCode` with the attribute added:
- With `countcolumn distinct="true"` and `groupby`: HTTP 500 `0x80044150` "Sql error: Generic SQL error … Sql Number: 156".
- With a plain grouped `count`, or an ungrouped distinct count: HTTP 200 with a partial count (2 instead of 9). No error at all, as the brief warned.

## Why it happened
`aggregatelimit` caps the rows the aggregate considers rather than simulating the platform limit. Combined with a distinct count, it produces SQL that fails.

## What to do instead
- Unit-test the detection against Microsoft's documented code (`-2147164125` / `0x8004E023`) and message (`AggregateQueryRecordLimit`).
- Make anything else fall back to the generic "unavailable" state, so a wrong guess only changes the tooltip.
- Only create 50,000+ rows for a real test if the environment's capacity allows it.

## When this does NOT apply
Deliberately counting a subset, which `aggregatelimit` exists for. Never use it in production counts.
