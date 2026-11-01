---
id: 2026-11-01-1607-fresh-eyes-review-before-merge
title: "Run a fresh-eyes review over a branch before merging; it finds what 100% coverage misses"
applies_when: >
  a branch with new scripts, controls or deployment docs passes its tests and CI and is about to be
  merged
rule: >
  When a branch is green and about to merge, run an independent review (a review subagent given the
  code, not your conclusions) and fix its findings first, because on this repo it found a
  deployment-breaking doc error and real parser bugs that the tests and CI had passed.
lesson_type: heuristic
phase: testing
domain: [agent-workflow]
tech: []
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
  evidence: "PR #66 review, fixed in commit 5de661f; ChoiceCounts folder review, fixed in commit 0f83221 (PR #71)"
  author:
related: [2026-11-01-1604-register-script-then-import-duplicates-steps]
proposed_tags: []
---

When a branch is green (tests at 100%, CI passing) and ready to merge, an independent review still finds things worth fixing first.

## What happened
- **PR #66** (WBCodeFYName registration): the review found that the README would have led to duplicated plug-in steps in dev. It also found that re-running the script didn't re-enable disabled steps, and that the configuration wasn't validated against the schema. All fixed before merge.
- **ChoiceCounts** (147 tests at 100%): the review found that the parser decoded `&constructor;` and `&__proto__;` as entities, accepted `&#0;`, didn't check names inside the fragment, and that a list of unmatched *Options to show* left the control blank. It also found a test asserting behaviour Dataverse never produces. All fixed in 0.1.1.

## What to do instead
- Brief the reviewer with the scope, the repo's standards (CLAUDE.md, README) and the brief. Ask for ranked findings, each with a failure scenario and a CONFIRMED or PLAUSIBLE verdict.
- Don't give it your own conclusions.
- Let the developer choose which findings to fix.
- Check each finding before acting: some are design questions, such as whether a failed refresh should keep the old counts.

## When this does NOT apply
Docs-only or version-only PRs, such as changelog dates.
