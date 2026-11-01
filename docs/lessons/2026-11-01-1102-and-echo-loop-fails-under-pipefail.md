---
id: 2026-11-01-1102-and-echo-loop-fails-under-pipefail
title: "A `[ -f ] && echo` loop fails a GitHub Actions step when the last test is false"
applies_when: >
  writing a for loop in a GitHub Actions run step that filters items with `[ test ] && echo`
  and pipes or captures its output
rule: >
  When a loop in a workflow step filters with a test, write `if [ test ]; then echo; fi`
  instead of `[ test ] && echo`, because Actions runs bash with -eo pipefail and a false
  test on the last iteration makes the loop, and so the step, exit 1.
lesson_type: pitfall
phase: implementation
domain: [ci]
tech: [github-actions]
scope: this-stack
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-10-31
  source: direct-experience
  evidence: "PR #62 (commit 160b513): .github/workflows/ci.yml line 28, plug-in detection uses `if [ -f ... ]; then echo; fi`"
  author:
related: []
proposed_tags: []
---

When a GitHub Actions step builds a list with `for ...; do [ -f x ] && echo "$n"; done | sort -u`, the step fails whenever the last item fails the test, even though the output is right.

## What happened
The CI change for plug-ins (#57) detects plug-in folders that have their csproj with a shell loop. Its first version used `[ -f "plugins/$n/$n/$n.csproj" ] && echo "$n"`. Tested locally under `bash -c 'set -eo pipefail; ...'`, a folder without a csproj in the last position failed the whole assignment. It was changed to `if ...; then ...; fi` before the PR was opened.

## Why it happened
A loop's exit status is that of its last command. A false `[ -f ]` makes `&&` return 1, so the loop returns 1. GitHub Actions runs `run:` steps with `bash -e -o pipefail`, so the pipeline into `sort` fails and `-e` stops the step. An `if` with a false condition returns 0.

## What to do instead
- Filter with `if [ ... ]; then echo ...; fi` inside loops in workflow steps.
- Test a detection snippet with `bash -c 'set -eo pipefail; ...'` against a tree where the last item doesn't match, and against one with no matching folder.

## How to recognise it early
A step that fails with exit code 1 and no error message, only on some combinations of changed folders.

## When this does NOT apply
Scripts run without `-e` or `pipefail`, or loops whose last command can't fail.
