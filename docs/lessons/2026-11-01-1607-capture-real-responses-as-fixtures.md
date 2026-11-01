---
id: 2026-11-01-1607-capture-real-responses-as-fixtures
title: "Test PCF logic against captured Dataverse responses, not hand-written ones"
applies_when: >
  writing Jest tests for a PCF control's pure logic that parses Dataverse Web API or
  retrieveMultipleRecords responses
rule: >
  When tests parse Dataverse responses, capture real ones from LowCode (with Prefer
  odata.include-annotations="*") into tests/fixtures and test against them, because hand-written
  fixtures encode guesses about the shape that 100% coverage then confirms.
lesson_type: heuristic
phase: testing
domain: [testing, pcf-controls]
tech: [jest, dataverse-web-api]
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
  evidence: "PR #71 (commit 0f83221) and PR #73 (commit 57bcd2e): controls/ChoiceCounts/tests/fixtures/aggregate-*.json, scripts/test-env/capture-choicecounts-fixtures.mjs"
  author:
related: [2026-11-01-1605-aggregate-response-shape]
proposed_tags: []
---

When a control's Jest tests parse Dataverse responses, a fixture captured from a real environment beats one written by hand, even if the tests are already at 100% coverage.

## What happened
ChoiceCounts' #53 logic had 147 tests at 100% coverage, all built on hand-written response rows. The fixtures included `@odata.etag` and `null` group values, and one test asserted that a count of `"1"` or `true` was valid.

The captured responses showed that blank groups have **no key**, Yes/No groups are **booleans**, counts are always numbers, and rows come in label order. The review fixes tightened the reader to match.

## What to do instead
- For each response shape the logic reads, run the real query once in `LowCode` with `Prefer: odata.include-annotations="*"`.
- Save the output as `tests/fixtures/<name>.json`, with a `_source` line and the query.
- Write a test that reads it.
- Keep the capture in a script (`scripts/test-env/capture-*.mjs`), so the fixtures can be refreshed after a platform change.

## When this does NOT apply
Error and edge cases a real environment can't produce on demand, such as the 50,000-row aggregate error. Hand-write those from Microsoft's documentation, and say so in the test.
