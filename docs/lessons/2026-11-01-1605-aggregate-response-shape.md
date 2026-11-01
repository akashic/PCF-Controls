---
id: 2026-11-01-1605-aggregate-response-shape
title: "Grouped aggregate rows: blank group has no key, Yes/No groups are booleans, label order"
applies_when: >
  reading the response of a grouped aggregate FetchXML query (countcolumn with groupby on a choice,
  status or Yes/No column) from the Dataverse Web API or PCF retrieveMultipleRecords
rule: >
  When reading a grouped aggregate response, treat a missing group key as the blank group, map
  true/false group values to 1/0 for Yes/No, and re-order by metadata, because Dataverse omits the
  alias for blanks, returns booleans for Yes/No and sorts rows by label rather than value.
lesson_type: pitfall
phase: implementation
domain: [pcf-controls, dataverse-metadata]
tech: [dataverse-web-api, pcf]
scope: this-stack
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-01
  source: direct-experience
  evidence: "PR #71 (commit 0f83221) and PR #73 (commit 57bcd2e): controls/ChoiceCounts/tests/fixtures/aggregate-*.json; decisions.md C-3"
  author:
related: []
proposed_tags: []
---

When code reads a grouped aggregate FetchXML response, three details differ from what's easy to assume.
- The blank group's row has **no group key at all**, rather than `null`.
- Yes/No groups arrive as **`true`/`false`**.
- Rows are ordered by **label**, not value.

## What happened
Real responses captured from `LowCode` for ChoiceCounts (Choice, Status Reason, Status, Yes/No):
- The row for tasks with no RAG had only `choicecounts_count` and its annotations, with no `choicecounts_group`.
- Yes/No groups were `false` (8) and `true` (2).
- The Choice rows came back in the order Amber, Green, Red.
- Each count and group carried `@OData.Community.Display.V1.FormattedValue` and `AttributeName` annotations.

The original hand-written fixtures had used `null` groups and `@odata.etag`, neither of which Dataverse sends.

## What to do instead
- Treat `undefined` and `null` group values alike as blank, and drop them.
- Map `true`/`false` to `1`/`0`.
- Accept only a whole number as the count.
- Merge with the column's metadata, so order and zero counts come from the options, not the response.
- Capture real responses as Jest fixtures (`Prefer: odata.include-annotations="*"`) instead of writing them by hand.

## When this does NOT apply
Non-grouped aggregates, which return one row with no group alias.
