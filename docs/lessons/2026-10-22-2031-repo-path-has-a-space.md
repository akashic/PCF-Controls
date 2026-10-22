---
id: 2026-10-22-2031-repo-path-has-a-space
title: Repo scripts break silently because the checkout path contains a space
applies_when: >
  writing a Node script in this repo that resolves its own location or checks whether it was run directly
rule: >
  When a repo script needs its own path, use `fileURLToPath(import.meta.url)` rather than `URL.pathname` or comparing URL strings, because the usual local checkout path (`…/PCF Controls`) contains a space and the comparison fails without an error.
lesson_type: pitfall
phase: implementation
domain: [ci, testing]
scope: this-project
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires: 
provenance:
  projects: [pcf-controls]
  date: 2026-10-22
  source: direct-experience
  evidence: "PR #16 (check:controls found 0 controls); PR #28 (direct-run guard); scripts/check-controls.mjs line 21"
  author:
related: []
proposed_tags: []
---

When a Node script in this repo builds paths from `new URL(..., import.meta.url).pathname` or compares `import.meta.url` with `process.argv[1]`, it misbehaves locally, because the checkout path contains a space.

## What happened
In PR #16, `npm run check:controls` printed `✓ 0 control(s)` even with a control present, and the PR fixed it as a "path-with-space" bug. PR #28 hit it again with a "run directly" guard in a test-environment script and switched to `fileURLToPath`.

## Why it happened
URL paths percent-encode spaces (`%20`); filesystem paths don't, so a path taken from a URL doesn't match the real folder. The mismatch fails quietly: the script finds nothing or does nothing, and still exits 0.

## What to do instead
- `const root = fileURLToPath(new URL("..", import.meta.url));` as in `scripts/check-controls.mjs`.
- Compare `fileURLToPath(import.meta.url)` with `path.resolve(process.argv[1])` for direct-run guards.

## How to recognise it early
A check that reports zero items, or a script that exits 0 having printed nothing, only on a local machine.

## When this does NOT apply
CI, where the checkout path has no space, which is why CI doesn't catch it.
